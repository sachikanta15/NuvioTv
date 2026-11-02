import type { AddonManifest, InstalledAddon } from "@/types";
import { createInstalledAddon, normalizeTransportUrl } from "./stremio";

export interface ParsedAddons {
  transports: string[];
  inline: InstalledAddon[];
  errors: string[];
}

interface CollectionEntry {
  transportUrl?: string;
  transportName?: string;
  url?: string;
  manifest?: AddonManifest;
}

/**
 * Accepts whatever the user pastes and extracts add-on transport URLs:
 *  - a bare add-on URL (`https://v3-cinemeta.strem.io`)
 *  - a Stremio add-on collection export (`{"addons":[{"transportUrl":...}]}`)
 *  - a single manifest object (`{"id":..., "resources":[...]}`)
 *  - a JSON array of URL/manifest strings
 */
export function parseAddonInput(input: string): ParsedAddons {
  const text = input.trim();
  const result: ParsedAddons = { transports: [], inline: [], errors: [] };
  if (!text) {
    result.errors.push("Nothing to install — paste an add-on URL or collection JSON.");
    return result;
  }

  if (!text.startsWith("{") && !text.startsWith("[")) {
    const urls = text
      .split(/[\s,]+/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(line));
    if (urls.length === 0) {
      result.errors.push("No add-on URL found in the provided text.");
      return result;
    }
    result.transports.push(...urls.map(normalizeTransportUrl));
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    result.errors.push("That doesn't look like valid JSON.");
    return result;
  }

  const collect = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.trim()) result.transports.push(normalizeTransportUrl(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === "object") {
      const entry = value as CollectionEntry;
      if (entry.transportUrl) {
        result.transports.push(normalizeTransportUrl(entry.transportUrl));
        return;
      }
      if (entry.url) {
        result.transports.push(normalizeTransportUrl(entry.url));
        return;
      }
      if (entry.manifest?.id && entry.manifest.name) {
        const transport = entry.transportName
          ? normalizeTransportUrl(entry.transportName)
          : undefined;
        if (transport) {
          result.inline.push(createInstalledAddon(entry.manifest, transport));
        } else {
          result.errors.push(
            `"${entry.manifest.name}" has no transport URL; install it by URL instead.`,
          );
        }
      }
    }
  };

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const root = parsed as Record<string, unknown>;
    if (Array.isArray(root.addons)) {
      root.addons.forEach(collect);
    } else if (root.manifest || root.transportUrl || root.url) {
      collect(root);
    } else if (root.id && root.name && root.resources) {
      result.errors.push(
        `Manifest for "${String(root.name)}" has no transport URL; install it by URL instead.`,
      );
    } else {
      result.errors.push("No add-ons found in that JSON.");
    }
  } else {
    collect(parsed);
  }

  result.transports = [...new Set(result.transports)];
  if (result.transports.length === 0 && result.inline.length === 0 && result.errors.length === 0) {
    result.errors.push("No add-ons found.");
  }
  return result;
}
