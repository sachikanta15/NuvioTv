/**
 * JioTV direct-playback pipeline (the README PoC, implemented).
 *
 * JioTV live streams are DASH (.mpd) with CENC AES-CTR encryption:
 *   - the MPD advertises `cenc:default_KID` inside its <ContentProtection>
 *     element,
 *   - each media segment carries a `senc` box with an 8-byte IV per sample,
 *   - the matching content key is served by the resolver's `keyid.php`
 *     endpoint (the KID matches the MPD's `cenc:default_KID`).
 *
 * So the Worker can fetch a segment, look up the key for the KID, AES-CTR
 * decrypt every sample and hand the browser a plain fMP4 segment. Wrapping
 * the decrypted segments in a small HLS playlist means the existing hls.js
 * client plays the channel natively, with no iframe and no third-party
 * player UI.
 *
 * Routes (all under the `/jiotv-api` prefix):
 *   - `GET /playlist.m3u8?u=<encoded mpd url>&k=<hex content key>`
 *       DASH -> HLS master playlist (one variant per representation).
 *   - `GET /media?u=<mpd>&r=<representation id>&k=<hex content key>`
 *       HLS media playlist with a live sliding window.
 *   - `GET /init?u=<init url>`
 *       Passthrough of the (clear) DASH init segment.
 *   - `GET /segment?u=<segment url>&k=<hex content key>`
 *       Encrypted segment fetched, decrypted with the key, served clear.
 *
 * The content key comes from the resolver's channel API
 * (`/api/public/channels/{id}` exposes it as a clearkey alongside the MPD
 * URL) and is forwarded by the frontend via the `k` query param. A KID can
 * be passed via `kid` instead; it is then resolved against the
 * `JIOTV_KEY_TEMPLATE` env var (`{kid}` is replaced with the KID), whose
 * response may be a bare hex/base64 key, or JSON containing one.
 */

const PREFIX = "/jiotv-api";

/** Upstream JioTV directory/detail resolver (same one the web app uses). */
const RESOLVER_BASE = "https://livetgtv.lovable.app";
const RESOLVE_CACHE_TTL_MS = 10 * 60 * 1000;
const resolveCache = new Map();

/**
 * Number of segments kept in the live HLS window. Small enough that the
 * window is always fresh for a live edge, big enough to smooth buffering.
 */
const LIVE_WINDOW_SEGMENTS = 6;

/** Cache content keys for a little while; they are stable per KID. */
const KEY_CACHE_TTL_MS = 10 * 60 * 1000;
const keyCache = new Map();

/* ---------------------------------------------------------------------------
 * Small utilities
 * ------------------------------------------------------------------------- */

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Regular (non-full) box: [size:4][type:4]. Size 0 -> "to end", size 1 -> 64-bit. */
function boxHeader(view, offset, end) {
  if (offset + 8 > end) return null;
  const size = view.getUint32(offset);
  let payloadStart = offset + 8;
  let boxEnd = offset + size;
  if (size === 1) {
    if (offset + 16 > end) return null;
    boxEnd = Number(view.getBigUint64(offset + 8));
    payloadStart = offset + 16;
  } else if (size === 0) {
    boxEnd = end;
  }
  if (boxEnd <= offset || boxEnd > end) return null;
  let type = "";
  for (let i = 0; i < 4; i++) {
    type += String.fromCharCode(view.getUint8(offset + 4 + i));
  }
  return { type, payloadStart, boxEnd };
}

function* iterBoxes(view, start, end) {
  let offset = start;
  while (offset < end - 8) {
    const box = boxHeader(view, offset, end);
    if (!box) break;
    yield { ...box, start: offset };
    if (box.boxEnd <= offset) break;
    offset = box.boxEnd;
  }
}

/* ---------------------------------------------------------------------------
 * Clear init segments: strip CENC sample-entry encryption metadata.
 *
 * The decrypted media fragments are clear fMP4, but the DASH init segment
 * still declares `encv`/`enca` sample entries with `sinf`/`pssh` boxes.
 * hls.js only recognises `avc1`/`mp4a` entries, so it would parse the init
 * and then report "Found no media" for every fragment. Rewriting the sample
 * entries (and dropping the now-useless `sinf`/`pssh` boxes) makes the init
 * a normal clear fMP4 init.
 * ------------------------------------------------------------------------- */

const PURE_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "sinf", "schi"]);
/** Bytes after the box header before a sample entry's child boxes. */
const SAMPLE_ENTRY_HEADER = { encv: 78, enca: 28 };

function childStartFor(type, payloadStart) {
  if (PURE_CONTAINERS.has(type)) return payloadStart;
  if (type === "stsd") return payloadStart + 8; // version/flags + entry_count
  if (type === "encv" || type === "enca") {
    return payloadStart + SAMPLE_ENTRY_HEADER[type];
  }
  return null;
}

