import catalog from "./india-catalog.json";
import type { MetaDetail, MetaPreview } from "@/types";
import { CINEMETA_URL, fetchMetaCached } from "./meta";

export { CINEMETA_URL };

export interface IndiaTitle extends MetaPreview {
  language: string;
  industry: string;
  collections: string[];
  popularity: number;
}

interface IndiaCatalogFile {
  generatedAt: string;
  source: string;
  languages: string[];
  industries: string[];
  collections: Record<string, { title: string; subtitle?: string; ranked?: boolean }>;
  items: IndiaTitle[];
}

const FILE = catalog as unknown as IndiaCatalogFile;

/** Every curated Indian title, newest metadata first by popularity. */
export const INDIA_TITLES: IndiaTitle[] = FILE.items.map((item) => ({
  ...item,
  sourceAddonUrl: CINEMETA_URL,
  sourceCatalogName: "Made for India",
}));

export interface IndiaLanguage {
  id: string;
  label: string;
  native: string;
  /** Two-letter code used by the subtitle / audio preference lists. */
  code: string;
  color: string;
}

export const INDIA_LANGUAGES: IndiaLanguage[] = [
  { id: "Hindi", label: "Hindi", native: "हिन्दी", code: "hi", color: "#FF8F1F" },
  { id: "Tamil", label: "Tamil", native: "தமிழ்", code: "ta", color: "#E53935" },
  { id: "Telugu", label: "Telugu", native: "తెలుగు", code: "te", color: "#FDD835" },
  { id: "Malayalam", label: "Malayalam", native: "മലയാളം", code: "ml", color: "#43A047" },
  { id: "Kannada", label: "Kannada", native: "ಕನ್ನಡ", code: "kn", color: "#D81B60" },
  { id: "Bengali", label: "Bengali", native: "বাংলা", code: "bn", color: "#1E88E5" },
  { id: "Marathi", label: "Marathi", native: "मराठी", code: "mr", color: "#FB8C00" },
  { id: "Punjabi", label: "Punjabi", native: "ਪੰਜਾਬੀ", code: "pa", color: "#7E57C2" },
  { id: "Gujarati", label: "Gujarati", native: "ગુજરાતી", code: "gu", color: "#00ACC1" },
  { id: "Urdu", label: "Urdu", native: "اردو", code: "ur", color: "#8E24AA" },
];

export const INDIA_LANGUAGE_IDS = INDIA_LANGUAGES.map((language) => language.id);

/** Languages that actually have curated titles. */
export const INDIA_AVAILABLE_LANGUAGES = INDIA_LANGUAGES.filter((language) =>
  INDIA_TITLES.some((title) => title.language === language.id),
);

export function languageFor(id: string | null | undefined): IndiaLanguage | undefined {
  if (!id) return undefined;
  return INDIA_LANGUAGES.find(
    (language) => language.id.toLowerCase() === id.toLowerCase() ||
      language.code === id.toLowerCase(),
  );
}

export interface IndiaCollection {
  id: string;
  title: string;
  subtitle: string;
  /** Rails shown as a ranked Top 10 row. */
  ranked?: boolean;
  icon: string;
}

/**
 * Rails on the India landing page. `trending`, `bollywood`, `hindi-series` and
 * `south` are derived from the title metadata; the rest map to explicit tags.
 */
