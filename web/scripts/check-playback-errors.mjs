/**
 * Dev-only helper: checks that playback failures are reported with the same
 * wording as the TV client.
 *
 * Usage: npm run check:playback-errors
 */
import { loadTs } from "./lib/load-ts.mjs";

const { describeHlsError, httpStatusExplanation, isTorrentSource } = await loadTs(
  "src/lib/playback-errors.ts",
);

const cases = [
  [{ type: "networkError", details: "manifestLoadError", response: { code: 403, text: "Forbidden" } }, "HTTP 403 Forbidden"],
  [{ type: "networkError", details: "manifestLoadError", response: { code: 404 } }, "HTTP 404"],
  [{ type: "networkError", details: "manifestLoadError", response: { code: 410 } }, "HTTP 410"],
  [{ type: "networkError", details: "manifestLoadError", response: { code: 429 } }, "HTTP 429"],
  [{ type: "networkError", details: "manifestLoadError", response: { code: 503 } }, "HTTP 503"],
  [{ type: "networkError", details: "manifestLoadError" }, "could not be reached"],
  [{ type: "otherError", details: "manifestParsingError" }, "invalid or unplayable content"],
  [{ type: "mediaError", details: "bufferStalledError" }, "format your browser may not support"],
];

let failures = 0;
for (const [data, expected] of cases) {
  const error = describeHlsError(data);
  const ok = error.message.includes(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${JSON.stringify(data)} -> ${error.message}`);
}

const torrents = [
  ["torrent://abc123", true],
  ["magnet:?xt=urn:btih:abc", true],
  ["https://cdn.example.com/master.m3u8", false],
];
for (const [url, expected] of torrents) {
  const actual = isTorrentSource(url);
  if (actual !== expected) failures += 1;
  console.log(`${actual === expected ? "ok  " : "FAIL"} isTorrentSource(${url}) -> ${actual}`);
}

console.log(httpStatusExplanation(401));
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
