import type { InstalledAddon, PlaybackSource, StremioStream } from "@/types";
import { fetchStreamsFromAddons } from "./stremio";
import { analyzeStream, groupStreams, streamHttpUrl, toPlaybackSource } from "./streams";

export interface ResolvedStreams {
  groups: ReturnType<typeof groupStreams>;
  flat: { stream: StremioStream; addonName: string; addonLogo?: string | null }[];
  errors: { addonName: string; error: string }[];
}

/** Queries every enabled stream add-on for a video. */
export async function resolveStreams(
  addons: InstalledAddon[],
  type: string,
  videoId: string,
): Promise<ResolvedStreams> {
  const streamAddons = addons.filter((addon) =>
    addon.manifest.resources.some((resource) => {
      const name = typeof resource === "string" ? resource : resource.name;
      if (name !== "stream") return false;
      if (typeof resource === "string") return true;
      return resource.types.includes(type);
    }),
  );

  const results = await fetchStreamsFromAddons(streamAddons, type, videoId);
  const groupsInput = results.map((result) => ({
    addonName: result.addon.displayName ?? result.addon.manifest.name,
    addonLogo: result.addon.manifest.logo,
    streams: result.streams,
  }));

  const groups = groupStreams(groupsInput);
  const flat = groups.flatMap((group) =>
    group.streams.map(({ stream }) => ({
      stream,
      addonName: group.addonName,
      addonLogo: group.addonLogo,
    })),
  );

  return {
    groups,
    flat,
    errors: results
      .filter((result) => result.error)
      .map((result) => ({
        addonName: result.addon.displayName ?? result.addon.manifest.name,
        error: result.error as string,
      })),
  };
}

/**
 * Picks the highest-quality playable (direct HTTP) source.
 *
 * Torrent-only sources are skipped: the browser cannot resolve them, the same
 * way the TV app only plays them through its P2P/debrid stack.
 */
export function pickBestSource(flat: ResolvedStreams["flat"]): PlaybackSource | null {
  const ranked = [...flat]
    .filter(({ stream }) => !!streamHttpUrl(stream))
    .sort((a, b) => analyzeStream(b.stream).qualityRank - analyzeStream(a.stream).qualityRank);
  const best = ranked[0];
  if (!best) return null;
  return toPlaybackSource(best.stream, best.addonName, best.addonLogo);
}