export const INDIA_COLLECTIONS: IndiaCollection[] = [
  {
    id: "trending",
    title: "Trending in India",
    subtitle: "What India is watching right now",
    ranked: true,
    icon: "🔥",
  },
  {
    id: "bollywood",
    title: "Bollywood blockbusters",
    subtitle: "Big-screen Hindi hits",
    icon: "🎬",
  },
  {
    id: "hindi-series",
    title: "Hindi web series",
    subtitle: "Binge-worthy Indian originals",
    icon: "📺",
  },
  {
    id: "south",
    title: "South Indian cinema",
    subtitle: "Tamil · Telugu · Malayalam · Kannada",
    icon: "🌴",
  },
  {
    id: "crime",
    title: "Indian crime & thrillers",
    subtitle: "Gritty stories from across India",
    icon: "🕵️",
  },
  {
    id: "family",
    title: "Family & feel-good",
    subtitle: "Comfort watches for the whole family",
    icon: "🏡",
  },
  {
    id: "classics",
    title: "Timeless Indian classics",
    subtitle: "The films that defined Indian cinema",
    icon: "🎞️",
  },
  {
    id: "sports",
    title: "Sports & inspiring stories",
    subtitle: "Chak De! to Dangal",
    icon: "🏏",
  },
  {
    id: "action",
    title: "Action & mass entertainers",
    subtitle: "Larger-than-life Indian action",
    icon: "💥",
  },
  {
    id: "romance",
    title: "Indian romance",
    subtitle: "Love stories from every industry",
    icon: "❤️",
  },
  {
    id: "indie",
    title: "Indian indie & festival favourites",
    subtitle: "Bold voices, small budgets",
    icon: "🎭",
  },
  {
    id: "women",
    title: "Women-led Indian stories",
    subtitle: "Lead roles that stayed with us",
    icon: "🌟",
  },
  {
    id: "music",
    title: "Music & dance",
    subtitle: "The sound of Indian cinema",
    icon: "🎵",
  },
  {
    id: "horror",
    title: "Indian horror",
    subtitle: "Folk horror and spooky tales",
    icon: "👻",
  },
  {
    id: "biopic",
    title: "Real stories, real people",
    subtitle: "Indian biopics worth your time",
    icon: "🎤",
  },
  {
    id: "war",
    title: "India at war",
    subtitle: "Stories of courage and sacrifice",
    icon: "🎖️",
  },
];

export function indiaCollection(id: string): IndiaCollection | undefined {
  return INDIA_COLLECTIONS.find((collection) => collection.id === id);
}

function matchesCollection(title: IndiaTitle, collectionId: string): boolean {
  switch (collectionId) {
    case "all":
      return true;
    case "bollywood":
      return title.language === "Hindi" && title.type === "movie";
    case "hindi-series":
      return title.language === "Hindi" && title.type === "series";
    case "south":
      return title.industry === "South";
    default:
      return title.collections.includes(collectionId);
  }
}

export interface IndiaQuery {
  language?: string | null;
  type?: string | null;
  limit?: number;
}

/** Titles in a curated rail, optionally narrowed to a language or type. */
export function indiaCollectionItems(
  collectionId: string,
  { language, type, limit }: IndiaQuery = {},
): IndiaTitle[] {
  const wantedLanguage = language && language !== "all" ? language.toLowerCase() : null;
  const items = INDIA_TITLES.filter((title) => {
    if (!matchesCollection(title, collectionId)) return false;
    if (wantedLanguage && title.language.toLowerCase() !== wantedLanguage) return false;
    if (type && type !== "all" && title.type !== type) return false;
    return true;
  });
  if (collectionId === "classics") {
    items.sort((a, b) => Number(a.releaseInfo ?? 0) - Number(b.releaseInfo ?? 0));
  } else {
    items.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  }
  return limit ? items.slice(0, limit) : items;
}

/** The best titles for the India hero: popular, with artwork, mixed types. */
export function indiaHeroItems(limit = 7, language?: string | null): IndiaTitle[] {
  const pool = INDIA_TITLES.filter((title) => {
    if (!title.background) return false;
    if (language && language !== "all") {
      return title.language.toLowerCase() === language.toLowerCase();
    }
    return true;
  });
  const sorted = [...pool].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  // Mix movies and series so the hero carousel does not feel like one list.
  const movies = sorted.filter((title) => title.type === "movie");
  const series = sorted.filter((title) => title.type === "series");
  const mixed: IndiaTitle[] = [];
  let movieIndex = 0;
  let seriesIndex = 0;
  while (mixed.length < limit && (movieIndex < movies.length || seriesIndex < series.length)) {
    if (movieIndex < movies.length) mixed.push(movies[movieIndex++]);
    if (mixed.length >= limit) break;
    if (seriesIndex < series.length) mixed.push(series[seriesIndex++]);
  }
  return mixed;
}

/** Fetches full metadata for a curated title from Cinemeta (cached). */
export function fetchIndiaDetail(title: Pick<IndiaTitle, "id" | "type">): Promise<MetaDetail | null> {
  return fetchMetaCached(CINEMETA_URL, title.type, title.id);
}

/** A short, human label for a title's language + industry. */
export function indiaSubtitle(title: IndiaTitle): string {
  const language = languageFor(title.language);
  return language ? `${language.native} · ${title.language}` : title.language;
}

/** Counts used by the language chips. */
export function indiaCountsByLanguage(): Record<string, number> {
  const counts: Record<string, number> = { all: INDIA_TITLES.length };
  for (const title of INDIA_TITLES) {
    counts[title.language] = (counts[title.language] ?? 0) + 1;
  }
  return counts;
}
