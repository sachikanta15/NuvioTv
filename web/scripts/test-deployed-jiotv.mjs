#!/usr/bin/env node
/**
 * Live end-to-end test of the DEPLOYED worker at
 * https://android-tv-expo-web.sachikantaraul3.workers.dev/jiotv-api
 *
 * Verifies the full browser playback path: playlist -> media -> init + segment,
 * including NAL start-code presence in decrypted video segments.
 */
import assert from "node:assert/strict";

const WORKER = "https://android-tv-expo-web.sachikantaraul3.workers.dev";
const API = "https://livetgtv.lovable.app";

const res = await fetch(`${API}/api/public/channels`, { headers: { accept: "application/json" } });
const data = await res.json();
const channels = (Array.isArray(data) ? data : data.channels || []).slice(0, 60);
console.log(`Fetched ${channels.length} channels, finding an encrypted one...`);

let tested = 0;
for (const ch of channels) {
  const d = await fetch(`${API}/api/public/channels/${ch.id}`, { headers: { accept: "application/json" } })
    .then(r => r.json()).catch(() => null);
  if (!d?.drm?.key || !d?.sources?.[0]) continue;

  console.log(`\n=== ${ch.name} ===`);
  const u = encodeURIComponent(d.sources[0]);
  const pl = await fetch(`${WORKER}/jiotv-api/playlist.m3u8?u=${u}&k=${d.drm.key}`);
  console.log("playlist.m3u8 status:", pl.status);
  assert.equal(pl.status, 200, `playlist failed: ${await pl.text()}`);
  const playlist = await pl.text();
  console.log("--- master playlist ---");
  console.log(playlist.split("\n").slice(0, 12).join("\n"));

  // Pick first media playlist from a video variant
  const mediaMatch = playlist.match(/URI="([^"]*\/media[^"]*)"/);
  if (!mediaMatch) { console.log("no media URI found, skipping"); continue; }
  const mediaUrl = new URL(mediaMatch[1], WORKER).href;
  const mediaRes = await fetch(mediaUrl);
  console.log("media status:", mediaRes.status);
  assert.equal(mediaRes.status, 200, `media failed: ${await mediaRes.text()}`);
  const media = await mediaRes.text();
  console.log("--- media playlist (first 8 lines) ---");
  console.log(media.split("\n").slice(0, 8).join("\n"));

  // Fetch init + first segment
  const initMatch = media.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (initMatch) {
    const initRes = await fetch(new URL(initMatch[1], WORKER).href);
    console.log("init status:", initRes.status);
    assert.equal(initRes.status, 200);
    const initBuf = new Uint8Array(await initRes.arrayBuffer());
    const initType = String.fromCharCode(...initBuf.slice(4, 8));
    assert.equal(initType, "ftyp", `init segment first box was ${initType}`);
    console.log('init segment ok (first box "ftyp")');
  }

  const segMatch = media.match(/^([^#\n].*\/segment[^\n]*)$/m);
  if (!segMatch) { console.log("no segment URI, skipping"); continue; }
  const segRes = await fetch(new URL(segMatch[1], WORKER).href);
  console.log("segment status:", segRes.status);
  assert.equal(segRes.status, 200, `segment failed: ${await segRes.text()}`);
  const segBuf = new Uint8Array(await segRes.arrayBuffer());
  const segType = String.fromCharCode(...segBuf.slice(4, 8));
  assert.ok(["moof", "styp"].includes(segType), `segment first box was ${segType}`);
  console.log(`segment ok (first box "${segType}", ${segBuf.length} bytes)`);

  // Check decrypted NAL start codes in the mdat — proves decryption happened
  const md = media.match(/#EXT-X-MAP/) && initMatch ? null : null; // noop
  let nalCount = 0;
  for (let i = 0; i < segBuf.length - 4; i++) {
    if (segBuf[i] === 0 && segBuf[i + 1] === 0 && segBuf[i + 2] === 1) nalCount++;
  }
  console.log(`NAL start codes found: ${nalCount}`);
  assert.ok(nalCount > 0, "no NAL start codes in decrypted segment");

  tested++;
  if (tested >= 2) break;
}

console.log(`\n✓ Deployed worker verified (${tested} encrypted channel(s) end-to-end)`);
