/**
 * JioTV direct playback in the browser.
 *
 * The Worker's `/jiotv-api` pipeline decrypts CENC/AES-CTR DASH segments
 * server-side — but JioTV's CDN geo-blocks Cloudflare's datacenter IPs (the
 * Worker egress), so the deployed Worker cannot reach the CDN at all.
 * The CDN however allows cross-origin browser requests, so the exact same
 * decrypt pipeline runs client-side instead:
 *
 *  - hls.js gets a custom loader that serves the `/jiotv-api` routes,
 *  - MPDs and segments are fetched straight from the JioTV CDN, and
 *  - decryption happens in the browser via WebCrypto AES-CTR.
 *
 * The parsing/decryption logic is not duplicated: the pure functions are
 * imported directly from the Worker module (see `worker/jiotv-direct.js`).
 */

import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderContext,
  LoaderStats,
} from "hls.js";
import {
  buildMediaPlaylist,
  decryptSegment,
  hexToBytes,
  importKey,
  normalizeKey,
  parseMpd,
  sanitizeInitSegment,
  sanitizeMediaSegment,
} from "../../worker/jiotv-direct.js";
import type { KeyMaterial } from "../../worker/jiotv-direct.js";

const PREFIX = "/jiotv-api";

/**
 * A freshly downloaded MPD is only worth caching for a moment: hls.js first
 * loads the master playlist and then every level's media playlist (in
 * parallel), and they all parse the same MPD.
 */
const MPD_CACHE_MS = 1000;

function createStats(): LoaderStats {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  };
}

/** Read key material from query params (same scheme as the Worker). */
function readKeyMaterial(url: URL): KeyMaterial | null {
  const key = url.searchParams.get("k");
  if (key) return { key };

  const keysParam = url.searchParams.get("keys");
  if (keysParam) {
    try {
      const parsed = JSON.parse(keysParam) as Record<string, string>;
      const keys: Record<string, string> = {};
      for (const [kid, value] of Object.entries(parsed)) {
        if (typeof value === "string") {
          keys[kid.replace(/-/g, "").toLowerCase()] = value;
        }
      }
      if (Object.keys(keys).length > 0) return { keys };
    } catch {
      /* not JSON; fall through to kid */
    }
  }

  const kid = url.searchParams.get("kid");
  return kid ? { kid } : null;
}

/** Pick the key matching a representation's KID (multi-key channels). */
function keyForRepresentation(
  rep: { kid?: string | null },
  keyMaterial: KeyMaterial | null,
  fallbackKid?: string | null,
): string | null {
  if (!keyMaterial) return null;
  if ("key" in keyMaterial) return keyMaterial.key;
  if ("keys" in keyMaterial) {
    const kid = (rep.kid || fallbackKid || "")
      .replace(/-/g, "")
      .toLowerCase();
    return kid ? keyMaterial.keys[kid] || null : null;
  }
  return null;
}

/** Format the response error of a failed CDN fetch like hls.js loaders do. */
function fetchError(response: Response) {
  return { code: response.status, text: response.statusText || "http error" };
}

/** Raise an error inside the loader pipeline so `run()` routes it to hls.js. */
class JioTvLoaderError extends Error {
  readonly info: { code: number; text: string };

  constructor(info: { code: number; text: string }) {
    super(info.text);
    this.info = info;
  }
}

class JioTvDirectLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats: LoaderStats = createStats();

  private readonly origin: string;
  private readonly mpdCache = new Map<string, { at: number; text: string }>();
  private readonly keys = new Map<string, Promise<CryptoKey>>();
  private controller: AbortController | null = null;

  constructor(_config?: HlsConfig) {
    this.origin =
      typeof location !== "undefined" ? location.origin : "http://localhost";
  }

  destroy() {
    this.abort();
  }

  abort() {
    this.controller?.abort();
    this.controller = null;
    this.stats.aborted = true;
  }

  load(
    context: LoaderContext,
    _config: never,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.context = context;
    const controller = new AbortController();
    this.controller = controller;
    this.stats = createStats();
    this.stats.loading.start = performance.now();
    void this.run(context, callbacks).catch((error) => {
      // hls.js routinely aborts fragment loads (level switches, playlist
      // refreshes). `abort()` clears `this.controller`, so check the local
      // controller — otherwise an expected abort is reported as a fatal
      // network error.
      if (controller.signal.aborted) return;
      const info =
        error instanceof JioTvLoaderError
          ? error.info
          : {
              code: 0,
              text: error instanceof Error ? error.message : String(error),
            };
      callbacks.onError(info, context, null, this.stats);
    });
  }

  private async run(
    context: LoaderContext,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const url = new URL(context.url, this.origin);
    if (!url.pathname.startsWith(`${PREFIX}/`)) {
      // Not a JioTV direct route: plain passthrough fetch.
      await this.fetchPassthrough(url, callbacks);
      return;
    }

    const route = url.pathname.slice(PREFIX.length);
    switch (route) {
      case "/playlist":
      case "/playlist.m3u8":
        await this.loadMaster(url, callbacks);
        return;
      case "/media":
        await this.loadMedia(url, callbacks);
        return;
      case "/init":
      case "/segment":
        await this.loadSegment(url, callbacks);
        return;
      default:
        await this.fetchPassthrough(url, callbacks);
        return;
    }
  }

  private signal(): AbortSignal | undefined {
    return this.controller?.signal;
  }

  /** Fetch the MPD (deduplicated for parallel playlist loads). */
  private async fetchMpd(mpdUrl: URL | string): Promise<string> {
    const href = mpdUrl.toString();
    const cached = this.mpdCache.get(href);
    if (cached && Date.now() - cached.at < MPD_CACHE_MS) return cached.text;

    const response = await fetch(href, {
      headers: { accept: "*/*" },
      signal: this.signal(),
    });
    if (!response.ok) {
      throw new JioTvLoaderError(fetchError(response));
    }
    const text = await response.text();
    this.mpdCache.set(href, { at: Date.now(), text });
    return text;
  }

  /**
   * Master playlist: fetch the channel's MPD straight from the CDN, parse it,
   * and translate it into an HLS master that hls.js re-routes through this
   * loader (`/jiotv-api/media?…` URLs point back at the app origin).
   */
  private async loadMaster(
    url: URL,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const mpdUrl = url.searchParams.get("u");
    if (!mpdUrl) throw new JioTvLoaderError({ code: 400, text: "missing-u" });
    const keyMaterial = readKeyMaterial(url);

    const mpd = parseMpd(await this.fetchMpd(mpdUrl));
    if (mpd.representations.length === 0) {
      throw new JioTvLoaderError({ code: 422, text: "no-representations" });
    }

    const playlistReps = mpd.representations.filter((rep) => rep.template?.media);
    const videoReps = playlistReps.filter((rep) => !rep.isAudio);
    const audioReps = playlistReps.filter((rep) => rep.isAudio);
    // When both audio and video representations exist, expose audio as a
    // separate rendition group instead of a (bogus) video variant.
    const variantReps = videoReps.length > 0 ? videoReps : playlistReps;

    const mediaUrl = (rep: { id: string; kid?: string | null }) => {
      const params = new URLSearchParams({ u: mpdUrl, r: rep.id });
      const key = keyForRepresentation(rep, keyMaterial, mpd.kid);
      if (key) params.set("k", key);
      else if (keyMaterial && "kid" in keyMaterial)
        params.set("kid", keyMaterial.kid);
      return `${this.origin}${PREFIX}/media?${params.toString()}`;
    };

    const lines = ["#EXTM3U", "#EXT-X-VERSION:7"];
    if (videoReps.length > 0 && audioReps.length > 0) {
      for (const rep of audioReps) {
        lines.push(
          `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio ${rep.id}",DEFAULT=YES,AUTOSELECT=YES,URI="${mediaUrl(rep)}"`,
        );
      }
    }
    for (const rep of variantReps) {
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${rep.bandwidth || 0}${
          audioReps.length > 0 && videoReps.length > 0 ? ',AUDIO="audio"' : ""
        }`,
      );
      lines.push(mediaUrl(rep));
    }
    if (lines.length <= 2) {
      throw new JioTvLoaderError({ code: 422, text: "no-playable-representations" });
    }

    this.deliverText(lines.join("\n"), callbacks);
  }

  /**
   * Level/audio media playlist: route through the Worker module's
   * `buildMediaPlaylist`, which expands the DASH SegmentTemplate into
   * `/jiotv-api/segment?…` (and `#EXT-X-MAP` → `/jiotv-api/init?…`) URLs.
   */
  private async loadMedia(
    url: URL,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const mpdUrl = url.searchParams.get("u");
    const representationId = url.searchParams.get("r");
    if (!mpdUrl || !representationId) {
      throw new JioTvLoaderError({ code: 400, text: "missing-params" });
    }
    const keyMaterial = readKeyMaterial(url);

    const mpd = parseMpd(await this.fetchMpd(mpdUrl));
    const rep = mpd.representations.find((item) => item.id === representationId);
    if (!rep) {
      throw new JioTvLoaderError({
        code: 404,
        text: "representation-not-found",
      });
    }

    rep.isLive = mpd.isLive;
    const key = keyForRepresentation(rep, keyMaterial, mpd.kid);
    const effectiveKey = key
      ? { key }
      : keyMaterial && "kid" in keyMaterial
        ? { kid: keyMaterial.kid }
        : null;
    const playlist = buildMediaPlaylist(this.origin, mpdUrl, rep, effectiveKey);
    if (!playlist) {
      throw new JioTvLoaderError({
        code: 422,
        text: "representation-not-supported",
      });
    }

    this.deliverText(playlist, callbacks);
  }

  /**
   * Binary payload (`/init` or `/segment`): fetch the source URL from the
   * JioTV CDN and, when key material is present, AES-CTR decrypt it in place.
   */
  private async loadSegment(
    url: URL,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const target = url.searchParams.get("u");
    if (!target) throw new JioTvLoaderError({ code: 400, text: "missing-u" });

    const response = await fetch(target, {
      headers: { accept: "*/*" },
      signal: this.signal(),
    });
    if (!response.ok) {
      throw new JioTvLoaderError(fetchError(response));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());

    // Init segments still declare `encv`/`enca` sample entries; clear the
    // encryption metadata so hls.js sees `avc1`/`mp4a` tracks.
    if (url.pathname.endsWith("/init")) {
      this.deliverBytes(sanitizeInitSegment(bytes), callbacks);
      return;
    }

    // `k` carries the content key itself (the resolver's channel API exposes
    // it as a clearkey). `kid` maps to a key resolver template on the Worker,
    // which the browser does not have — segments stay encrypted and, without
    // the embed fallback, unplayable.
    const key = await this.importContentKey(url.searchParams.get("k"));
    if (key) {
      await decryptSegment(bytes, key, globalThis.crypto);
      this.deliverBytes(sanitizeMediaSegment(bytes), callbacks);
      return;
    }

    this.deliverBytes(bytes, callbacks);
  }

  /** Import and cache an AES-128 content key from its hex/base64 form. */
  private async importContentKey(
    value: string | null,
  ): Promise<CryptoKey | null> {
    if (!value) return null;
    const hex = normalizeKey(value);
    if (!hex) return null;
    const cached = this.keys.get(hex);
    if (cached) return cached;
    const promise = importKey(globalThis.crypto, hexToBytes(hex));
    this.keys.set(hex, promise);
    return promise;
  }

  /** Plain fetch for URLs outside the `/jiotv-api` namespace. */
  private async fetchPassthrough(
    url: URL,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const response = await fetch(url, {
      headers: this.context?.headers,
      signal: this.signal(),
    });
    if (!response.ok) {
      throw new JioTvLoaderError(fetchError(response));
    }

    const contentType = response.headers.get("content-type") || "";
    const isText =
      /mpegurl|dash|text\/|json|xml/.test(contentType) &&
      contentType.indexOf("mp4") === -1;
    if (isText) {
      this.deliverText(await response.text(), callbacks);
    } else {
      this.deliverBytes(new Uint8Array(await response.arrayBuffer()), callbacks);
    }
  }

  private deliverText(
    text: string,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    if (this.controller?.signal.aborted) return;
    this.stats.loading.end = performance.now();
    this.stats.loaded = text.length;
    callbacks.onSuccess(
      { url: this.context?.url || "", data: text, code: 200 },
      this.stats,
      this.context as LoaderContext,
      null,
    );
  }

  private deliverBytes(
    bytes: Uint8Array,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    if (this.controller?.signal.aborted) return;
    // hls.js may keep this buffer; hand over a copy we own entirely.
    const data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    this.stats.loading.end = performance.now();
    this.stats.loaded = data.byteLength;
    callbacks.onSuccess(
      { url: this.context?.url || "", data, code: 200 },
      this.stats,
      this.context as LoaderContext,
      null,
    );
  }
}

export { JioTvDirectLoader, PREFIX };

/** True when a URL is served through the in-app JioTV direct pipeline. */
export function isJioTvDirectSource(url: string): boolean {
  if (url.startsWith(PREFIX)) return true;
  try {
    return new URL(url).pathname.startsWith(PREFIX);
  } catch {
    return false;
  }
}
