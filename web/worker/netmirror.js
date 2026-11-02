/**
 * NetMirror edge proxy.
 *
 * Two very different workloads share the `/netmirror-api` prefix:
 *
 *  1. `/hls`, `/seg`, `/vtt` are plain CDN requests that only need a
 *     `Referer: https://net52.cc/` header. They are served directly from the
 *     edge. Video never touches the bridge, which keeps the always-on host
 *     cheap (metadata only) and puts the CDN bytes as close to the viewer as
 *     Cloudflare's network allows.
 *
 *  2. `/api/*` needs a real browser (Google OAuth + Cloudflare Turnstile) and
 *     is forwarded to the NetMirror bridge. The bridge runs on an always-on
 *     host and announces its current HTTPS tunnel URL through
 *     `POST /netmirror-api/_bridge/register`. The URL is kept in KV so tunnel
 *     restarts heal themselves without redeploying the Worker or editing
 *     secrets.
 */

const PREFIX = "/netmirror-api";
const NET52 = "https://net52.cc";
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const BRIDGE_URL_KEY = "bridge:url";
const BRIDGE_UPDATED_KEY = "bridge:updated";
// The bridge re-registers every few minutes. If the host disappears, the entry
// expires and the app reports a clear "bridge offline" error instead of
// hammering a dead tunnel forever.
const BRIDGE_TTL_SECONDS = 60 * 60;

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "OPTIONS"]);
const ALLOWED_HOSTS = [
  "net52.cc",
  "freecdn1.top",
  "freecdn2.top",
  "freecdn3.top",
  "freecdn4.top",
  "nfmirrorcdn.top",
  "imgcdn.kim",
  "subscdn.top",
  "nflxso.net",
];

const MIRROR_HOSTS = [
  "makhi4.top",
  "makhi7.top",
  "makhi13.top",
  "makhi1.top",
  "makhi2.top",
  "makhi3.top",
  "makhi5.top",
  "makhi6.top",
  "makhi10.top",
  "makhi14.top",
];

const CDN4_HOSTS = [
  "s00021.freecdn4.top",
  "hd1.freecdn4.top",
  "f6.freecdn4.top",
  "s0022.freecdn4.top",
];

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function trimBase(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

export async function handleNetMirror(request, env, url, ctx) {
  const suffix = url.pathname.slice(PREFIX.length) || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": url.origin,
        "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
        "access-control-allow-headers":
          "content-type,range,authorization,x-netmirror-token,x-netmirror-register-token",
        "access-control-max-age": "600",
      },
    });
  }

  if (suffix === "/_bridge/register") {
    return registerBridge(request, env);
  }

  if (suffix === "/_bridge/status") {
    return bridgeStatus(request, env);
  }

  if (suffix === "/hls") return handleHls(request, url, ctx);
  if (suffix === "/seg") return handleMedia(request, url);
  if (suffix === "/vtt") return handleVtt(request, url);

  return proxyToBridge(request, env, url, suffix);
}

/* -------------------------------------------------------------------------- */
/* Bridge discovery                                                           */
/* -------------------------------------------------------------------------- */

async function currentBridge(env) {
  if (env.NETMIRROR_KV) {
    try {
      const registered = await env.NETMIRROR_KV.get(BRIDGE_URL_KEY);
      if (registered) {
        return { base: trimBase(registered), source: "kv" };
      }
    } catch {
      // KV is optional; fall back to the static secret.
    }
  }

  const configured = trimBase(env.NETMIRROR_BRIDGE_URL);
  if (configured) return { base: configured, source: "secret" };
  return { base: "", source: "none" };
}