function parseBoxTree(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  for (const box of iterBoxes(view, start, end)) {
    const childStart = childStartFor(box.type, box.payloadStart);
    const children =
      childStart !== null && childStart < box.boxEnd
        ? parseBoxTree(bytes, childStart, box.boxEnd)
        : null;
    boxes.push({ ...box, children });
  }
  return boxes;
}

function boxTypeAt(view, offset) {
  let type = "";
  for (let i = 0; i < 4; i++) type += String.fromCharCode(view.getUint8(offset + i));
  return type;
}

function sanitizeBoxTree(boxes, view) {
  for (const box of boxes) {
    if (box.type === "encv" || box.type === "enca") {
      const sinf = box.children?.find((child) => child.type === "sinf");
      const frma = sinf?.children?.find((child) => child.type === "frma");
      if (frma && frma.boxEnd - frma.payloadStart >= 4) {
        const original = boxTypeAt(view, frma.payloadStart);
        if (/^[A-Za-z0-9]{4}$/.test(original)) box.originalType = original;
      }
      if (box.children) {
        box.children = box.children.filter(
          (child) => child.type !== "sinf" && child.type !== "pssh",
        );
      }
    }
    if (box.children) {
      // Encryption metadata is useless once the samples are clear.
      box.children = box.children.filter((child) => child.type !== "pssh");
      sanitizeBoxTree(box.children, view);
    }
  }
}

function makeBox(type, payload) {
  const size = 8 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xff;
  out.set(payload, 8);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function serializeBoxTree(boxes, sourceBytes) {
  const parts = [];
  for (const box of boxes) {
    if (box.type === "pssh" || box.type === "sinf") continue;

    let payload;
    if (box.type === "stsd") {
      const fixed = sourceBytes.slice(box.payloadStart, box.payloadStart + 8);
      payload = concatBytes([
        fixed,
        serializeBoxTree(box.children || [], sourceBytes),
      ]);
    } else if (box.type === "encv" || box.type === "enca") {
      const fixedEnd = box.payloadStart + SAMPLE_ENTRY_HEADER[box.type];
      const fixed = sourceBytes.slice(box.payloadStart, fixedEnd);
      const rest = serializeBoxTree(box.children || [], sourceBytes);
      payload = concatBytes([fixed, rest]);
      parts.push(makeBox(box.originalType || box.type, payload));
      continue;
    } else if (PURE_CONTAINERS.has(box.type)) {
      payload = serializeBoxTree(box.children || [], sourceBytes);
    } else {
      payload = sourceBytes.slice(box.payloadStart, box.boxEnd);
    }
    parts.push(makeBox(box.type, payload));
  }
  return concatBytes(parts);
}

/**
 * Convert a CENC init segment into a clear fMP4 init segment:
 * `encv`/`enca` sample entries become `avc1`/`mp4a`, and `sinf`/`pssh`
 * encryption metadata is removed. Returns the input untouched when no
 * encryption metadata is present.
 */
function sanitizeInitSegment(bytes) {
  if (!bytes || bytes.byteLength < 16) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tree = parseBoxTree(bytes, 0, bytes.byteLength);
  let changed = false;
  const mark = (boxes) => {
    for (const box of boxes) {
      if (box.type === "encv" || box.type === "enca" || box.type === "pssh" || box.type === "sinf") {
        changed = true;
      }
      if (box.children) mark(box.children);
    }
  };
  mark(tree);
  if (!changed) return bytes;

  sanitizeBoxTree(tree, view);
  return serializeBoxTree(tree, bytes);
}

/**
 * Decrypted fragments keep their `senc`/`saiz`/`saio`/`sbgp`/`sgpd` boxes.
 * MSE's MP4 parser treats a fragment with `senc` as still encrypted and
 * rejects the append (`CHUNK_DEMUXER_ERROR_APPEND_FAILED`). Renaming those
 * boxes to `free` in place makes the fragment a normal clear fMP4 fragment
 * without changing any box size or the `trun` data offsets.
 */
const CENC_FRAGMENT_AUX_TYPES = new Set(["senc", "saiz", "saio", "sbgp", "sgpd"]);

function sanitizeMediaSegment(bytes) {
  if (!bytes || bytes.byteLength < 16) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const copy = bytes.slice();
  let changed = false;

  const walk = (start, end) => {
    let offset = start;
    while (offset + 8 <= end) {
      const box = boxHeader(view, offset, end);
      if (!box) break;
      if (CENC_FRAGMENT_AUX_TYPES.has(box.type)) {
        copy[offset + 4] = 0x66; // f
        copy[offset + 5] = 0x72; // r
        copy[offset + 6] = 0x65; // e
        copy[offset + 7] = 0x65; // e
        changed = true;
      } else if (box.type === "moof" || box.type === "traf") {
        walk(box.payloadStart, box.boxEnd);
      }
      offset = box.boxEnd;
    }
  };

  walk(0, copy.byteLength);
  return changed ? copy : bytes;
}

/* ---------------------------------------------------------------------------
 * ISO-BMFF fragment parsing: locate `senc` and per-sample sizes.
 * ------------------------------------------------------------------------- */

/**
 * Parse the `senc` box payload (ISO/IEC 23001-7 §7.6).
 *
 * @param {DataView} view  view over the whole segment
 * @param {number} start  payload start of the `senc` box
 * @param {number} end  end of the `senc` box
 * @returns {Array<{iv: Uint8Array, subsamples: Array<{clear:number, protected:number}>}>}
 */
function parseSenc(view, start, end) {
  // version(1) + flags(3); flags & 0x01 -> algorithm ID + per-sample IV size
  // are present, flags & 0x02 -> subsample entries follow each IV
  // (ISO/IEC 23001-7 §7.6). Every entry has an IV: full-sample encryption
  // (audio) uses the same 8-byte default as subsample encryption (video).
  const flags = view.getUint32(start) & 0x00ffffff;
  const hasSubsamples = (flags & 0x02) !== 0;
  let ivSize = 8; // CENC default per-sample IV size
  let offset = start + 4;
  if ((flags & 0x01) !== 0) {
    offset += 3; // algorithm ID
    ivSize = view.getUint8(offset);
    offset += 1;
  }
  const sampleCount = view.getUint32(offset);
  offset += 4;
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    let iv = null;
    const subsamples = [];
    if (ivSize > 0) {
      iv = new Uint8Array(ivSize);
      for (let j = 0; j < ivSize; j++) iv[j] = view.getUint8(offset + j);
      offset += ivSize;
    }
    if (hasSubsamples) {
      const count = view.getUint16(offset);
      offset += 2;
      for (let j = 0; j < count; j++) {
        subsamples.push({
          clear: view.getUint16(offset),
          protected: view.getUint32(offset + 2),
        });
        offset += 6;
      }
    }
    if (iv) samples.push({ iv, subsamples });
  }
  return samples;
}

