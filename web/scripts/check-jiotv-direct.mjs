/**
 * Checks `worker/jiotv-direct.js` end to end without touching live endpoints.
 *
 * A synthetic CENC fragment is built byte-by-byte here:
 *
 *   [moof [traf [tfhd][senc][trun]]][mdat <encrypted samples>]
 *
 * The samples are encrypted with WebCrypto AES-CTR using the exact CENC
 * semantics the Worker implements (8-byte IVs zero-padded to a 16-byte
 * counter, subsample clear bytes do not consume keystream blocks). The real
 * `decryptSegment` must then recover the original plaintext. We also assert
 * the MPD parser, template expansion and KID extraction behave.
 */

import assert from "node:assert/strict";
import {
  buildMediaPlaylist,
  decryptSegment,
  extractDefaultKid,
  expandTemplate,
  normalizeKey,
  parseMpd,
  parseSenc,
  sanitizeInitSegment,
  sanitizeMediaSegment,
} from "../worker/jiotv-direct.js";

/* ---------------------------------------------------------------------------
 * Tiny ISO-BMFF box builder
 * ------------------------------------------------------------------------- */

function box(type, payload) {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, 8 + payload.length);
  for (let i = 0; i < 4; i++) view.setUint8(4 + i, type.charCodeAt(i));
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, 8);
  return out;
}

/** Concatenate byte arrays. */
function concat(...arrays) {
  const total = arrays.reduce((total, bytes) => total + bytes.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const bytes of arrays) {
    out.set(bytes, offset);
    offset += bytes.length;
  }
  return out;
}

/** Build a `senc` payload with one IV per sample. */
function buildSenc(ivs, subsampleSets) {
  const totalSubsamples = subsampleSets.reduce(
    (total, subsamples) => total + subsamples.length,
    0,
  );
  const bytes = new Uint8Array(8 + ivs.length * 10 + totalSubsamples * 6);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  view.setUint32(offset, 0x02, false); // version=0, flags=0x02 (subsamples)
  offset += 4;
  view.setUint32(offset, ivs.length);
  offset += 4;
  for (let index = 0; index < ivs.length; index++) {
    const iv = ivs[index];
    const subsamples = subsampleSets[index] || [];
    // per-sample: 8-byte IV (ISO/IEC 23001-7 §7.6)
    for (let i = 0; i < 8; i++) {
      view.setUint8(offset + i, iv[i]);
    }
    offset += 8;
    // subsample entries
    view.setUint16(offset, subsamples.length);
    offset += 2;
    for (const { clear, protected: protectedLen } of subsamples) {
      view.setUint16(offset, clear);
      view.setUint32(offset + 2, protectedLen);
      offset += 6;
    }
  }
  return bytes.subarray(0, offset);
}

/** Build a `trun` payload with per-sample sizes. */
function buildTrun(sizes) {
  const bytes = new Uint8Array(8 + sizes.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x200, false); // version=0, flags=0x200 (sample_size)
  view.setUint32(4, sizes.length);
  let offset = 8;
  for (const size of sizes) {
    view.setUint32(offset, size);
    offset += 4;
  }
  return bytes.subarray(0, offset);
}

/** Build a minimal `tfhd` payload (just the track id). */
function buildTfhd() {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setUint32(4, 1); // track_id = 1
 return bytes;
}

/* ---------------------------------------------------------------------------
 * AES-CTR helper with CENC counter semantics (mirrors the Worker)
 * ------------------------------------------------------------------------- */

function incrementCounter(counter, blocks) {
  const copy = new Uint8Array(counter);
  let carry = blocks;
  for (let i = 7; i >= 0 && carry > 0; i--) {
    const value = copy[i] + (carry & 0xff);
    carry = (carry >>> 8) + (value > 0xff ? 1 : 0);
    copy[i] = value & 0xff;
    if (value <= 0xff && carry === 0) break;
  }
  return copy;
}

