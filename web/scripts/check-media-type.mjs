/**
 * Dev-only helper: checks that stream URLs are classified the same way the
 * TV client classifies them.
 *
 * Usage: npm run check:media-type
 */
import { loadTs } from "./lib/load-ts.mjs";

const { isHlsUrl, inferMimeType } = await loadTs("src/lib/media-type.ts");

const cases = [
  ["https://cdn.example.com/master.m3u8", true],
  ["https://cdn.example.com/master.m3u8?token=abc", true],
  ["https://cdn.example.com/master.m3u8&token=abc", true],
  ["https://cdn.example.com/path/index.m3u8", true],
  ["https://cdn.example.com/stream?url=https%3A%2F%2Fx.com%2Fa.m3u8", true],
  ["https://cdn.example.com/stream?format=m3u8", true],
  ["https://cdn.example.com/stream?type=hls", true],
  ["https://cdn.example.com/hls/12345", true],
  ["https://cdn.example.com/playlist.m3u8", true],
  ["https://debrid.example.com/streaming/abc/Movie.1080p.m3u8", true],
  ["https://cdn.example.com/video.mp4", false],
  ["https://cdn.example.com/video.mp4?token=1", false],
  ["https://cdn.example.com/movie.mkv", false],
  ["https://cdn.example.com/stream?format=mp4", false],
  ["https://cdn.example.com/download/1080p.mp4", false],
  ["https://cdn.example.com/manifest.mpd", false],
  ["https://cdn.example.com/master", false],
];

let failures = 0;
for (const [url, expected] of cases) {
  const actual = isHlsUrl(url);
  if (actual !== expected) {
    failures += 1;
    console.log(`FAIL ${url} -> ${actual} (expected ${expected}) [${inferMimeType(url)}]`);
  } else {
    console.log(`ok   ${url} -> ${actual}`);
  }
}
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