/**
 * Parse one `moof` box and return the CENC-relevant pieces: the `senc`
 * entries plus the `trun` sample sizes (needed to know where each senc
 * entry's data begins inside `mdat`).
 */
function parseMoof(view, moofStart, moofEnd) {
  let senc = null;
  let trunSampleSizes = null;

  // Start after the moof header so we visit its `traf` children.
  for (const traf of iterBoxes(view, moofStart + 8, moofEnd)) {
    if (traf.type !== "traf") continue;
    for (const box of iterBoxes(view, traf.payloadStart, traf.boxEnd)) {
      if (box.type === "senc" && !senc) {
        senc = parseSenc(view, box.payloadStart, box.boxEnd);
      } else if (box.type === "trun" && !trunSampleSizes) {
        // [size:4][type:4] then [version:1][flags:3] then [sample_count:4].
        const flags = view.getUint32(box.payloadStart) & 0x00ffffff;
        const sampleCount = view.getUint32(box.payloadStart + 4);
        let offset = box.payloadStart + 8;
        if ((flags & 0x01) !== 0) offset += 4; // data_offset
        if ((flags & 0x04) !== 0) offset += 4; // first_sample_flags
        const sizes = [];
        for (let i = 0; i < sampleCount; i++) {
          if ((flags & 0x100) !== 0) offset += 4; // sample_duration
          if ((flags & 0x200) !== 0) {
            sizes.push(view.getUint32(offset));
            offset += 4; // sample_size
          }
          if ((flags & 0x400) !== 0) offset += 4; // sample_flags
          if ((flags & 0x800) !== 0) offset += 4; // sample_composition_time
        }
        if (sizes.length === sampleCount) trunSampleSizes = sizes;
      }
    }
  }
  return { senc, trunSampleSizes };
}

/* ---------------------------------------------------------------------------
 * AES-CTR decryption
 * ------------------------------------------------------------------------- */

/** Expand an 8-byte CENC IV into a 16-byte big-endian AES-CTR counter. */
function cencCounter(iv8) {
  const counter = new Uint8Array(16);
  counter.set(iv8, 0);
  return counter;
}

/** Add `blocks` to the big-endian 16-byte counter. */
function incrementCounter(counter, blocks) {
  const copy = new Uint8Array(counter);
  let carry = blocks;
  for (let i = 7; i >= 0 && carry > 0; i--) {
    const value = copy[i] + (carry & 0xff);
    carry = (carry >>> 8) + (value > 0xff ? 1 : 0);
    copy[i] = value & 0xff;
    if (value <= 0xff && carry === 0) break;
  }
  return copy;
}

/**
 * Decrypt one sample in place using CENC AES-CTR semantics: subsample clear
 * bytes do not consume keystream blocks; protected bytes continue the
 * sample's keystream from the sample IV.
 */