async function registerBridge(request, env) {
  if (!env.NETMIRROR_REGISTER_TOKEN) {
    return json(503, {
      error: "bridge-registration-disabled",
      message:
        "Set the NETMIRROR_REGISTER_TOKEN secret on this Worker to enable self-registration.",
    });
  }

  const supplied =
    request.headers.get("x-netmirror-register-token") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (supplied !== env.NETMIRROR_REGISTER_TOKEN) {
    return json(401, {
      error: "unauthorized",
      message: "Invalid bridge registration token.",
    });
  }

  if (!env.NETMIRROR_KV) {
    return json(503, {
      error: "kv-not-configured",
      message:
        "Add the NETMIRROR_KV namespace binding so the bridge URL can be stored.",
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, {
      error: "invalid-json",
      message: "Expected a JSON body.",
    });
  }

  let candidate;
  try {
    candidate = new URL(String(payload?.url || ""));
  } catch {
    return json(400, {
      error: "invalid-url",
      message: 'Body must be {"url":"https://<tunnel>.trycloudflare.com"}.',
    });
  }

  if (candidate.protocol !== "https:") {
    return json(400, {
      error: "invalid-url",
      message: "The bridge URL must use HTTPS.",
    });
  }

  // Only accept the Quick Tunnel hostname shape. This endpoint is public
  // (token protected), and restricting the host prevents it from being turned
  // into an arbitrary proxy target.
  if (!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(candidate.hostname)) {
    return json(400, {
      error: "invalid-host",
      message: "Only https://*.trycloudflare.com tunnel URLs are accepted.",
    });
  }

  const base = candidate.origin;
  await env.NETMIRROR_KV.put(BRIDGE_URL_KEY, base, {
    expirationTtl: BRIDGE_TTL_SECONDS,
  });
  await env.NETMIRROR_KV.put(BRIDGE_UPDATED_KEY, String(Date.now()), {
    expirationTtl: BRIDGE_TTL_SECONDS,
  });

  return json(200, {
    ok: true,
    url: base,
    expiresIn: BRIDGE_TTL_SECONDS,
  });
}

async function bridgeStatus(request, env) {
  const bridge = await currentBridge(env);
  let updatedAt = null;
  if (env.NETMIRROR_KV) {
    updatedAt = await env.NETMIRROR_KV.get(BRIDGE_UPDATED_KEY).catch(
      () => null,
    );
  }

  const supplied =
    request.headers.get("x-netmirror-register-token") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const verbose =
    Boolean(env.NETMIRROR_REGISTER_TOKEN) &&
    supplied === env.NETMIRROR_REGISTER_TOKEN;

  return json(200, {
    configured: Boolean(bridge.base),
    source: bridge.source,
    updatedAt: updatedAt ? Number(updatedAt) : null,
    ...(verbose ? { url: bridge.base || null } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Bridge proxy (/api/*)                                                      */
/* -------------------------------------------------------------------------- */

async function proxyToBridge(request, env, url, suffix) {
  const bridge = await currentBridge(env);

  if (!bridge.base) {
    return json(503, {
      error: "netmirror-bridge-not-configured",
      message:
        "The NetMirror bridge has not registered yet. Start the bridge host; it registers itself automatically.",
    });
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return json(405, {
      error: "method-not-allowed",
      message: `Method ${request.method} is not supported by the NetMirror proxy.`,
    });
  }

  // Reject cross-site browser calls. This is not a replacement for the bridge
  // token, but it prevents another website from using the proxy casually.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return json(403, {
      error: "cross-origin-not-allowed",
      message: "The NetMirror proxy only accepts same-origin requests.",
    });
  }

  let target;
  try {
    target = new URL(`${bridge.base}${suffix}${url.search}`);
  } catch {
    return json(502, {
      error: "invalid-bridge-url",
      message: "The registered bridge URL is not a valid absolute URL.",
    });
  }

  const headers = new Headers(request.headers);
  for (const key of [...headers.keys()]) {
    if (
      key === "host" ||
      key === "cookie" ||
      key === "accept-encoding" ||
      key === "x-real-ip" ||
      key === "true-client-ip" ||
      key.startsWith("cf-") ||
      key.startsWith("x-forwarded-")
    ) {
      headers.delete(key);
    }
  }

  // The bridge uses this to rewrite HLS playlists back through the Worker,
  // regardless of whether it is also reachable directly.
  headers.set("x-netmirror-public-base", `${url.origin}${PREFIX}`);

  // Never forward a browser-supplied token; only the Worker holds the secret.
  headers.delete("authorization");
  headers.delete("x-netmirror-token");
  if (env.NETMIRROR_TOKEN) {
    headers.set("authorization", `Bearer ${env.NETMIRROR_TOKEN}`);
  }

  const init = {
    method: request.method,
    headers,
    redirect: "follow",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (error) {
    return json(502, {
      error: "netmirror-bridge-unreachable",
      message: `Could not reach the NetMirror bridge (${bridge.source}): ${errorMessage(
        error,
      )}`,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

/* -------------------------------------------------------------------------- */
/* HLS / media / subtitles (served from the edge)                             */
/* -------------------------------------------------------------------------- */

function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (/^makhi\d+\.top$/.test(host)) return true;
  // NetMirror rotates numbered CDN families, e.g. s88.nm-cdn30.top and
  // s22.freecdn41.top. Keep the match scoped to those suffixes so this cannot
  // be used as a general-purpose SSRF proxy.
  if (/^(?:[a-z0-9-]+\.)?(?:freecdn\d+|nm-cdn\d+)\.top$/i.test(host)) {
    return true;
  }
  return ALLOWED_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function requireUpstreamUrl(value) {
  if (!value) throw new Error("Missing u parameter");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid u parameter");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported protocol");
  }
  if (!isAllowedHost(url.hostname)) {
    throw new Error(`Host is not allowed: ${url.hostname}`);
  }
  return url;
}

function hostCandidates(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (/^makhi\d+\.top$/.test(host)) return MIRROR_HOSTS;
  if (host.endsWith(".freecdn4.top")) return CDN4_HOSTS;
  if (host.endsWith(".freecdn1.top")) {
    return [
      "s00021.freecdn1.top",
      "hd1.freecdn1.top",
      "f6.freecdn1.top",
      "s0022.freecdn1.top",
    ];
  }
  return [];
}

async function fetchUpstream(
  url,
  { headers = {}, method = "GET", range, timeoutMs = 60_000, retries = 3 } = {},
) {
  const requestHeaders = {
    "user-agent": DEFAULT_UA,
    referer: `${NET52}/`,
    accept: "*/*",
    ...headers,
  };
  if (range) requestHeaders.range = range;

  let response;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 403 && response.status !== 429) return response;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return response;
}

/**
 * NetMirror rotates a pool of CDN front hosts. One host frequently returns 500
 * (or times out) for every track while the same path works on another host.
 * Retry the path across a small set of known-good fronts.
 */
async function fetchUpstreamWithFailover(url, options = {}) {
  const parsed = new URL(url);
  const preferred = hostCandidates(parsed.hostname);
  if (preferred.length === 0) {
    return { response: await fetchUpstream(url, options), finalUrl: url };
  }

  const ordered = [...new Set([...preferred, parsed.hostname])].slice(0, 4);
  let lastResponse;
  let lastError;

  for (const host of ordered) {
    const candidate = new URL(url);
    candidate.hostname = host;
    try {
      const response = await fetchUpstream(candidate.toString(), {
        ...options,
        timeoutMs: options.timeoutMs ?? 7000,
        retries: 1,
      });
      if (response.ok && /\.m3u8$/i.test(candidate.pathname)) {
        const text = await response.text();
        if (text.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U")) {
          return {
            response: new Response(text, {
              status: response.status,
              headers: response.headers,
            }),
            finalUrl: candidate.toString(),
          };
        }
        lastResponse = response;
        continue;
      }
      if (response.ok || response.status === 206 || response.status === 304) {
        return { response, finalUrl: candidate.toString() };
      }
      lastResponse = response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return { response: lastResponse, finalUrl: url };
  throw lastError ?? new Error("All CDN fronts failed");
}

function rewritePlaylist(text, baseUrl, publicBase) {
  const proxied = (raw) => {
    const absolute = new URL(raw.trim(), baseUrl).toString();
    const { pathname } = new URL(absolute);
    const endpoint = /\.m3u8$/i.test(pathname) ? "hls" : "seg";
    return `${publicBase}/${endpoint}?u=${encodeURIComponent(absolute)}`;
  };

  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_match, uri) => `URI="${proxied(uri)}"`,
        );
      }
      return proxied(trimmed);
    })
    .join("\n");
}

function toWebVtt(text) {
  const clean = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (/^WEBVTT/.test(clean)) return `${clean}\n`;
  const body = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}\n`;
}

async function handleHls(request, url, ctx) {
  let target;
  try {
    target = requireUpstreamUrl(url.searchParams.get("u"));
  } catch (error) {
    return json(400, {
      error: "invalid-upstream",
      message: errorMessage(error),
    });
  }

  const publicBase = `${url.origin}${PREFIX}`;
  const cacheKey = new Request(
    `${publicBase}/hls?u=${encodeURIComponent(target.toString())}`,
    { method: "GET" },
  );
  const cache = typeof caches !== "undefined" ? caches.default : null;

  if (cache && request.method === "GET") {
    const hit = await cache.match(cacheKey).catch(() => null);
    if (hit) return hit;
  }

  let upstream;
  let finalUrl;
  try {
    ({ response: upstream, finalUrl } = await fetchUpstreamWithFailover(
      target.toString(),
    ));
  } catch (error) {
    return json(502, {
      error: "upstream-unreachable",
      message: `Could not reach the NetMirror CDN: ${errorMessage(error)}`,
    });
  }

  if (!upstream.ok) {
    const message = await upstream.text().catch(() => "");
    return new Response(
      `Upstream playlist error ${upstream.status}: ${message.slice(0, 300)}`,
      {
        status: upstream.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const text = await upstream.text();
  if (
    text.trimStart().startsWith("#EXTM3U") ||
    contentType.includes("mpegurl")
  ) {
    const rewritten = rewritePlaylist(text, finalUrl, publicBase);
    const response = new Response(
      request.method === "HEAD" ? null : rewritten,
      {
        status: 200,
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": "public, max-age=20",
          "access-control-allow-origin": "*",
          "content-length": String(
            new TextEncoder().encode(rewritten).length,
          ),
        },
      },
    );

    if (cache && ctx && request.method === "GET") {
      ctx.waitUntil(
        cache.put(cacheKey, response.clone()).catch(() => undefined),
      );
    }
    return response;
  }

  // Some CDNs serve media playlists as text/plain; if it is not a playlist it
  // is a segment, so stream it through the binary path.
  return mediaResponse(request, upstream);
}

async function handleMedia(request, url) {
  let target;
  try {
    target = requireUpstreamUrl(url.searchParams.get("u"));
  } catch (error) {
    return json(400, {
      error: "invalid-upstream",
      message: errorMessage(error),
    });
  }

  let upstream;
  try {
    ({ response: upstream } = await fetchUpstreamWithFailover(
      target.toString(),
      { range: request.headers.get("range") || undefined },
    ));
  } catch (error) {
    return json(502, {
      error: "upstream-unreachable",
      message: `Could not reach the NetMirror CDN: ${errorMessage(error)}`,
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream segment error ${upstream.status}`, {
      status: upstream.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return mediaResponse(request, upstream);
}

function mediaResponse(request, upstream) {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "video/mp2t");
  headers.set("cache-control", "public, max-age=3600");
  headers.set("access-control-allow-origin", "*");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function handleVtt(request, url) {
  let target;
  try {
    target = requireUpstreamUrl(url.searchParams.get("u"));
  } catch (error) {
    return json(400, {
      error: "invalid-upstream",
      message: errorMessage(error),
    });
  }

  let upstream;
  try {
    upstream = await fetchUpstream(target.toString(), {
      headers: { accept: "text/plain,*/*" },
    });
  } catch (error) {
    return json(502, {
      error: "upstream-unreachable",
      message: `Could not reach the subtitle source: ${errorMessage(error)}`,
    });
  }

  if (!upstream.ok) {
    return new Response(`Subtitle source returned HTTP ${upstream.status}`, {
      status: upstream.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const vtt = toWebVtt(await upstream.text());
  return new Response(request.method === "HEAD" ? null : vtt, {
    status: 200,
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
