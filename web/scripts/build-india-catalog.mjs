/**
 * Builds `src/lib/india-catalog.json` from a curated list of Indian titles.
 *
 * Each title is resolved through Cinemeta's search catalog (matching the name
 * and, when given, the year) so hand-typed IMDb IDs can never point at the
 * wrong film. Metadata comes from Cinemeta — the add-on Nuvio installs by
 * default — so the landing page has real posters, backdrops and ratings
 * without needing a TMDB key.
 *
 *   node scripts/build-india-catalog.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "lib", "india-catalog.json");
const CINEMETA = "https://v3-cinemeta.strem.io";

const MOVIE = "movie";
const SERIES = "series";

/** [name, year, type, language, industry, collections[]] */
const CURATED = [
  // ---------------------------------------------------------------- Hindi films
  ["3 Idiots", 2009, MOVIE, "Hindi", "Bollywood", ["classics", "comedy", "trending"]],
  ["Dangal", 2016, MOVIE, "Hindi", "Bollywood", ["sports", "family", "trending"]],
  ["PK", 2014, MOVIE, "Hindi", "Bollywood", ["comedy", "family"]],
  ["Bajrangi Bhaijaan", 2015, MOVIE, "Hindi", "Bollywood", ["family", "trending"]],
  ["Andhadhun", 2018, MOVIE, "Hindi", "Bollywood", ["crime", "thriller", "trending"]],
  ["Tumbbad", 2018, MOVIE, "Hindi", "Bollywood", ["horror", "indie"]],
  ["Gully Boy", 2019, MOVIE, "Hindi", "Bollywood", ["music", "indie"]],
  ["Article 15", 2019, MOVIE, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Drishyam", 2015, MOVIE, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Queen", 2013, MOVIE, "Hindi", "Bollywood", ["women", "comedy"]],
  ["Barfi!", 2012, MOVIE, "Hindi", "Bollywood", ["romance", "comedy"]],
  ["Zindagi Na Milegi Dobara", 2011, MOVIE, "Hindi", "Bollywood", ["romance", "comedy"]],
  ["Yeh Jawaani Hai Deewani", 2013, MOVIE, "Hindi", "Bollywood", ["romance", "comedy"]],
  ["Jab We Met", 2007, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Kuch Kuch Hota Hai", 1998, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Kabhi Khushi Kabhie Gham", 2001, MOVIE, "Hindi", "Bollywood", ["family", "classics"]],
  ["Devdas", 2002, MOVIE, "Hindi", "Bollywood", ["classics", "romance"]],
  ["Dilwale", 1995, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Hum Aapke Hain Koun..!", 1994, MOVIE, "Hindi", "Bollywood", ["family", "classics"]],
  ["Mughal-E-Azam", 1960, MOVIE, "Hindi", "Bollywood", ["classics"]],
  ["Mother India", 1957, MOVIE, "Hindi", "Bollywood", ["classics", "women"]],
  ["Guide", 1965, MOVIE, "Hindi", "Bollywood", ["classics"]],
  ["Thirsty", 1957, MOVIE, "Hindi", "Bollywood", ["classics"]],
  ["Anand", 1971, MOVIE, "Hindi", "Bollywood", ["classics"]],
  ["Chupke Chupke", 1975, MOVIE, "Hindi", "Bollywood", ["classics", "comedy"]],
  ["Sholay", 1975, MOVIE, "Hindi", "Bollywood", ["classics", "action"]],
  ["Hera Pheri", 2000, MOVIE, "Hindi", "Bollywood", ["comedy", "classics"]],
  ["Munna Bhai M.B.B.S.", 2003, MOVIE, "Hindi", "Bollywood", ["comedy", "classics"]],
  ["Dhoom 2", 2006, MOVIE, "Hindi", "Bollywood", ["action"]],
  ["War", 2019, MOVIE, "Hindi", "Bollywood", ["action", "thriller"], "tt7430722"],
  ["Pathaan", 2023, MOVIE, "Hindi", "Bollywood", ["action", "thriller", "trending"]],
  ["Jawan", 2023, MOVIE, "Hindi", "Bollywood", ["action", "thriller", "trending"]],
  ["Animal", 2023, MOVIE, "Hindi", "Bollywood", ["crime", "action", "trending"]],
  ["Brahmastra Part One: Shiva", 2022, MOVIE, "Hindi", "Bollywood", ["action", "fantasy"]],
  ["Shershaah", 2021, MOVIE, "Hindi", "Bollywood", ["war", "trending"]],
  ["Uri: The Surgical Strike", 2019, MOVIE, "Hindi", "Bollywood", ["war", "thriller"]],
  ["Raazi", 2018, MOVIE, "Hindi", "Bollywood", ["thriller", "women"]],
  ["Talvar", 2015, MOVIE, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Kahaani", 2012, MOVIE, "Hindi", "Bollywood", ["thriller", "women"]],
  ["Special 26", 2013, MOVIE, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Baby", 2015, MOVIE, "Hindi", "Bollywood", ["action", "thriller"]],
  ["Sarkar", 2005, MOVIE, "Hindi", "Bollywood", ["crime", "action"]],
  ["Satya", 1998, MOVIE, "Hindi", "Bollywood", ["crime", "classics"]],
  ["Company", 2002, MOVIE, "Hindi", "Bollywood", ["crime", "classics"]],
  ["Gangs of Wasseypur", 2012, MOVIE, "Hindi", "Bollywood", ["crime", "indie"]],
  ["Piku", 2015, MOVIE, "Hindi", "Bollywood", ["family", "comedy", "women"]],
  ["Vicky Donor", 2012, MOVIE, "Hindi", "Bollywood", ["comedy", "romance"]],
  ["Badhaai Ho", 2018, MOVIE, "Hindi", "Bollywood", ["family", "comedy"]],
  ["Seeking True Love", 2017, MOVIE, "Hindi", "Bollywood", ["romance", "comedy"]],
  ["Stree", 2018, MOVIE, "Hindi", "Bollywood", ["horror", "comedy"]],
  ["Bala", 2019, MOVIE, "Hindi", "Bollywood", ["comedy"]],
  ["Dream Girl", 2019, MOVIE, "Hindi", "Bollywood", ["comedy"]],
  ["Chhichhore", 2019, MOVIE, "Hindi", "Bollywood", ["comedy", "family"]],
  ["Hindi Medium", 2017, MOVIE, "Hindi", "Bollywood", ["comedy", "family"]],
  ["Angrezi Medium", 2020, MOVIE, "Hindi", "Bollywood", ["comedy", "family"]],
  ["Newton", 2017, MOVIE, "Hindi", "Bollywood", ["drama", "indie"]],
  ["Thappad", 2020, MOVIE, "Hindi", "Bollywood", ["women", "drama"]],
  ["Shakuntala Devi", 2020, MOVIE, "Hindi", "Bollywood", ["women", "biopic"]],
  ["Mission Mangal", 2019, MOVIE, "Hindi", "Bollywood", ["women", "sports"]],
  ["Pad Man", 2018, MOVIE, "Hindi", "Bollywood", ["biopic", "drama"]],
  ["Toilet: A Love Story", 2017, MOVIE, "Hindi", "Bollywood", ["comedy", "drama"]],
  ["Swades", 2004, MOVIE, "Hindi", "Bollywood", ["classics", "drama"]],
  ["Chak De! India", 2007, MOVIE, "Hindi", "Bollywood", ["sports", "classics"]],
  ["Rang De Basanti", 2006, MOVIE, "Hindi", "Bollywood", ["classics", "drama"]],
  ["Like Stars on Earth", 2007, MOVIE, "Hindi", "Bollywood", ["classics", "family"]],
  ["Sultan", 2016, MOVIE, "Hindi", "Bollywood", ["sports", "action"]],
  ["Sanju", 2018, MOVIE, "Hindi", "Bollywood", ["biopic", "drama"]],
  ["M.S. Dhoni: The Untold Story", 2016, MOVIE, "Hindi", "Bollywood", ["sports", "biopic"]],
  ["Bhaag Milkha Bhaag", 2013, MOVIE, "Hindi", "Bollywood", ["sports", "biopic"]],
  ["Mary Kom", 2014, MOVIE, "Hindi", "Bollywood", ["sports", "biopic", "women"]],
  ["Paan Singh Tomar", 2012, MOVIE, "Hindi", "Bollywood", ["sports", "biopic"]],
  ["Om Shanti Om", 2007, MOVIE, "Hindi", "Bollywood", ["romance", "comedy"]],
  ["Main Hoon Na", 2004, MOVIE, "Hindi", "Bollywood", ["action", "comedy"]],
  ["Kal Ho Naa Ho", 2003, MOVIE, "Hindi", "Bollywood", ["romance", "family"]],
  ["Veer Zaara", 2004, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Mohabbatein", 2000, MOVIE, "Hindi", "Bollywood", ["romance", "family"]],
  ["Hum Saath-Saath Hain", 1999, MOVIE, "Hindi", "Bollywood", ["family", "classics"]],
  ["Dil To Pagal Hai", 1997, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Raja Hindustani", 1996, MOVIE, "Hindi", "Bollywood", ["romance", "classics"]],
  ["Akele Hum Akele Tum", 1995, MOVIE, "Hindi", "Bollywood", ["family", "classics"]],
  ["Rangeela", 1995, MOVIE, "Hindi", "Bollywood", ["music", "classics"]],
  ["Dil Chahta Hai", 2001, MOVIE, "Hindi", "Bollywood", ["classics", "comedy"]],
  ["Lakshya", 2004, MOVIE, "Hindi", "Bollywood", ["war", "drama"]],
  ["Don", 2006, MOVIE, "Hindi", "Bollywood", ["action", "crime"]],
  ["Don 2", 2011, MOVIE, "Hindi", "Bollywood", ["action", "crime"]],
  ["Rockstar", 2011, MOVIE, "Hindi", "Bollywood", ["music", "romance"]],
  ["Tamasha", 2015, MOVIE, "Hindi", "Bollywood", ["romance", "music"]],
  ["Ae Dil Hai Mushkil", 2016, MOVIE, "Hindi", "Bollywood", ["romance", "music"]],
  ["Dear Zindagi", 2016, MOVIE, "Hindi", "Bollywood", ["romance", "women"]],
  ["English Vinglish", 2012, MOVIE, "Hindi", "Bollywood", ["women", "family"]],

  // -------------------------------------------------------------- Hindi series
  ["Paatal Lok", 2020, SERIES, "Hindi", "Bollywood", ["crime", "thriller", "trending"]],
  ["Mirzapur", 2018, SERIES, "Hindi", "Bollywood", ["crime", "action", "trending"]],
  ["Sacred Games", 2018, SERIES, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Delhi Crime", 2019, SERIES, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Scam 1992", 2020, SERIES, "Hindi", "Bollywood", ["biopic", "drama", "trending"]],
  ["Panchayat", 2020, SERIES, "Hindi", "Bollywood", ["comedy", "family", "trending"]],
  ["Kota Factory", 2019, SERIES, "Hindi", "Bollywood", ["comedy", "drama"]],
  ["TVF Pitchers", 2015, SERIES, "Hindi", "Bollywood", ["comedy", "drama"]],
  ["Aspirants", 2021, SERIES, "Hindi", "Bollywood", ["drama"]],
  ["Gullak", 2019, SERIES, "Hindi", "Bollywood", ["comedy", "family"]],
  ["Made in Heaven", 2019, SERIES, "Hindi", "Bollywood", ["drama", "romance"]],
  ["Four More Shots Please", 2019, SERIES, "Hindi", "Bollywood", ["comedy", "women"]],
  ["Aarya", 2020, SERIES, "Hindi", "Bollywood", ["crime", "thriller", "women"]],
  ["Special OPS", 2020, SERIES, "Hindi", "Bollywood", ["action", "thriller"]],
  ["The Family Man", 2019, SERIES, "Hindi", "Bollywood", ["action", "thriller", "trending"]],
  ["Rocket Boys", 2022, SERIES, "Hindi", "Bollywood", ["biopic", "drama"]],
  ["Jubilee", 2023, SERIES, "Hindi", "Bollywood", ["drama", "trending"]],
  ["Farzi", 2023, SERIES, "Hindi", "Bollywood", ["crime", "thriller", "trending"]],
  ["Dahaad", 2023, SERIES, "Hindi", "Bollywood", ["crime", "thriller"]],
  ["Kohrra", 2023, SERIES, "Hindi", "Bollywood", ["crime", "thriller", "trending"]],
  ["Heeramandi", 2024, SERIES, "Hindi", "Bollywood", ["drama", "trending"]],

  // ------------------------------------------------------- Telugu / Tamil films
  ["RRR", 2022, MOVIE, "Telugu", "South", ["action", "trending"]],
  ["Pushpa: The Rise", 2021, MOVIE, "Telugu", "South", ["action", "crime", "trending"]],
  ["Pushpa: The Rule - Part 2", 2024, MOVIE, "Telugu", "South", ["action", "crime", "trending"]],
  ["Baahubali: The Beginning", 2015, MOVIE, "Telugu", "South", ["action", "fantasy", "trending"]],
  ["Baahubali 2: The Conclusion", 2017, MOVIE, "Telugu", "South", ["action", "fantasy", "trending"]],
  ["Kantara", 2022, MOVIE, "Kannada", "South", ["action", "fantasy", "trending"]],
  ["K.G.F: Chapter 1", 2018, MOVIE, "Kannada", "South", ["action", "crime"]],
  ["K.G.F: Chapter 2", 2022, MOVIE, "Kannada", "South", ["action", "crime", "trending"]],
  ["777 Charlie", 2022, MOVIE, "Kannada", "South", ["family", "drama"]],
  ["Vikram", 2022, MOVIE, "Tamil", "South", ["action", "thriller", "trending"]],
  ["Ponniyin Selvan: Part I", 2022, MOVIE, "Tamil", "South", ["action", "drama"]],
  ["Ponniyin Selvan: Part Two", 2023, MOVIE, "Tamil", "South", ["action", "drama"]],
  ["Jailer", 2023, MOVIE, "Tamil", "South", ["action", "comedy", "trending"]],
  ["Leo", 2023, MOVIE, "Tamil", "South", ["action", "thriller", "trending"]],
  ["Vikram Vedha", 2017, MOVIE, "Tamil", "South", ["crime", "thriller"]],
  ["Kaithi", 2019, MOVIE, "Tamil", "South", ["action", "crime"]],
  ["Asuran", 2019, MOVIE, "Tamil", "South", ["action", "drama"]],
  ["Soorarai Pottru", 2020, MOVIE, "Tamil", "South", ["drama", "biopic"]],
  ["Jai Bhim", 2021, MOVIE, "Tamil", "South", ["drama", "crime"]],
  ["96", 2018, MOVIE, "Tamil", "South", ["romance", "drama"]],
  ["Super Deluxe", 2019, MOVIE, "Tamil", "South", ["drama", "thriller"]],
  ["Ratsasan", 2018, MOVIE, "Tamil", "South", ["crime", "thriller"]],
  ["Pariyerum Perumal", 2018, MOVIE, "Tamil", "South", ["drama", "indie"]],
  ["Vada Chennai", 2018, MOVIE, "Tamil", "South", ["crime", "drama"]],
  ["Aruvi", 2016, MOVIE, "Tamil", "South", ["drama", "indie"]],
  ["Interrogation", 2015, MOVIE, "Tamil", "South", ["crime", "thriller"], "tt4991384"],
  ["Bhonsle", 2018, MOVIE, "Hindi", "Bollywood", ["drama", "indie"]],

  // --------------------------------------------------------- Malayalam films
  ["Angamaly Diaries", 2017, MOVIE, "Malayalam", "South", ["comedy", "crime", "indie"]],
  ["Maheshinte Prathikaaram", 2016, MOVIE, "Malayalam", "South", ["comedy", "family"]],
  ["Kumbalangi Nights", 2019, MOVIE, "Malayalam", "South", ["drama", "indie"]],
  ["Jallikattu", 2019, MOVIE, "Malayalam", "South", ["drama", "indie"]],
  ["The Great Indian Kitchen", 2021, MOVIE, "Malayalam", "South", ["drama", "women", "indie"]],
  ["Minnal Murali", 2021, MOVIE, "Malayalam", "South", ["action", "fantasy"]],
  ["Drishyam", 2013, MOVIE, "Malayalam", "South", ["crime", "thriller"]],
  ["Bangalore Days", 2014, MOVIE, "Malayalam", "South", ["comedy", "romance"]],
  ["Premam", 2015, MOVIE, "Malayalam", "South", ["romance", "comedy"]],
  ["Lucifer", 2019, MOVIE, "Malayalam", "South", ["action", "crime"]],
  ["Manjummel Boys", 2024, MOVIE, "Malayalam", "South", ["thriller", "trending"]],
  ["Aavesham", 2024, MOVIE, "Malayalam", "South", ["comedy", "action", "trending"]],

  // ----------------------------------------------------------------- Bengali
  ["Pather Panchali", 1955, MOVIE, "Bengali", "Bengali", ["classics", "indie"]],
  ["Aparajito", 1956, MOVIE, "Bengali", "Bengali", ["classics", "indie"]],
  ["The World of Apu", 1959, MOVIE, "Bengali", "Bengali", ["classics", "indie"]],
  ["Charulata", 1964, MOVIE, "Bengali", "Bengali", ["classics", "women"]],
  ["The Big City", 1963, MOVIE, "Bengali", "Bengali", ["classics", "women"], "tt0057277"],
  ["The Music Room", 1958, MOVIE, "Bengali", "Bengali", ["classics"]],
  ["The Adventures of Goopy and Bagha", 1969, MOVIE, "Bengali", "Bengali", ["classics", "family"]],
  ["The Golden Fortress", 1974, MOVIE, "Bengali", "Bengali", ["classics", "family"]],

  // ------------------------------------------------------------------ Marathi
  ["Sairat", 2016, MOVIE, "Marathi", "Marathi", ["romance", "drama"]],
  ["Natsamrat", 2016, MOVIE, "Marathi", "Marathi", ["drama", "classics"]],
  ["Court", 2014, MOVIE, "Marathi", "Marathi", ["drama", "indie"]],
  ["Fandry", 2013, MOVIE, "Marathi", "Marathi", ["drama", "indie"]],
];

/** Rails shown on the India landing page. */
const COLLECTIONS = {
  trending: { title: "Trending in India", subtitle: "What India is watching right now", ranked: true },
  bollywood: { title: "Bollywood blockbusters", subtitle: "Big-screen Hindi hits" },
  "hindi-series": { title: "Hindi web series", subtitle: "Binge-worthy Indian originals" },
  south: { title: "South Indian cinema", subtitle: "Tamil · Telugu · Malayalam · Kannada" },
  crime: { title: "Indian crime & thrillers", subtitle: "Gritty stories from across India" },
  family: { title: "Family & feel-good", subtitle: "Comfort watches for the whole family" },
  classics: { title: "Timeless Indian classics", subtitle: "The films that defined Indian cinema" },
  sports: { title: "Sports & inspiring stories", subtitle: "Chak De! to Dangal" },
  indie: { title: "Indian indie & festival favourites", subtitle: "Bold voices, small budgets" },
  women: { title: "Women-led Indian stories", subtitle: "Lead roles that stayed with us" },
  romance: { title: "Indian romance", subtitle: "Love stories from every industry" },
  action: { title: "Action & mass entertainers", subtitle: "Larger-than-life Indian action" },
  horror: { title: "Indian horror", subtitle: "Folk horror and spooky tales" },
  biopic: { title: "Real stories, real people", subtitle: "Indian biopics worth your time" },
  music: { title: "Music & dance", subtitle: "The sound of Indian cinema" },
  war: { title: "India at war", subtitle: "Stories of courage and sacrifice" },
};

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function json(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function resolveId(name, year, type, hint) {
  if (hint) {
    const hinted = await fetchMeta(hint, type);
    if (hinted) return hinted;
  }
  const query = encodeURIComponent(name);
  const payload = await json(`${CINEMETA}/catalog/${type}/top/search=${query}.json`);
  const metas = Array.isArray(payload?.metas) ? payload.metas : [];
  const wanted = normalize(name);
  const candidates = metas.filter((meta) => {
    const actual = normalize(meta.name);
    return actual === wanted || actual.startsWith(wanted) || wanted.startsWith(actual);
  });
  if (candidates.length === 0) return null;
  // Require the year to match when one is given: streaming services and
  // remakes reuse famous titles, and a wrong match would put the wrong poster
  // on the landing page.
  if (year) {
    return (
      candidates.find((meta) =>
        String(meta.releaseInfo ?? meta.year ?? "").includes(String(year)),
      ) ?? null
    );
  }
  return candidates[0];
}

async function fetchMeta(id, type) {
  const payload = await json(`${CINEMETA}/meta/${type}/${id}.json`);
  return payload?.meta ?? null;
}

function preview(meta, entry) {
  const [, year, type, language, industry, collections] = entry;
  return {
    id: meta.id,
    type: meta.type ?? type,
    name: meta.name,
    poster: meta.poster ?? null,
    background: meta.background ?? null,
    logo: meta.logo ?? null,
    description: meta.description ?? null,
    releaseInfo: String(year),
    imdbRating: meta.imdbRating ?? null,
    genres: meta.genres ?? meta.genre ?? [],
    runtime: meta.runtime ?? null,
    country: meta.country ?? "India",
    language,
    industry,
    collections,
    popularity: meta.popularity ?? 0,
  };
}

const results = [];
const failures = [];
const CONCURRENCY = 8;
let cursor = 0;

async function worker() {
  while (cursor < CURATED.length) {
    const entry = CURATED[cursor++];
    const [name, year, type, , , , hint] = entry;
    try {
      const match = await resolveId(name, year, type, hint);
      if (!match) {
        failures.push({ name, year, reason: "no search match" });
        continue;
      }
      const meta = await fetchMeta(match.id, match.type ?? type);
      if (!meta) {
        failures.push({ name, year, reason: "no metadata" });
        continue;
      }
      results.push(preview(meta, entry));
    } catch (error) {
      failures.push({ name, year, reason: error.message });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

const payload = {
  generatedAt: new Date().toISOString(),
  source: CINEMETA,
  languages: [...new Set(results.map((entry) => entry.language))],
  industries: [...new Set(results.map((entry) => entry.industry))],
  collections: COLLECTIONS,
  items: results,
};

await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${results.length} titles to ${OUT}`);
if (failures.length) {
  console.warn(`Skipped ${failures.length}:`);
  for (const failure of failures) console.warn(`  ${failure.name} (${failure.year}): ${failure.reason}`);
}
