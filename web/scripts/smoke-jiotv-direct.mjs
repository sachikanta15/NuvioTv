/**
 * Live smoke test for the jiotv-direct pipeline.
 *
 * Picks a channel from the resolver, resolves its MPD + clearkey, parses the
 * MPD, builds the media playlist, fetches and decrypts one segment, then
 * verifies the decrypted segment is a valid fMP4.
 */
import assert from "node:assert/strict";
import { buildMediaPlaylist, decryptSegment, hexToBytes, importKey, parseMpd } from "../worker/jiotv-direct.js";

const API = "https://livetgtv.lovable.app";
function readText(boxType, offset, start) {
  const len = Number(new DataView(boxType.buffer).getUint32(0));
  return len;
}

const listing = await (await fetch(`${API}/api/public/channels`)).json();

// Prefer key-bearing (encrypted) channels, then fill with the rest.
const details = await Promise.all(
  listing.channels.slice(0, 60).map(async (channel) => ({
    channel,
    detail: await (await fetch(`${API}/api/public/channels/${channel.id}`)).json(),
  })),
);
const withKey = details.filter(({ detail }) => detail.drm?.key && detail.sources?.[0]);
const withoutKey = details.filter(({ detail }) => !detail.drm?.key && detail.sources?.[0]);
const selected = [...withKey.slice(0, 4), ...withoutKey.slice(0, 3)];
const channels = selected;
console.log(`${withKey.length} encrypted + ${withoutKey.length} clear channels available in first 60; testing ${channels.length}`);

let tested = 0;
let testedWithKey = 0;
for (const { channel, detail } of channels) {
  const detail = await (
    await fetch(`${API}/api/public/channels/${channel.id}`)
  ).json();

  const mpdUrl = detail.sources?.[0];
  if (!mpdUrl) {
    console.log(`– ${channel.name}: no sources, skipping`);
    continue;
  }
  const key = detail.drm?.key ?? null;
  if (key === null) {
    console.log(`– ${channel.name}: no clearkey, testing clear passthrough`);
  }

  const mpdResponse = await fetch(mpdUrl);
  if (!mpdResponse.ok) {
    console.log(`– ${channel.name}: MPD ${mpdResponse.status}, skipping`);
    continue;
  }
  const mpdText = await mpdResponse.text();
  const mpd = parseMpd(mpdText);
  const rep = mpd.representations.find((r) => !r.isAudio) ?? mpd.representations[0];
  if (!rep) {
    console.log(`– ${channel.name}: MPD parsed to no representations, skipping (${mpdText.slice(0, 120)}...)`);
    continue;
  }
  rep.isLive = mpd.isLive;
  console.log(`– ${channel.name}: ${mpd.representations.length} reps, rep ${rep.id}, live=${mpd.isLive}`);

  const playlist = buildMediaPlaylist("http://localhost", mpdUrl, rep, { key });
  assert.ok(playlist, `${channel.name}: no playlist generated`);

  const initMatch = playlist.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const segMatch = playlist.split("\n").find((l) => l.startsWith("http"));
  assert.ok(segMatch, `${channel.name}: no segment URLs`);

  // Fetch and decrypt the first segment.
  const segmentUrl = new URL(segMatch, "http://localhost");
  const cdnSegmentUrl = segmentUrl.searchParams.get("u");
  assert.ok(cdnSegmentUrl, `${channel.name}: segment URL has no u param`);
  const segmentResponse = await fetch(cdnSegmentUrl);
  assert.ok(segmentResponse.ok, `${channel.name}: segment HTTP ${segmentResponse.status}`);
  const segmentBytes = new Uint8Array(await segmentResponse.arrayBuffer());
  await decryptSegment(segmentBytes, key ? await importKey(globalThis.crypto, hexToBytes(key)) : null, globalThis.crypto);
  const decrypted = segmentBytes;
  assert.ok(decrypted, `${channel.name}: segment decryption returned nothing`);

  // Verify decrypted output starts with valid ISO-BMFF boxes.
  const view = new DataView(decrypted.buffer);
  assert.ok(view.getUint32(0) > 0 && view.getUint32(0) <= decrypted.byteLength, `${channel.name}: invalid first box size`);
  const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  assert.match(boxType, /^(moof|styp|ftyp)$/, `${channel.name}: first box must be moof/styp/ftyp, got ${boxType}`);

  if (key) {
    // Stronger: for encrypted channels, the decrypted `mdat` must contain
    // valid NAL start codes (H.264 00 00 01 or HEVC 00 00 01). Locate the
    // first mdat and scan its payload.
    let offset = 0;
    let mdat = null;
    while (offset + 8 <= decrypted.byteLength) {
      const size = view.getUint32(offset);
      const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
      if (type === "mdat") {
        mdat = { start: offset + 8, end: offset + size };
        break;
      }
      if (size <= 0) break;
      offset += size;
    }
    assert.ok(mdat, `${channel.name}: no mdat box found`);
    let nalStarts = 0;
    for (let i = mdat.start; i + 3 < mdat.end; i++) {
      if (decrypted[i] === 0 && decrypted[i + 1] === 0 && decrypted[i + 2] === 1) nalStarts++;
      if (nalStarts > 0) break;
    }
    assert.ok(nalStarts > 0, `${channel.name}: decrypted mdat has no NAL start codes`);
    console.log(`  ✓ decrypted segment ok (${decrypted.byteLength} bytes, first box "${boxType}", NAL start code found)`);
  } else {
    console.log(`  ✓ segment passthrough ok (${decrypted.byteLength} bytes, first box "${boxType}")`);
  }

  if (initMatch) {
    const initUrl = new URL(initMatch[1], "http://localhost");
    const initResponse = await fetch(initUrl.searchParams.get("u"));
    assert.ok(initResponse.ok, `${channel.name}: init HTTP ${initResponse.status}`);
    console.log(`  ✓ init segment ok (${initResponse.headers.get("content-type") ?? "no type"})`);
  }

  if (key) testedWithKey++;
  tested++;
  if (testedWithKey >= 3 && tested >= 5) break;
}

console.log(`\nLive smoke test complete (${tested} channel(s) tested).`);