async function decryptSample(
  bytes,
  sampleStart,
  sampleLength,
  iv8,
  key,
  subsamples,
  cryptoRef,
) {
  const base = cencCounter(iv8);

  if (subsamples.length === 0) {
    const stream = await ctrKeystream(cryptoRef, key, base, 0, sampleLength);
    for (let i = 0; i < sampleLength; i++) {
      bytes[sampleStart + i] ^= stream[i];
    }
    return;
  }

  // Walk the subsample map, tracking how many keystream blocks are consumed
  // so each protected region resumes the sample's keystream correctly.
  let blocksConsumed = 0;
  let sampleOffset = 0;

  for (const { clear, protected: protectedLength } of subsamples) {
    sampleOffset += clear;
    if (protectedLength === 0) continue;

    const stream = await ctrKeystream(
      cryptoRef,
      key,
      base,
      blocksConsumed,
      protectedLength,
    );
    for (let i = 0; i < protectedLength; i++) {
      bytes[sampleStart + sampleOffset + i] ^= stream[i];
    }
    sampleOffset += protectedLength;
    blocksConsumed += Math.ceil(protectedLength / 16);
  }
}

/** Locate every top-level `moof`/`mdat` pair and decrypt the samples inside. */
async function decryptSegment(bytes, key, cryptoRef) {
  if (!key) return; // clear content; nothing to decrypt

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (const box of iterBoxes(view, 0, bytes.length)) {
    if (box.type !== "moof") continue;

    const { senc, trunSampleSizes } = parseMoof(view, box.start, box.boxEnd);
    if (!senc || senc.length === 0) continue;

    // The `mdat` immediately following this `moof` holds the samples.
    let mdat = null;
    let cursor = box.boxEnd;
    while (cursor < bytes.length - 8) {
      const candidate = boxHeader(view, cursor, bytes.length);
      if (!candidate) break;
      if (candidate.type === "mdat") {
        mdat = candidate;
        break;
      }
      cursor = candidate.boxEnd;
    }
    if (!mdat) continue;

    if (!trunSampleSizes || trunSampleSizes.length !== senc.length) {
      // Unknown per-sample sizes: treat the whole `mdat` as one sample.
      const [entry] = senc;
      await decryptSample(
        bytes,
        mdat.payloadStart,
        mdat.boxEnd - mdat.payloadStart,
        entry.iv,
        key,
        entry.subsamples,
        cryptoRef,
      );
      continue;
    }

    let offset = mdat.payloadStart;
    for (let i = 0; i < senc.length; i++) {
      const entry = senc[i];
      const size = trunSampleSizes[i];
      if (!size) continue;
      await decryptSample(
        bytes,
        offset,
        size,
        entry.iv,
        key,
        entry.subsamples,
        cryptoRef,
      );
      offset += size;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Key resolution
 * ------------------------------------------------------------------------- */

/** Normalize a resolver response (hex string, 0x-prefixed, or JSON value). */
function normalizeKey(value) {
  const trimmed = String(value).trim();
  if (/^(?:0[xX])?[0-9a-fA-F]{32}$/.test(trimmed)) {
    return trimmed.replace(/^0[xX]/, "").toLowerCase();
  }
  try {
    const decoded = globalThis.atob(trimmed);
    if (decoded.length === 16) {
      return Array.from(decoded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* not base64; ignore */
  }
  return null;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Fetch (and cache) the content key for a KID from the resolver endpoint. */
async function resolveKey(kid, template) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.at < KEY_CACHE_TTL_MS) return cached.key;

  const url = template.replace("{kid}", kid);
  const response = await fetch(url, {
    headers: { accept: "application/json,text/plain,*/*" },
  });
  if (!response.ok) {
    throw new Error(`Key resolver returned HTTP ${response.status}`);
  }
  const body = await response.text();

  // The resolver may answer with a bare hex key or JSON containing one.
  let hex = normalizeKey(body);
  if (!hex) {
    try {
      const parsed = JSON.parse(body);
      for (const field of ["key", "k", "content_key", "key_hex"]) {
        if (typeof parsed[field] === "string") {
          hex = normalizeKey(parsed[field]);
          if (hex) break;
        }
      }
    } catch {
      /* not JSON; normalizeKey already tried the bare form */
    }
  }
  if (!hex) throw new Error("Could not parse content key from resolver response");

  const key = await importKey(globalThis.crypto, hexToBytes(hex));
  keyCache.set(kid, { key, at: Date.now() });
  return key;
}

/** Generate `length` bytes of AES-CTR keystream starting `blocks` blocks in. */
async function ctrKeystream(cryptoRef, key, baseCounter, blocks, length) {
  const counter = incrementCounter(baseCounter, blocks);
  const zeros = new Uint8Array(Math.ceil(length / 16) * 16);
  const stream = await cryptoRef.subtle.decrypt(
    { name: "AES-CTR", counter, length: 128 },
    key,
    zeros,
  );
  return new Uint8Array(stream, 0, length);
}

async function importKey(cryptoRef, raw) {
  return cryptoRef.subtle.importKey(
    "raw",
    raw,
    { name: "AES-CTR", length: 128 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ---------------------------------------------------------------------------
 * MPD parsing
 * ------------------------------------------------------------------------- */

function parseAttributes(tag) {
  const attrs = {};
  const pattern = /([A-Za-z_:-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function extractDefaultKid(mpdXml) {
  const match = mpdXml.match(/default_KID\s*=\s*"([^"]+)"/);
  return match ? match[1].replace(/-/g, "").toLowerCase() : null;
}

/**
 * Minimal DASH MPD parser. Handles the common layout used by live IPTV
 * resolvers: one or more AdaptationSets, each with a SegmentTemplate that is
 * either `duration` based or SegmentTimeline based.
 */
function parseMpd(mpdXml) {
  const kid = extractDefaultKid(mpdXml);
  const isLive = !/type\s*=\s*"static"/i.test(mpdXml);

  const representations = [];
  const adaptPattern = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g;
  let adaptMatch;
  while ((adaptMatch = adaptPattern.exec(mpdXml))) {
    const adaptAttrs = parseAttributes(adaptMatch[1]);
    const adaptBody = adaptMatch[2];

    // SegmentTemplate and SegmentTimeline may be declared at the
    // AdaptationSet level or per <Representation>; the AdaptationSet-level
    // declarations must precede the first <Representation> element.
    const firstRep = adaptBody.search(/<Representation\b/);
    const adaptHead = firstRep === -1 ? adaptBody : adaptBody.slice(0, firstRep);

    // ContentProtection may sit at the AdaptationSet level; the KID is
    // per-AdaptationSet when a channel ships multiple keys (audio vs video).
    const adaptKid = extractDefaultKid(adaptBody);

    // Timeline entries, if this MPD uses <SegmentTimeline>.
    const timeline = [];
    const timelineTag = /<SegmentTimeline\b[^>]*>([\s\S]*?)<\/SegmentTimeline>/.exec(adaptHead);
    if (timelineTag) {
      for (const sMatch of timelineTag[1].matchAll(/<S\b[^>]*\/?>/g)) {
        timeline.push(parseAttributes(sMatch[0]));
      }
    }

    let setTemplate = null;
    let tagMatch;
    const templateTag = /<SegmentTemplate\b[^>]*\/?>/g;
    while ((tagMatch = templateTag.exec(adaptHead))) {
      setTemplate = parseAttributes(tagMatch[0]);
    }

    for (const repMatch of adaptBody.matchAll(/<Representation\b[^>]*(?:\/>|>([\s\S]*?)<\/Representation>)/g)) {
      const rep = parseAttributes(repMatch[0]);
      if (!rep.id) continue;
      let repTemplate = setTemplate;
      let repTimeline = timeline;
      if (repMatch[1]) {
        const ownTemplate = /<SegmentTemplate\b[^>]*\/?>/.exec(repMatch[1]);
        if (ownTemplate) repTemplate = parseAttributes(ownTemplate[0]);
        const ownTimeline = /<SegmentTimeline\b[^>]*>([\s\S]*?)<\/SegmentTimeline>/.exec(repMatch[1]);
        if (ownTimeline) {
          repTimeline = [...repMatch[1].matchAll(/<S\b[^>]*\/?>/g)].map((m) => parseAttributes(m[0]));
        }
      }
      if (!repTemplate) continue;
      const mimeType = rep.mimeType || adaptAttrs.mimeType || "";
      const contentType = rep.contentType || adaptAttrs.contentType || mimeType.split("/")[0] || "";
      const repKid = repMatch[1] ? extractDefaultKid(repMatch[1]) : null;
      representations.push({
        id: rep.id,
        bandwidth: rep.bandwidth || "0",
        kid: repKid || adaptKid || kid,
        timeline: repTimeline,
        template: repTemplate,
        isAudio: contentType === "audio",
      });
    }
  }

  return { kid, isLive, representations };
}

/** Expand DASH template tokens like $RepresentationID$ and $Number%05d$. */
function expandTemplate(template, values) {
  return template.replace(/\$([A-Za-z]+)(%0(\d+)d)?\$/g, (whole, name, _pad, width) => {
    const value = values[name];
    if (value === undefined) return whole;
    if (name === "Number" || name === "Time") {
      const num = Number(value);
      return width ? String(num).padStart(Number(width), "0") : String(num);
    }
    return String(value);
  });
}

function resolveUrl(base, path) {
  const resolved = new URL(path, base);
  // Segment/init URLs resolved from an MPD must inherit the MPD's query
  // string: JioTV CDNs put their CDN token there (`?__hdnea__=...`).
  const query = new URL(base).search;
  if (query && !resolved.search) resolved.search = query;
  return resolved.toString();
}

/* ---------------------------------------------------------------------------
 * HLS playlist generation
 * ------------------------------------------------------------------------- */

function segmentUrl(origin, mpdUrl, rep, keyMaterial, values) {
  const template = resolveUrl(
    mpdUrl,
    expandTemplate(rep.template?.media || "", {
      RepresentationID: rep.id,
      ...values,
    }),
  );
  const params = new URLSearchParams({ u: template });
  if (keyMaterial?.key) {
    params.set("k", keyMaterial.key);
  } else if (keyMaterial?.kid) {
    params.set("kid", keyMaterial.kid);
  }
  return `${origin}${PREFIX}/segment?${params.toString()}`;
}

function buildMediaPlaylist(origin, mpdUrl, rep, keyMaterial) {
  if (!rep.template?.media) return null;

  const timescale = Number(rep.template?.timescale || 1);
  const lines = ["#EXTM3U", "#EXT-X-VERSION:7"];

  if (rep.template?.initialization) {
    const initUrl = resolveUrl(
      mpdUrl,
      expandTemplate(rep.template.initialization, { RepresentationID: rep.id }),
    );
    lines.push(`#EXT-X-MAP:URI="${origin}${PREFIX}/init?u=${encodeURIComponent(initUrl)}"`);
  }

  if (rep.timeline.length > 0) {
    // SegmentTimeline: enumerate {time, duration} pairs. Only the first <S>
    // may carry `t`; later entries (and repeats) continue at the previous
    // time + duration, so resolve the absolute time of every entry first
    // and only then slice the live window.
    const entries = [];
    let cursor = 0;
    let number = -1;
    for (const s of rep.timeline) {
      if (s.t !== undefined) cursor = Number(s.t);
      const count = Number(s.r !== undefined ? s.r : 0) + 1;
      for (let i = 0; i < count; i++) {
        if (s.n !== undefined || number === -1) {
          number = Number(s.n !== undefined ? s.n : rep.template?.startNumber || 1);
        }
        entries.push({ ...s, t: cursor, n: number });
        cursor += Number(s.d || 0);
        number++;
      }
    }
    // The last timeline entry is the segment still being produced; keep it
    // out of the live window so hls.js never requests a partial fragment.
    const liveWindow = entries.slice(-(LIVE_WINDOW_SEGMENTS + 1));
    const window = rep.isLive
      ? liveWindow.length > 1
        ? liveWindow.slice(0, -1)
        : liveWindow
      : entries;

    let maxDuration = 1;
    for (const entry of window) {
      const duration = Number(entry.d || 0);
      if (duration > maxDuration) maxDuration = duration;
    }

    // A stable, monotonically increasing media sequence keeps hls.js from
    // treating every playlist reload as a brand-new playlist (and aborting
    // in-flight audio/video fragments).
    const segmentTicks = Number(rep.template?.duration || maxDuration || 1);
    const sequenceBase = Math.floor(
      (Number(window[0]?.t || 0) - Number(rep.template?.presentationTimeOffset || 0)) /
        segmentTicks,
    );
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${Math.max(0, sequenceBase)}`);

    for (const entry of window) {
      const duration = Number(entry.d || 0);
      if (duration > 0) lines.push(`#EXTINF:${(duration / timescale).toFixed(3)},`);
      lines.push(segmentUrl(origin, mpdUrl, rep, keyMaterial, { Time: entry.t, Number: entry.n }));
    }
    lines.push(`#EXT-X-TARGETDURATION:${Math.ceil(maxDuration / timescale)}`);
  } else {
    // Duration-based template.
    const duration = Number(rep.template?.duration || 0);
    if (duration <= 0) return null;

    const perSegment = duration / timescale;
    lines.push(`#EXT-X-TARGETDURATION:${Math.ceil(perSegment)}`);

    const startNumber = Number(rep.template?.startNumber || 1);
    const segmentCount = LIVE_WINDOW_SEGMENTS;
    for (let i = 0; i < segmentCount; i++) {
      lines.push(`#EXTINF:${perSegment.toFixed(3)},`);
      lines.push(segmentUrl(origin, mpdUrl, rep, keyMaterial, { Number: startNumber + i }));
    }
  }

  if (!rep.isLive) lines.push("#EXT-X-ENDLIST");
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
 * Request handlers
 * ------------------------------------------------------------------------- */

function hlsResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

/**
 * Read key material from query params. `k` carries the raw hex content key
 * (the resolver's channel API exposes it as a clearkey); `kid` is a KID to be
 * resolved against the JIOTV_KEY_TEMPLATE endpoint.
 */
function readKeyMaterial(url) {
  const key = url.searchParams.get("k");
  if (key) return { key };

  const keysParam = url.searchParams.get("keys");
  if (keysParam) {
    try {
      const parsed = JSON.parse(keysParam);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = {};
        for (const [kid, value] of Object.entries(parsed)) {
          if (typeof value === "string") {
            keys[String(kid).replace(/-/g, "").toLowerCase()] = value;
          }
        }
        if (Object.keys(keys).length > 0) return { keys };
      }
    } catch {
      /* not JSON; fall through to kid */
    }
  }

  const kid = url.searchParams.get("kid");
  return kid ? { kid } : null;
}

/**
 * Pick the content key for one representation. Multi-key channel APIs expose
 * a KID -> key map, so the playlists must carry the key matching that
 * AdaptationSet's `default_KID`, not just the first key in the map.
 */
function keyForRepresentation(rep, keyMaterial, fallbackKid) {
  if (!keyMaterial) return null;
  if (keyMaterial.key) return keyMaterial.key;
  if (keyMaterial.keys) {
    const kid = String(rep.kid || fallbackKid || "")
      .replace(/-/g, "")
      .toLowerCase();
    return kid ? keyMaterial.keys[kid] || null : null;
  }
  return null;
}

async function handleDebug(request, env, url) {
  const target = url.searchParams.get("u");
  if (!target) return json(400, { error: "missing-u" });

  const attempts = [];
  const tryFetch = async (label, headers) => {
    try {
      const r = await fetch(target, { headers });
      const body = await r.text().catch(() => "");
      attempts.push({
        label,
        status: r.status,
        server: r.headers.get("server"),
        location: r.headers.get("location"),
        bodySnippet: body.slice(0, 200),
      });
    } catch (error) {
      attempts.push({ label, error: errorMessage(error) });
    }
  };

  await tryFetch("plain", {});
  await tryFetch("ua-node", { "user-agent": "node" });
  await tryFetch("ua-browser", {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });
  await tryFetch("referer-jio", {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    referer: "https://www.jiocinema.com/",
    origin: "https://www.jiocinema.com",
  });

  let egress = null;
  try {
    const trace = await (await fetch("https://ipinfo.io/json")).json();
    egress = trace;
  } catch (error) {
    egress = { error: errorMessage(error) };
  }

  return json(200, { attempts, egress });
}

async function handleResolve(request, env, url) {
  const id = url.searchParams.get("id");
  if (!id) return json(400, { error: "missing-id" });

  const cached = resolveCache.get(id);
  if (cached && Date.now() - cached.at < RESOLVE_CACHE_TTL_MS) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }

  const base = (env.JIOTV_RESOLVER_URL || RESOLVER_BASE).replace(/\/+$/, "");
  const target = `${base}/api/public/channels/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(target, {
      headers: { accept: "application/json" },
    });
    const body = await response.text();
    if (response.ok) resolveCache.set(id, { at: Date.now(), body });
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return json(502, {
      error: "resolver-unreachable",
      message: errorMessage(error),
    });
  }
}

async function handlePlaylist(request, env, url) {
  const mpdUrl = url.searchParams.get("u");
  if (!mpdUrl) return json(400, { error: "missing-u" });
  const keyMaterial = readKeyMaterial(url);

  let response;
  let body = "";
  try {
    response = await fetch(mpdUrl, { headers: { accept: "*/*" } });
    body = await response.text().catch(() => "");
  } catch (error) {
    return json(502, { error: "mpd-unreachable", message: errorMessage(error) });
  }
  if (!response.ok) {
    return json(502, {
      error: "mpd-error",
      status: response.status,
      detail: body.slice(0, 400),
    });
  }
  const mpd = parseMpd(body);
  if (mpd.representations.length === 0) {
    return json(422, { error: "no-representations" });
  }

  const playlist = mpd.representations.filter((rep) => rep.template?.media);
  const videoReps = playlist.filter((rep) => !rep.isAudio);
  const audioReps = playlist.filter((rep) => rep.isAudio);
  // When both audio and video representations exist, expose audio as a
  // separate rendition group instead of a (bogus) video variant.
  const variantReps = videoReps.length > 0 ? videoReps : playlist;

  const mediaParams = (rep) => {
    const params = new URLSearchParams({ u: mpdUrl, r: rep.id });
    const key = keyForRepresentation(rep, keyMaterial, mpd.kid);
    if (key) {
      params.set("k", key);
    } else if (keyMaterial?.kid) {
      params.set("kid", keyMaterial.kid);
    } else if (keyMaterial?.keys) {
      params.set("keys", JSON.stringify(keyMaterial.keys));
    }
    return params;
  };

  const lines = ["#EXTM3U", "#EXT-X-VERSION:7"];
  if (videoReps.length > 0 && audioReps.length > 0) {
    for (const rep of audioReps) {
      lines.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio ${rep.id}",DEFAULT=YES,AUTOSELECT=YES,URI="${url.origin}${PREFIX}/media?${mediaParams(rep).toString()}"`,
      );
    }
  }
  for (const rep of variantReps) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${rep.bandwidth || 0}${audioReps.length > 0 && videoReps.length > 0 ? ',AUDIO="audio"' : ""}`,
    );
    lines.push(`${url.origin}${PREFIX}/media?${mediaParams(rep).toString()}`);
  }
  if (lines.length <= 2) return json(422, { error: "no-playable-representations" });

  return hlsResponse(lines.join("\n"));
}

async function handleMedia(request, env, url) {
  const mpdUrl = url.searchParams.get("u");
  const representationId = url.searchParams.get("r");
  if (!mpdUrl || !representationId) return json(400, { error: "missing-params" });
  const keyMaterial = readKeyMaterial(url);

  let response;
  try {
    response = await fetch(mpdUrl, { headers: { accept: "*/*" } });
  } catch (error) {
    return json(502, { error: "mpd-unreachable", message: errorMessage(error) });
  }
  if (!response.ok) {
    return json(502, { error: "mpd-error", status: response.status });
  }
  const mpd = parseMpd(await response.text());
  const rep = mpd.representations.find((item) => item.id === representationId);
  if (!rep) return json(404, { error: "representation-not-found" });

  rep.isLive = mpd.isLive;
  const key = keyForRepresentation(rep, keyMaterial, mpd.kid);
  const effectiveKey = key
    ? { key }
    : keyMaterial?.kid
      ? { kid: keyMaterial.kid }
      : null;
  const playlist = buildMediaPlaylist(url.origin, mpdUrl, rep, effectiveKey);
  if (!playlist) return json(422, { error: "representation-not-supported" });
  return hlsResponse(playlist);
}

async function handleInit(request, env, url) {
  const target = url.searchParams.get("u");
  if (!target) return json(400, { error: "missing-u" });

  let response;
  try {
    response = await fetch(target, { headers: { accept: "*/*" } });
  } catch (error) {
    return json(502, { error: "init-unreachable", message: errorMessage(error) });
  }
  if (!response.ok) {
    return json(502, { error: "init-error", status: response.status });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const clear = sanitizeInitSegment(bytes);
  return new Response(clear, {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}

async function handleSegment(request, env, url) {
  const target = url.searchParams.get("u");
  const keyMaterial = url.searchParams.get("k") || url.searchParams.get("kid");
  if (!target) return json(400, { error: "missing-u" });

  let response;
  try {
    response = await fetch(target, { headers: { accept: "*/*" } });
  } catch (error) {
    return json(502, { error: "segment-unreachable", message: errorMessage(error) });
  }
  if (!response.ok) {
    return json(502, { error: "segment-error", status: response.status });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());

  let key = null;
  if (keyMaterial) {
    // `k` carries the content key itself (the resolver's channel API exposes
    // it as a clearkey); `kid` is resolved against the JIOTV_KEY_TEMPLATE
    // endpoint. Both look like 32-hex strings, so the caller distinguishes.
    const isKey = url.searchParams.has("k");
    const hex = normalizeKey(keyMaterial);
    if (isKey && hex) {
      key = await importKey(globalThis.crypto, hexToBytes(hex));
    } else if (env.JIOTV_KEY_TEMPLATE) {
      try {
        key = await resolveKey(keyMaterial, env.JIOTV_KEY_TEMPLATE);
      } catch (error) {
        return json(502, { error: "key-resolution-failed", message: errorMessage(error) });
      }
    }
  }
  if (!key) {
    // Without a key we cannot decrypt; passthrough is the only option left.
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*",
      },
    });
  }

  try {
    await decryptSegment(bytes, key, globalThis.crypto);
  } catch (error) {
    return json(500, { error: "decryption-failed", message: errorMessage(error) });
  }

  return new Response(sanitizeMediaSegment(bytes), {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}

/* ---------------------------------------------------------------------------
 * Router
 * ------------------------------------------------------------------------- */

export async function handleJioTvDirect(request, env, url) {
  const suffix = url.pathname.slice(PREFIX.length) || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": url.origin,
        "access-control-allow-methods": "GET,HEAD,OPTIONS",
        "access-control-allow-headers": "content-type,range",
        "access-control-max-age": "600",
      },
    });
  }

  if (suffix === "/playlist" || suffix === "/playlist.m3u8") {
    return handlePlaylist(request, env, url);
  }
  if (suffix === "/media") return handleMedia(request, env, url);
  if (suffix === "/segment") return handleSegment(request, env, url);
  if (suffix === "/init") return handleInit(request, env, url);
  if (suffix === "/resolve") return handleResolve(request, env, url);
  if (suffix === "/debug") return handleDebug(request, env, url);

  return json(404, { error: "not-found" });
}

export {
  decryptSegment,
  parseSenc,
  parseMpd,
  extractDefaultKid,
  expandTemplate,
  importKey,
  incrementCounter,
  hexToBytes,
  buildMediaPlaylist,
  normalizeKey,
  sanitizeInitSegment,
  sanitizeMediaSegment,
};
