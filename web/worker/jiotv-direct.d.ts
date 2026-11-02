/**
 * Type declarations for `worker/jiotv-direct.js`.
 *
 * The Worker module is plain JavaScript (Cloudflare Workers do not typecheck
 * it), but the web app imports its pure functions directly — see
 * `src/lib/jiotv-direct.ts` — so the hand-written signatures below must stay
 * in sync with the module's runtime exports.
 */

/** `parseAttributes` output: an MPD tag's attribute map. */
export interface DashAttributes {
  [key: string]: string;
}

/** One `<Representation>` (with its resolved SegmentTemplate/Timeline). */
export interface DashRepresentation {
  id: string;
  bandwidth: string;
  /** `<S>` entries of a SegmentTimeline. */
  timeline: DashAttributes[];
  /** The resolved `<SegmentTemplate>`. */
  template: DashAttributes;
  isAudio: boolean;
  /** Set on the parsed MPD's representations during playlist generation. */
  isLive?: boolean;
}

/** Key material: `key` is the raw hex content key, `kid` needs resolving. */
export type KeyMaterial = { key: string } | { kid: string };

/** Parse DASH MPD XML into representations. */
export function parseMpd(mpdXml: string): {
  kid: string | null;
  isLive: boolean;
  representations: DashRepresentation[];
};

/** Extract `cenc:default_KID` from an MPD (lowercased, dash-stripped). */
export function extractDefaultKid(mpdXml: string): string | null;

/** Expand DASH template tokens like `$RepresentationID` and `$Number%05d$. */
export function expandTemplate(
  template: string,
  values: Record<string, string | number>,
): string;

/** Normalize a hex/base64 content key to bare lowercase hex. */
export function normalizeKey(value: string): string | null;

/** Decode an even-length hex string into bytes. */
export function hexToBytes(hex: string): Uint8Array;

/** Import raw AES-128 key material for AES-CTR decryption. */
export function importKey(
  cryptoRef: Crypto,
  raw: Uint8Array,
): Promise<CryptoKey>;

/** Parse the payload of an ISO/IEC 23001-7 `senc` box. */
export function parseSenc(
  view: DataView,
  start: number,
  end: number,
): Array<{
  iv: Uint8Array;
  subsamples: Array<{ clear: number; protected: number }>;
}>;

/** Add `blocks` to a 16-byte big-endian AES-CTR counter. */
export function incrementCounter(
  counter: Uint8Array,
  blocks: number,
): Uint8Array;

/** Decrypt CENC (AES-CTR) samples in place; no-ops without a key. */
export function decryptSegment(
  bytes: Uint8Array,
  key: CryptoKey | null,
  cryptoRef?: Crypto,
): Promise<void>;

/** Build an HLS media playlist for one DASH representation. */
export function buildMediaPlaylist(
  origin: string,
  mpdUrl: string,
  rep: DashRepresentation,
  keyMaterial?: KeyMaterial | null,
): string | null;


