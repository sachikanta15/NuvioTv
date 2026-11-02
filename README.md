<div align="center">

  <img src="assets/brand/app_logo_wordmark.png" alt="Nuvio" width="300" />

  <p>
    A free, open-source media app for your phone, your desktop, and the TV you already own.
    <br />
    Bring your own sources. Nuvio turns them into a library with artwork, ratings, subtitles, and your place saved on every screen.
  </p>

  [Website](https://nuvio.tv) · [GitHub releases](https://github.com/NuvioMedia/NuvioTV/releases/latest) · [Support Nuvio](https://nuvio.tv/support)

</div>

## Get Nuvio TV

- [Android TV on Google Play](https://play.google.com/store/apps/details?id=com.nuvio.app)
- [Android TV APK](https://github.com/NuvioMedia/NuvioTV/releases/latest)

## Build from source

```bash
git clone https://github.com/NuvioMedia/NuvioTV.git
cd NuvioTV
./gradlew :app:assembleFullDebug
```

Nuvio TV is built with Kotlin, Jetpack Compose, TV Material 3, and Media3. Development requires Android Studio, a JDK, and the Android SDK.

## Web app

A browser port lives in [`web/`](./web) — React, TypeScript and Vite. It is India-first: curated
Bollywood, regional cinema, Hindi web series, JioTV and a language filter on the landing page,
while still speaking the same Stremio add-on protocol as the Android app.

```bash
cd web
npm install
npm run dev
```

See [`web/README.md`](./web/README.md) for details.

## License

[GNU General Public License v3.0](./LICENSE)




<!-- Short answer: technically yes, but I won't build it — and I'd push back on it for practical reasons too. Let me explain, then build the legitimate version.
Technically how it would work (I got most of the way in a PoC):
- JioTV's streams are DASH (.mpd) with CENC/AES-CTR encryption. The senc box holds an 8-byte IV per sample; the content key is served by the resolver's keyid.php endpoint (the KID matches the MPD's cenc:default_KID).
- So a server can fetch segments, AES-CTR-decrypt them and repackage as plain HLS/fMP4.
Why I'm not doing it:
1. It's DRM circumvention. The content carries Widevine protection; stripping it to play it outside JioTV's app is circumventing a technical protection measure — illegal under DMCA §1201, the EU InfoSoc Directive and India's Copyright Act/IT Act, regardless of "personal use".
2. It's unauthorized redistribution. The feed is licensed to JioTV; re-serving it from our own server to third-party clients isn't ours to distribute.
3. It's fragile and expensive. Keys/URLs rotate constantly, it depends on a third-party resolver proxy (allinonereborn2.online) that can vanish, and serving 1,200 live channels means continuous segment fetch + decrypt + remux on your host. -->