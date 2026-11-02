/**
 * Worker entry point for `android-tv-expo-web`.
 *
 * Static assets (the Nuvio TV web build in `dist/`) are served by the ASSETS
 * binding with an SPA fallback, so client-side routes like
 * `/detail/movie/tt0111161` resolve to `index.html`.
 *
 * `/netmirror-api/*` is handled by `worker/netmirror.js`:
 *   - HLS/media/subtitles are fetched from the NetMirror CDN at the edge,
 *   - metadata and the sign-in browser are proxied to the always-on bridge,
 *   - the bridge registers its tunnel URL in KV, so it survives restarts
 *     without redeploying this Worker or editing secrets.
 *
 * `/jiotv-api/*` is handled by `worker/jiotv-direct.js`:
 *   - DASH manifests are converted to HLS playlists and CENC/AES-CTR
 *     encrypted segments are decrypted at the edge, so JioTV channels play
 *     natively in the browser player.
 *
 * Keeping the proxy server-side means the browser calls same-origin HTTPS (no
 * mixed content, no CORS/PNA preflight) and neither the bridge URL nor the
 * bridge token is shipped to the client.
 *
 * NOTE: `worker/netmirror.js` is kept byte-identical to the copy that is
 * already live on this Worker, so the proxy behaviour does not change when the
 * web app is redeployed. The canonical source of both modules lives in the
 * movie-web project (`streammmmovie-web/movie-web/movie-web/worker/`) — keep
 * them in sync if the proxy is ever changed.
 */

import { handleNetMirror } from "./netmirror.js";
import { handleJioTvDirect } from "./jiotv-direct.js";
import { handleStreamProxy } from "./stream-proxy.js";

const NETMIRROR_PREFIX = "/netmirror-api";
const JIOTV_PREFIX = "/jiotv-api";
const STREAM_PROXY_PREFIX = "/stream-proxy";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      url.pathname === JIOTV_PREFIX ||
      url.pathname.startsWith(`${JIOTV_PREFIX}/`)
    ) {
      return handleJioTvDirect(request, env, url);
    }

    if (
      url.pathname === NETMIRROR_PREFIX ||
      url.pathname.startsWith(`${NETMIRROR_PREFIX}/`)
    ) {
      return handleNetMirror(request, env, url, ctx);
    }

    if (
      url.pathname === STREAM_PROXY_PREFIX ||
      url.pathname.startsWith(`${STREAM_PROXY_PREFIX}/`)
    ) {
      return handleStreamProxy(request, env, url);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
