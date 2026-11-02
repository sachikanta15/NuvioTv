# Nuvio TV — Web

A browser port of the [Nuvio TV](../) Android TV client, built with **React + TypeScript + Vite**.
The landing page is **India-first** — curated Bollywood, regional cinema, Hindi web series, JioTV
and an eight-language filter — while the app still speaks the Stremio add-on protocol for everything
else you install.

Nuvio is a Stremio-protocol client: it ships no content and instead connects to add-ons you
choose. That protocol maps onto the web cleanly, so this app installs the same add-ons, reads the
same catalogs and metadata, and resolves the same streams — with playback in the browser.

## Quick start

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build        # type-check + bundle into dist/
npm run preview      # serve dist/ on http://localhost:4173
npm run typecheck    # tsc only
```

No API keys or configuration are required — the app seeds **Cinemeta** (catalogs + metadata) and
**OpenSubtitles v3** on first run.

## What's implemented

| Area | Notes |
| --- | --- |
| India landing | 162 curated Indian films and series across 8 languages, a language filter that drives the whole page, Top 10 in India, JioTV/Bollywood/South/classics quick links, and a Saffron (India) theme |
| Add-ons | Install by URL, paste a Stremio collection JSON, curated registry, enable/disable, reorder, rename, refresh, per-catalog toggles |
| Home | Three layouts (Modern hero + rows, Classic rows, Grid), India-first hero, continue-watching row or grid, lazy catalog rows |
| Discover | India tab with curated rails and language filters, a dedicated **Live TV** tab (JioTV plus `tv`/`channel` add-on catalogs), dynamic type tabs including Live TV, genre chips and every catalog from every add-on |
| Live TV | **JioTV Live** with its own channel directory and player |
| Search | Debounced multi-add-on search with movie/series filters, de-duplication, recent searches and Indian quick searches |
| Detail | Logo/backdrop hero, compact/cinematic layouts, episode list with season picker, per-episode watched state, cast, companies, links, YouTube trailers, "more like this", start watch party |
| Streams | Aggregated across add-ons, quality/HDR/codec/size badges, cached + browser-playable filters, debrid resolution, best-source auto-select |
| Player | HLS (hls.js), DASH (dash.js) and progressive MP4, resume, quality/audio/subtitle menus, subtitle styling, aspect ratio, speed, PiP, fullscreen, stats overlay, skip intro, next-episode countdown, keyboard shortcuts, party sync, Trakt scrobbling, progress persistence |
| Browser fallbacks | Same-origin `/stream-proxy` for add-on `proxyHeaders`/CORS-blocked streams, automatic proxy retry on network failures, and clear "TV only" labels for MKV/AVI/TS sources |
| Library | Custom lists, watchlist, favourites, watch history, watched titles |
| Collections | Collections with nested folders, add/move/remove titles |
| Profiles | Multiple profiles with avatars, colours, optional PIN and kids flag; each keeps its own library |
| Watch party | Create/join with a 6-character code, invite link, host/guest roles, synced play/pause/seek across tabs and windows |
| Tracking | Trakt device-code sign-in, scrobbling, history push, MDBList/Simkl keys, local watch stats and language breakdown |
| Debrid | Real-Debrid and Premiumize keys resolve torrent/magnet sources to direct HTTPS links in the browser |
| Ambient | Full-screen clock, rotating Indian artwork and a calm "Nuvio Ambient" screensaver |
| Settings | 13 static themes + a custom gradient/solid theme, AMOLED black, fonts, text size, reduce motion, poster size/shape, home layout, detail/stream layouts, India region and language, catalog order, playback defaults, debrid, JSON backup/restore |
| Account | Email sign-in against the same backend as the Android app, supporter membership, add-on restore/sync between devices |

## Architecture

```
web/src
├── components
│   ├── layout    AppShell, Sidebar, TopBar, MobileNav
│   ├── india     IndiaLanguageBar, IndiaQuickLinks
│   ├── media     PosterCard, PosterGrid, MediaRow, TopTenRow, HeroBanner, ContinueWatchingRow, LazyCatalogRow
│   ├── player    PlayerOverlay (hls.js)
│   └── ui        Button, IconButton, Modal, Tabs, Toggle, Slider, Select, Chip, Toasts, …
├── hooks         useHls, useCatalogs, usePartySync, useThemeSync, useMediaQuery, useDebounced, useFocusTrap
├── lib           stremio (protocol client), india (curated catalogue), jiotv, streams, debrid, trakt, meta, theme, format
├── screens       Home, Discover, IndiaCollection, JioTv, Search, Detail, Streams, Library, Collections, Addons, WatchParty, Tracking, Ambient, Settings, …
├── store         zustand stores (settings, addons, library, collections, profiles, player, party, tracking, debrid, search, ui)
└── types         Stremio protocol + app domain models
```

**Data flow:** add-ons come from the `addons` store (persisted), catalogs are fetched per row via
the Stremio protocol client, metadata is memoised in `lib/meta.ts`, and streams are resolved in
`lib/resolve.ts` (real add-ons only).

**Playback:** `useHls` lazily imports hls.js for HLS and dash.js for DASH (`.mpd`), so neither
engine is in the initial bundle. Progressive MP4/WebM use the native `<video>` element. When a
source needs custom headers or hits a CORS failure, the player retries through the same-origin
`/stream-proxy`; the Worker rewrites HLS playlists so manifests, keys and segments all stay on the
proxy. Sources whose containers the browser can't decode (MKV/AVI/TS) are labelled **TV only**.
Progress is written to the library store every 10 s and on exit.

### Design system

Colours, spacing and typography mirror the Compose theme in
`app/src/main/java/com/nuvio/tv/ui/theme/`. All 13 static palettes (the 12 from `ThemeColors.kt` /
`SupporterThemeColors.kt` plus the India-inspired **Saffron**) and the `custom` theme, whose
surfaces are derived from three user-chosen colours
(`customPalette`). They are applied as CSS custom properties, so a theme can change at runtime
without a rebuild. Each palette also exposes `--nuvio-on-accent`, a legible foreground for
accent-filled surfaces. Tailwind reads those variables (`bg-[rgb(var(--nuvio-accent))]`).

### Account, membership and add-on restore

The web build talks to the **same Supabase project as the Android app**, so one Nuvio account
works on both and the add-ons installed on the phone are restored in the browser.

Configure the backend in `web/.env` (see `.env.example`):

```
VITE_SUPABASE_URL=https://api.nuvio.tv
VITE_SUPABASE_ANON_KEY=<the project's publishable key>
```

The publishable ("anon") key is designed to be public — it already ships inside the Android APK
and in the `nuvio.tv` web bundle — so it is safe to bake into the web build. **Never** put the
Supabase *secret* key here: everything in the browser bundle is readable by every visitor.
Without these values the app still works; only accounts, the membership and cloud restore are
unavailable.

What the implementation mirrors from the Android client:

| Area | Android | Web |
| --- | --- | --- |
| Sign-in | `AuthManager.signInWithEmail` → `POST /auth/v1/token?grant_type=password` | `lib/supabase.ts` — the same call, no SDK |
| Session refresh | `AuthManager.refreshCurrentSessionSerialized` | `store/auth.ts` → `ensureToken()` |
| Membership | `get_my_member_access` RPC → `MemberAccess` | `lib/member-access.ts` — same tier + entitlement names |
| Theme gating | `ThemeAccess.kt` | `lib/member-access.ts` + `hooks/useThemeSync.ts` |
| Add-on restore | `AddonSyncService.getRemoteAddonUrls` + `reconcileWithRemoteAddonUrls` | `store/auth.ts` → `restoreAddons` + `store/addons.ts` → `restoreFromRemote` |
| Add-on sync | `sync_push_addons` RPC | `store/auth.ts` → `syncAddons` |

**Paywall rules** (identical on both clients):

- Gold, Jade, Rose Gold, Arctic Blue and Graphite need the matching entitlement
  (`GOLD_THEME`, `JADE_THEME`, …). Locked themes fall back to White and show a "Locked" badge.
- A custom theme gradient needs any member tier; non-members get the solid middle colour.
- The membership snapshot is cached per account (like `MemberAccessDataStore`) so a reload keeps
  the unlocked themes, and it is **never** applied to a different account or after signing out.

**Add-on restore** reads the account's `addons` rows (`user_id` = the sync owner from
`get_sync_owner`, `profile_id` = 1, the primary slot the Android app uses) and reconciles them
into the local list. As on Android, an empty remote list never wipes a populated local list, and
duplicate URLs are de-duplicated after canonicalisation.

### Responsive layout

The web build is a first-class responsive app, not a scaled-down TV layout.

| Breakpoint | Navigation | Notes |
| --- | --- | --- |
| `< 640px` | Bottom tab bar + slide-in drawer | Full-width search sheet, bottom-sheet modals, sticky detail action bar, full-width player menu |
| `640–1023px` | Bottom tab bar + drawer | Two-column rails, larger tap targets |
| `≥ 1024px` | Collapsible sidebar | Persisted open/closed state, edge open button, floating top bar, hover affordances |

- **Sidebar controls** are explicit at every size: the header chevron collapses the desktop sidebar,
  a floating panel button re-opens it when collapsed, and the mobile drawer has a hamburger open
  button plus close button/overlay/Escape. The collapsed state survives reloads.
- **Live TV** uses landscape channel grids and a dedicated Discover tab; type filters (Movies,
  Series, Live TV, Channels, …) are generated from installed add-on catalogs.
- **Rails** size their cards with `clamp()`, so a poster is ~104 px on a 360 px phone and up to the
  user's "Poster size" preference on a wide display. `scroll-snap` plus `scroll-padding` keeps the
  first card aligned with the page gutter, and an `edge-fade` mask softens cut-off cards.
- **Hero artwork** runs full-bleed under the floating top bar on Home and Detail; the bar turns
  frosted once the content scrolls.
- **Safe areas** are respected via `env(safe-area-inset-*)` on the tab bar, search sheet, drawer
  footer and bottom-sheet modals.
- **Immersive route** `/detail` hides the tab bar for its own action bar. `/stream` keeps the shell
  spacer and tab bar so its source list never slides under the top bar.
- The player's settings menu becomes a full-width bottom sheet on phones instead of overflowing.
- `h-[100dvh]` is used for the shell so mobile browser chrome doesn't clip the layout.

### India catalogue

The India landing rails are built from `src/lib/india-catalog.json`, a validated list of 162
Indian titles resolved through Cinemeta (title + year matching, so hand-typed IMDb IDs can't point
at the wrong film). Rebuild it after editing the curated list:

```bash
npm run catalog:india   # same as: node scripts/build-india-catalog.mjs
```

The script writes posters, backdrops, ratings, runtimes, languages, industries and rail tags. The
app still works without any add-ons: India rows read the JSON locally and detail pages fall back to
Cinemeta for `tt…` ids.

### Development helpers

Two headless-Chrome scripts are included for UI review (they need a local Chrome/Chromium; set
`CHROME_PATH` if it isn't in the default macOS location):

```bash
npm run preview &            # serve the build on :4173
npm run shoot                # screenshots -> /tmp/nuvio-shots (mobile/tablet/desktop)
npm run check:errors         # loads every route, reports console errors
```

The account flow can be exercised without a real backend:

```bash
npm run mock:supabase &      # mock Supabase on :54321
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-key npm run dev
npm run check:auth           # drives sign-in, the paywall and add-on restore
npm run check:auth:live      # same checks against the real backend
```

## Known limitations

- **Torrent sources need a debrid service.** Real-Debrid and Premiumize are resolved in the browser
  from Settings → Debrid; TorBox is not supported because its API blocks browser origins. Without a
  debrid key, torrent/magnet sources are listed but flagged.
- **Container/codec limits remain.** The TV app's Media3 plays MKV, AVI, MPEG-TS, 10-bit HEVC,
  Dolby Vision and AC3/DTS audio; browsers often cannot. Those sources are labelled **TV only** and
  hidden by the "Playable in browser" filter. Prefer MP4, HLS or DASH sources.
- **JioTV playback depends on the CDN host.** Channels served from
  `jiotvmblive.cdn.jio.com` reject requests that carry an `Origin` header, so they cannot play in a
  browser (the former embed player is blocked the same way). Channels on `jiotvpllive.cdn.jio.com`,
  `times-ott-live.akamaized.net` and CloudFront hosts play directly. The player shows a clear
  unavailable state with a provider link instead of falling back to an embed iframe, and the
  channel directory falls back to the Pind list when the resolver is slow.
- **The stream proxy is part of the Cloudflare Worker** (and the Vite dev server). Static hosts
  without `/stream-proxy` can only play sources that already send permissive CORS headers.
- **Watch party sync is browser-local.** Tabs and windows that share the same browser stay in sync
  through `localStorage` and `BroadcastChannel`; cross-device rooms still need the Nuvio mobile app.
- Custom request headers (`behaviorHints.proxyHeaders`) can't be attached to an HTML `<video>`
  element, so some add-ons that require them won't play.
- Casting, media-server (Jellyfin/Emby) playback, full Trakt library import, plugins and watch-party
  video calls from the Android app are not ported yet.
- Add-ons must send permissive CORS headers. Cinemeta and most public add-ons do; a self-hosted
  add-on behind a restricted proxy may need CORS enabled.
- Trakt tokens are stored locally and are not refreshed automatically; reconnect if a token expires.

## Deployment

The build is a static SPA — serve `dist/` with a history-API fallback:

- **Netlify/Vercel/Cloudflare Pages:** publish `web/dist`, SPA fallback on.
- **nginx:** `try_files $uri $uri/ /index.html;`
- **Static hosts without rewrites:** switch `BrowserRouter` to `HashRouter` in `src/main.tsx`.

### JioTV TV add-on

The Worker also exposes a Stremio/Nuvio add-on for TV clients:

| Route | Purpose |
| --- | --- |
| `/jiotv-addon/manifest.json` | Add-on manifest |
| `/jiotv-addon/catalog/channel/jiotv.json` | Live channel catalog |
| `/jiotv-addon/meta/channel/jiotv:<id>.json` | Channel metadata |
| `/jiotv-addon/stream/channel/jiotv:<id>.json` | Playback URL |

Install it in Nuvio TV → Addons → paste:

```
https://tv.sachikantaraul.dev/jiotv-addon/manifest.json
```

It appears as a **catalog row** (JioTV Live) on Home/Discover, not as a sidebar item.
The web `/jiotv` screen is unchanged.

By default streams point at the same `/jiotv-api` HLS pipeline, so they play only
for CDN hosts the Worker can reach. Set the `JIOTV_ADDON_RELAY_URL` Worker
variable to a home `jiotv_go` relay and the add-on will use
`<relay>/live/<id>.m3u8` instead, which unlocks `jiotvmblive`/`jiotvpllive`
channels without changing the catalog.


### Cloudflare Worker (this repo's own target)

`wrangler.jsonc` deploys to the existing **Cloudflare Worker `android-tv-expo-web`**, which is
also bound to the custom domain `tv.sachikantaraul.dev`:

```bash
npm run deploy        # build + wrangler deploy
npm run deploy:dry    # build + validate the bundle without publishing
```

The Worker serves these routes:

| Path | Served by |
| --- | --- |
| `/` and all other paths | the `ASSETS` binding — this app's `dist/`, with `not_found_handling: single-page-application` so client-side routes resolve to `index.html` |
| `/netmirror-api/*` | `worker/netmirror.js` — the NetMirror edge proxy (HLS/media/subtitles straight from the CDN, metadata and sign-in proxied to the always-on bridge) |
| `/stream-proxy?url=…` | `worker/stream-proxy.js` — same-origin media proxy for add-on `proxyHeaders` and CORS-blocked HLS/MP4 streams; rewrites HLS playlists so segments and keys stay on the proxy |
| `/jiotv-api/*` | `worker/jiotv-direct.js` — DASH→HLS conversion, CENC decryption, init/fragment sanitising and the resolver route |
| `/jiotv-addon/*` | `worker/jiotv-addon.js` — Stremio/Nuvio add-on manifest, catalog, meta and stream routes |

`worker/netmirror.js` is a byte-identical copy of the module that is already live on that Worker,
so the proxy behaviour is unchanged by a web deploy. Its canonical source lives in the movie-web
project (`streammmmovie-web/movie-web/movie-web/worker/`) — keep the two in sync if the proxy
changes. The Worker also holds a `NETMIRROR_KV` namespace binding and the `NETMIRROR_TOKEN` /
`NETMIRROR_REGISTER_TOKEN` secrets; **never commit or echo those values.**

> Deploying from this project replaces the Worker's root assets. If the movie-web project is
> deployed again it will take the root back.

## License

GNU General Public License v3.0 — see the [root LICENSE](../LICENSE).