async function encryptCenc(bytes, start, length, key, iv8, cryptoRef) {
  const counter = new Uint8Array(16);
  counter.set(iv8, 0);
  const zeros = new Uint8Array(Math.ceil(length / 16) * 16);
  const stream = new Uint8Array(
    await cryptoRef.subtle.encrypt(
      { name: "AES-CTR", counter, length: 128 },
      key,
      zeros,
    ),
  );
  for (let i = 0; i < length; i++) {
    bytes[start + i] ^= stream[i];
  }
}

/* ---------------------------------------------------------------------------
 * Tests
 * ------------------------------------------------------------------------- */

const cryptoRef = globalThis.crypto;

async function roundTripTest({ withSubsamples }) {
  const keyBytes = cryptoRef.getRandomValues(new Uint8Array(16));
  const key = await cryptoRef.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CTR", length: 128 },
    false,
    ["encrypt", "decrypt"],
  );

  // Two samples with a non-trivial split so the subsample map matters.
  const samples = [
    { plaintext: cryptoRef.getRandomValues(new Uint8Array(420)) },
    { plaintext: cryptoRef.getRandomValues(new Uint8Array(310)) },
  ];

  // per sample: one clear chunk followed by one protected chunk
  const subsampleSets = samples.map(({ plaintext }) => [
    { clear: 32, protected: plaintext.length - 32 },
  ]);

  // Assemble mdat payload: encrypt the protected regions.
  const mdatPayload = new Uint8Array(
    samples.reduce((total, { plaintext }) => total + plaintext.length, 0),
  );
  let mdatOffset = 0;
  for (let index = 0; index < samples.length; index++) {
    const { plaintext } = samples[index];
    mdatPayload.set(plaintext, mdatOffset);
    const clear = withSubsamples ? 32 : 0;
    await encryptCenc(
      mdatPayload,
      mdatOffset + clear,
      plaintext.length - clear,
      key,
      [0, 0, 0, 0, 0, 0, 0, index + 1],
      cryptoRef,
    );
    mdatOffset += plaintext.length;
  }

  const sencBox = box(
    "senc",
    buildSenc(
      samples.map((_, index) => new Uint8Array([0, 0, 0, 0, 0, 0, 0, index + 1])),
      withSubsamples ? subsampleSets : samples.map(() => []),
    ),
  );
  const trunBox = box(
    "trun",
    buildTrun(samples.map(({ plaintext }) => plaintext.length)),
  );
  const tfhdBox = box("tfhd", buildTfhd());
  const traf = box("traf", concat(tfhdBox, sencBox, trunBox));
  const fragment = concat(box("moof", traf), box("mdat", mdatPayload));

  // Run the real decrypter over the synthetic fragment.
  await decryptSegment(fragment, key, cryptoRef);

  // The decrypted mdat payload must match the original plaintexts.
  let verifyOffset = fragment.byteLength - mdatPayload.length;
  for (const { plaintext } of samples) {
    const actual = fragment.subarray(verifyOffset, verifyOffset + plaintext.length);
    assert.deepEqual(actual, plaintext, "decrypted sample does not match plaintext");
    verifyOffset += plaintext.length;
  }
}

/* ---------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------- */

