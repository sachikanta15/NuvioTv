import type { StremioStream } from "@/types";
import { infoHashFromStream, isMagnet, isTorrentUrl } from "./streams";
import type { DebridProvider } from "@/store/debrid";

const RD_API = "https://api.real-debrid.com/rest/1.0";
const PM_API = "https://www.premiumize.me/api";

export class DebridError extends Error {
  constructor(
    message: string,
    readonly provider: DebridProvider,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DebridError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Builds a magnet URI from a stream's info hash or existing magnet URL. */
export function magnetForStream(stream: StremioStream): string | null {
  const direct = stream.url ?? stream.externalUrl ?? "";
  if (isMagnet(direct)) return direct;
  if (isTorrentUrl(direct)) {
    const hash = infoHashFromStream(stream);
    if (hash) return `magnet:?xt=urn:btih:${hash}`;
  }
  const hash = infoHashFromStream(stream);
  if (!hash) return null;
  const name = stream.title ?? stream.name ?? stream.description ?? "Nuvio";
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name.slice(0, 120))}`;
}

async function readError(response: Response, provider: DebridProvider): Promise<DebridError> {
  let message = `${provider === "realdebrid" ? "Real-Debrid" : "Premiumize"} request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    if (payload?.error) message = payload.error;
    else if (payload?.message) message = payload.message;
  } catch {
    // Keep the status message.
  }
  return new DebridError(message, provider, response.status);
}

/* --------------------------------- Real-Debrid -------------------------------- */

async function rdRequest<T>(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${RD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw await readError(response, "realdebrid");
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

interface RdTorrentInfo {
  id: string;
  status: string;
  links: string[];
  filename?: string;
}

async function rdUnrestrict(apiKey: string, link: string): Promise<string> {
  const body = new URLSearchParams({ link });
  const payload = await rdRequest<{ download?: string }>("/unrestrict/link", apiKey, {
    method: "POST",
    body,
  });
  if (!payload?.download) throw new DebridError("Real-Debrid did not return a download link.", "realdebrid");
  return payload.download;
}

function pickLink(links: string[], fileIdx?: number | null): string | null {
  if (links.length === 0) return null;
  if (fileIdx != null && links[fileIdx]) return links[fileIdx];
  return links[0];
}

export async function resolveRealDebrid(
  apiKey: string,
  magnet: string,
  fileIdx?: number | null,
): Promise<string> {
  const added = await rdRequest<{ id: string }>("/torrents/addMagnet", apiKey, {
    method: "POST",
    body: new URLSearchParams({ magnet }),
  });
  if (!added?.id) throw new DebridError("Real-Debrid rejected the magnet.", "realdebrid");

  const id = added.id;
  try {
    const deadline = Date.now() + 75_000;
    let selected = false;
    while (Date.now() < deadline) {
      const info = await rdRequest<RdTorrentInfo>(`/torrents/info/${id}`, apiKey);
      if (info.status === "downloaded" && info.links?.length) {
        const link = pickLink(info.links, fileIdx);
        if (!link) throw new DebridError("No downloadable file in this torrent.", "realdebrid");
        return await rdUnrestrict(apiKey, link);
      }
      if (info.status === "waiting_files_selection" && !selected) {
        await rdRequest<void>(`/torrents/selectFiles/${id}`, apiKey, {
          method: "POST",
          body: new URLSearchParams({ files: "all" }),
        });
        selected = true;
      }
      if (["error", "dead", "magnet_error", "virus"].includes(info.status)) {
        throw new DebridError(`Real-Debrid could not download this torrent (${info.status}).`, "realdebrid");
      }
      await sleep(2_000);
    }
    throw new DebridError("Real-Debrid timed out while preparing the torrent.", "realdebrid");
  } finally {
    // Leave the torrent in the account so a retry is instant.
  }
}

/* --------------------------------- Premiumize --------------------------------- */

interface PmDirectDlResponse {
  status: string;
  message?: string;
  content?: { link: string; path?: string; size?: number }[];
}

export async function resolvePremiumize(
  apiKey: string,
  magnet: string,
  fileIdx?: number | null,
): Promise<string> {
  const body = new URLSearchParams({ apikey: apiKey, src: magnet });
  const response = await fetch(`${PM_API}/transfer/directdl`, { method: "POST", body });
  if (!response.ok) throw await readError(response, "premiumize");
  const payload = (await response.json()) as PmDirectDlResponse;
  if (payload.status !== "success" || !payload.content?.length) {
    throw new DebridError(
      payload.message ?? "Premiumize could not resolve this torrent.",
      "premiumize",
    );
  }
  const content = [...payload.content];
  const chosen =
    fileIdx != null && content[fileIdx]
      ? content[fileIdx]
      : content.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (!chosen?.link) throw new DebridError("No downloadable file in this torrent.", "premiumize");
  return chosen.link;
}

/* ---------------------------------- Public API -------------------------------- */

export async function resolveDebridStream(
  provider: DebridProvider,
  apiKey: string,
  stream: StremioStream,
): Promise<string> {
  const magnet = magnetForStream(stream);
  if (!magnet) throw new DebridError("This source has no usable magnet link.", provider);
  if (provider === "realdebrid") {
    return resolveRealDebrid(apiKey, magnet, stream.fileIdx ?? null);
  }
  if (provider === "premiumize") {
    return resolvePremiumize(apiKey, magnet, stream.fileIdx ?? null);
  }
  throw new DebridError("No debrid provider is configured.", provider);
}

export interface DebridAccount {
  username: string;
  premium?: boolean;
}

export async function testDebridConnection(
  provider: DebridProvider,
  apiKey: string,
): Promise<DebridAccount> {
  if (provider === "realdebrid") {
    const response = await fetch(`${RD_API}/user`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw await readError(response, provider);
    const payload = (await response.json()) as {
      username?: string;
      type?: string;
      premium?: number;
    };
    return {
      username: payload.username ?? "Real-Debrid user",
      premium: payload.type === "premium" || payload.premium === 1,
    };
  }
  if (provider === "premiumize") {
    const response = await fetch(`${PM_API}/account/info?apikey=${encodeURIComponent(apiKey)}`);
    if (!response.ok) throw await readError(response, provider);
    const payload = (await response.json()) as {
      status?: string;
      customer_id?: string;
      premium_until?: number;
    };
    if (payload.status !== "success") {
      throw new DebridError("Premiumize rejected that API key.", provider);
    }
    return {
      username: payload.customer_id ? `Customer ${payload.customer_id}` : "Premiumize user",
      premium: (payload.premium_until ?? 0) * 1000 > Date.now(),
    };
  }
  throw new DebridError("Choose a debrid provider first.", provider);
}
