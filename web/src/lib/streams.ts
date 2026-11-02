import type { PlaybackSource, StremioStream } from "@/types";

const QUALITY_PATTERNS: { label: string; rank: number; test: RegExp }[] = [
  { label: "4K", rank: 60, test: /\b(4k|2160p|uhd)\b/i },
  { label: "1440p", rank: 50, test: /\b(1440p|2k|qhd)\b/i },
  { label: "1080p", rank: 40, test: /\b(1080p|fhd|full ?hd)\b/i },
  { label: "720p", rank: 30, test: /\b(720p|hd)\b/i },
  { label: "576p", rank: 25, test: /\b576p\b/i },
  { label: "480p", rank: 20, test: /\b(480p|sd)\b/i },
  { label: "360p", rank: 10, test: /\b(360p)\b/i },
];

const HDR_TAGS = ["HDR10+", "HDR10", "DV", "Dolby Vision", "HDR", "HLG"];
const CODEC_TAGS = ["AV1", "HEVC", "x265", "H.265", "h265", "x264", "H.264", "h264"];

export interface StreamAnalysis {
  quality?: string;
  qualityRank: number;
  hdr: string[];
  codec?: string;
  sizeBytes?: number;
  isCached?: boolean;
  provider?: string;
  audio?: string[];
  languages?: string[];
}

export function isMagnet(link?: string | null): boolean {
  return !!link && /^magnet:/i.test(link.trim());
}

export function isTorrentUrl(link?: string | null): boolean {
  return !!link && /^torrent:/i.test(link.trim());
}

export function infoHashFromStream(stream: StremioStream): string | null {
  if (stream.infoHash && /^[a-f0-9]{32,40}$/i.test(stream.infoHash)) return stream.infoHash;
  const candidates = [stream.url, stream.externalUrl].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const magnet = candidate.match(/urn:btih:([a-z0-9]{32,40})/i);
    if (magnet) return magnet[1];
    const torrent = candidate.match(/^torrent:([a-z0-9]{32,40})/i);
    if (torrent) return torrent[1];
  }
  return null;
}

/** The playable HTTP URL for a stream, ignoring magnet/torrent links. */
export function streamHttpUrl(stream: StremioStream): string | null {
  const candidates = [stream.url, stream.externalUrl].filter(Boolean) as string[];
  return candidates.find((url) => !isMagnet(url) && !isTorrentUrl(url)) ?? null;
}

export function isStreamTorrent(stream: StremioStream): boolean {
  if (streamHttpUrl(stream)) return false;
  return !!infoHashFromStream(stream) || isMagnet(stream.url) || isTorrentUrl(stream.url);
}

function detectSize(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB|GiB|MiB)/i);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier =
    unit === "TB" ? 1024 ** 4 : unit === "GB" || unit === "GIB" ? 1024 ** 3 : 1024 ** 2;
  return Math.round(value * multiplier);
}

/** Parses a stream's human-readable text into structured metadata. */
export function analyzeStream(stream: StremioStream): StreamAnalysis {
  const haystack = [stream.name, stream.title, stream.description].filter(Boolean).join(" — ");
  const upper = haystack.toUpperCase();

  let quality: string | undefined;
  let qualityRank = -1;
  for (const pattern of QUALITY_PATTERNS) {
    if (pattern.test.test(haystack)) {
      quality = pattern.label;
      qualityRank = pattern.rank;
      break;
    }
  }

  const hdr = HDR_TAGS.filter((tag) => upper.includes(tag.toUpperCase()));
  const codec = CODEC_TAGS.find((tag) => upper.includes(tag.toUpperCase()));
  const sizeBytes = stream.behaviorHints?.videoSize ?? detectSize(haystack);
  const provider = stream.name?.split("\n")[0]?.trim();

  const cached =
    /⚡|\bcached\b|\binstant\b/i.test(haystack) ||
    /\[(?:RD|PM|AD|DL)\+\]/i.test(haystack);

  const audio = ["Atmos", "TrueHD", "DTS", "DD+", "EAC3", "AC3", "AAC"].filter((tag) =>
    upper.includes(tag.toUpperCase()),
  );

  return { quality, qualityRank, hdr, codec, sizeBytes, isCached: cached, provider, audio };
}

/** Unique, stable key for de-duplicating streams across add-ons. */
export function streamKey(stream: StremioStream, addonName: string): string {
  const url = stream.url ?? stream.externalUrl ?? "";
  const hash = infoHashFromStream(stream) ?? "";
  return [addonName, url || hash, stream.fileIdx ?? "", stream.title ?? "", stream.name ?? ""].join("|");
}

export interface GroupedStreams {
  addonName: string;
  addonLogo?: string | null;
  streams: { stream: StremioStream; analysis: StreamAnalysis }[];
}

/** Groups streams by originating add-on, preserving add-on ordering. */
export function groupStreams(
  entries: { addonName: string; addonLogo?: string | null; streams: StremioStream[] }[],
): GroupedStreams[] {
  const seen = new Set<string>();
  return entries
    .map(({ addonName, addonLogo, streams }) => {
      const unique: GroupedStreams["streams"] = [];
      for (const stream of streams) {
        const key = streamKey(stream, addonName);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({ stream, analysis: analyzeStream(stream) });
      }
      unique.sort((a, b) => b.analysis.qualityRank - a.analysis.qualityRank);
      return { addonName, addonLogo, streams: unique };
    })
    .filter((group) => group.streams.length > 0);
}

/** Converts a raw stream into the player's source model. */
export function toPlaybackSource(
  stream: StremioStream,
  addonName: string,
  addonLogo?: string | null,
): PlaybackSource | null {
  const httpUrl = streamHttpUrl(stream);
  const hash = infoHashFromStream(stream);
  const analysis = analyzeStream(stream);
  if (!httpUrl && !hash) return null;
  const baseTitle = stream.title ?? stream.name ?? stream.description ?? "Stream";
  const requestHeaders = stream.behaviorHints?.proxyHeaders?.request ?? null;
  return {
    url: httpUrl ?? `torrent://${hash}`,
    title: baseTitle,
    name: stream.name ?? null,
    addonName,
    addonLogo: addonLogo ?? null,
    description: stream.description ?? null,
    isTorrent: !httpUrl && !!hash,
    infoHash: hash,
    fileIdx: stream.fileIdx ?? null,
    bingeGroup: stream.behaviorHints?.bingeGroup ?? null,
    quality: analysis.quality ?? null,
    subtitleUrls: (stream.subtitles ?? []).map((subtitle) => ({
      id: subtitle.id,
      url: subtitle.url,
      lang: subtitle.lang,
    })),
    headers: requestHeaders,
    proxyRequired: !!requestHeaders || !!stream.behaviorHints?.notWebReady,
  };
}

/** Formats a stream's headline and metadata line for the stream list. */
export function streamLines(stream: StremioStream, analysis: StreamAnalysis) {
  const name = stream.name?.split("\n")[0]?.trim() ?? "Stream";
  const description = stream.title ?? stream.description ?? "";
  const bits: string[] = [];
  if (analysis.quality) bits.push(analysis.quality);
  if (analysis.hdr.length) bits.push(analysis.hdr.join(" "));
  if (analysis.codec) bits.push(analysis.codec);
  if (analysis.sizeBytes) {
    const gb = analysis.sizeBytes / 1024 ** 3;
    bits.push(gb >= 1 ? `${gb.toFixed(2)} GB` : `${(analysis.sizeBytes / 1024 ** 2).toFixed(0)} MB`);
  }
  return { name, description, meta: bits.join(" • ") };
}