try {
  await roundTripTest({ withSubsamples: true });
  console.log("✓ CENC AES-CTR round-trip (subsample map) matches plaintext");

  await roundTripTest({ withSubsamples: false });
  console.log("✓ CENC AES-CTR round-trip (full-sample encryption) matches plaintext");

  {
    const mpdXml = `<MPD type="dynamic" xmlns:cenc="urn:mpeg:cenc:2301:3">
      <AdaptationSet>
        <SegmentTemplate
          timescale="90000"
          media="seg_$RepresentationID$_$Number%06d$.mp4"
          initialization="init_$RepresentationID$.mp4"
          startNumber="123"
          duration="900000" />
        <Representation id="720p" bandwidth="2500000" />
      </AdaptationSet>
    </MPD>`;
    const kid = extractDefaultKid(mpdXml);
    assert.equal(kid, null, "no default_KID expected");

    const expanded = expandTemplate("seg_$RepresentationID$_$Number%06d$.mp4", {
      RepresentationID: "720p",
      Number: 42,
    });
    assert.equal(expanded, "seg_720p_000042.mp4");
  }
  console.log("✓ MPD parsing / template expansion");

  {
    const kid = extractDefaultKid(
      `<ContentProtection cenc:default_KID="AB12CD34-5678-90EF-GH12-34567890ABCD" />`,
    );
    assert.equal(kid, "ab12cd34567890efgh1234567890abcd");
  }
  console.log("✓ default_KID extraction");

  {
    const ivs = [
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]),
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 2]),
    ];
    const sencPayload = buildSenc(
      ivs,
      ivs.map(() => [{ clear: 32, protected: 128 }]),
    );
    const wrapper = box("senc", sencPayload);
    const view = new DataView(
      wrapper.buffer,
      wrapper.byteOffset,
      wrapper.byteLength,
    );
    const entries = parseSenc(view, 8, wrapper.length);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0].iv, ivs[0]);
    assert.deepEqual(entries[1].iv, ivs[1]);
    assert.deepEqual(entries[0].subsamples, [{ clear: 32, protected: 128 }]);
  }
  console.log("✓ senc parsing (IVs + subsample map)");

  {
    const mpdXml = `<MPD type="dynamic">
      <AdaptationSet>
        <SegmentTemplate
          timescale="90000"
          media="seg_$RepresentationID$_$Number%06d$.mp4"
          initialization="init_$RepresentationID$.mp4"
          startNumber="123"
          duration="900000" />
        <Representation id="720p" bandwidth="2500000" />
      </AdaptationSet>
    </MPD>`;
    const mpd = parseMpd(mpdXml);
    assert.equal(mpd.representations.length, 1);

    const rep = mpd.representations[0];
    rep.isLive = mpd.isLive;

    const withKey = buildMediaPlaylist(
      "https://worker.example",
      "https://cdn.example/index.mpd",
      rep,
      { key: "b2797ce5e403ee22d8e36c6d5f2b6630" },
    );
    assert.match(withKey, /\/segment\?u=.*[?&]k=b2797ce5e403ee22d8e36c6d5f2b6630/, "content key must be propagated to segment URLs");

    const withKid = buildMediaPlaylist(
      "https://worker.example",
      "https://cdn.example/index.mpd",
      rep,
      { kid: "eb19113c11ce5cfb80c89696765a0187" },
    );
    assert.match(withKid, /\/segment\?u=.*[?&]kid=eb19113c11ce5cfb80c89696765a0187/, "KID must be propagated to segment URLs");
  }
  console.log("✓ media playlist key propagation");

  {
    // Regression: the resolver hands out bare 32-hex clearkeys (no 0x prefix),
    // and a `0x?` vs `(?:0x)?` regex slip made exactly those return null.
    const cases = {
      "eb19113c11ce5cfb80c89696765a0187": "eb19113c11ce5cfb80c89696765a0187",
      "0xeb19113c11ce5cfb80c89696765a0187": "eb19113c11ce5cfb80c89696765a0187",
      "0XEB19113C11CE5CFB80C89696765A0187": "eb19113c11ce5cfb80c89696765a0187",
      "EB19113C11CE5CFB80C89696765A0187": "eb19113c11ce5cfb80c89696765a0187",
      "zz19113c11ce5cfb80c89696765a018": null,
    };
    for (const [input, expected] of Object.entries(cases)) {
      assert.equal(
        normalizeKey(input),
        expected,
        `normalizeKey(${JSON.stringify(input)})`,
      );
    }
  }
  console.log("✓ content key normalization (bare hex / 0x-prefixed)");

  {
    // Audio tracks are full-sample encrypted: flags=0 still carries one
    // 8-byte IV per sample (regression: these were dropped, so audio played
    // back as undecrypted garbage).
    const ivs = [
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]),
    ];
    const bytes = new Uint8Array(8 + ivs.length * 8);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0); // version=0, flags=0 (no subsamples)
    view.setUint32(4, ivs.length);
    ivs.forEach((iv, index) => bytes.set(iv, 8 + index * 8));
    const wrapper = box("senc", bytes);
    const entries = parseSenc(
      new DataView(wrapper.buffer, wrapper.byteOffset, wrapper.byteLength),
      8,
      wrapper.length,
    );
    assert.equal(entries.length, 2, "full-sample senc must keep every sample");
    assert.deepEqual(entries[0].iv, ivs[0]);
    assert.deepEqual(entries[1].iv, ivs[1]);
    assert.deepEqual(entries[0].subsamples, []);
  }
  console.log("✓ senc parsing (full-sample IVs)");

  {
    // A single <S r="2"> means three segments, each advancing by `d`.
    const mpdXml = `<MPD type="static">
      <AdaptationSet contentType="video">
        <SegmentTemplate timescale="600" media="v-$Time$.m4s" initialization="v-init.mp4">
          <SegmentTimeline><S t="1000" d="1200" r="2"/></SegmentTimeline>
        </SegmentTemplate>
        <Representation id="v1" bandwidth="1000" />
      </AdaptationSet>
    </MPD>`;
    const mpd = parseMpd(mpdXml);
    const rep = mpd.representations[0];
    rep.isLive = mpd.isLive;
    const playlist = buildMediaPlaylist(
      "https://worker.example",
      "https://cdn.example/index.mpd",
      rep,
      null,
    );
    const times = [...playlist.matchAll(/v-(\d+)\.m4s/g)].map((m) => m[1]);
    assert.deepEqual(times, ["1000", "2200", "3400"]);
  }
  console.log("✓ SegmentTimeline repeat expansion");

  {
    // CENC init metadata must become a clear fMP4 init.
    const frma = box("frma", new TextEncoder().encode("avc1"));
    const sinf = box("sinf", concat(frma, box("schm", new Uint8Array(12))));
    const encv = box("encv", concat(new Uint8Array(78), sinf));
    const stsd = box("stsd", concat(new Uint8Array(8), encv));
    const stbl = box("stbl", stsd);
    const minf = box("minf", stbl);
    const mdia = box("mdia", minf);
    const trak = box("trak", mdia);
    const moov = box("moov", concat(trak, box("pssh", new Uint8Array(16))));
    const init = concat(box("ftyp", new Uint8Array(8)), moov);
    const clean = sanitizeInitSegment(init);
    const text = Buffer.from(clean).toString("latin1");
    assert.ok(!text.includes("encv"), "encv must be rewritten");
    assert.ok(!text.includes("sinf"), "sinf must be removed");
    assert.ok(!text.includes("pssh"), "pssh must be removed");
    assert.ok(text.includes("avc1"), "original avc1 sample entry must remain");
  }
  console.log("✓ init-segment encryption metadata is stripped");

  {
    // Decrypted fragments must not keep CENC auxiliary boxes.
    const traf = box(
      "traf",
      concat(box("tfhd", new Uint8Array(8)), box("senc", new Uint8Array(8))),
    );
    const segment = concat(
      box("moof", traf),
      box("mdat", new Uint8Array(32)),
    );
    const clean = sanitizeMediaSegment(segment);
    assert.equal(clean.length, segment.length, "sizes must not change");
    const text = Buffer.from(clean).toString("latin1");
    assert.ok(!text.includes("senc"), "senc must be renamed");
    assert.ok(text.includes("free"), "aux boxes must become free");
  }
  console.log("✓ fragment CENC auxiliary boxes are neutralised");

  console.log("\nAll jiotv-direct checks passed.");
} catch (error) {
  console.error("\njiotv-direct checks failed:");
  console.error(error);
  process.exitCode = 1;
}