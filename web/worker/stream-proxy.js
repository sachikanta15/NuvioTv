/**
 * `/stream-proxy` — same-origin media proxy for the web player.
 *
 * Why it exists:
 *   - Browsers cannot attach `behaviorHints.proxyHeaders` to `<video>` or
 *     hls.js requests, while the Android TV client can.
 *   - Some add-on CDNs don't send CORS headers, so hls.js cannot fetch the
 *     manifest/segments even though Media3 can.
 *
 * The proxy forwards Range/HEAD requests, applies the add-on's headers, adds
 * CORS headers, and rewrites HLS playlists so every segment/key request also
 * goes through the proxy. It refuses private hosts and non-media content to
 * avoid becoming a general-purpose open proxy.
 */

const PREFIX = "/stream-proxy";

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\]|::1)/i;

const MEDIA_CONTENT_TYPE =
  /^(video\/|audio\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|mpegurl|dash\+xml|octet-stream|binary|mp4|mpegurl)|binary\/octet-stream|text\/plain)/i;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function proxied(origin, target, headersParam) {
  const params = new URLSearchParams({ url: target });
  if (headersParam) params.set("h", headersParam);
  return `${origin}${PREFIX}?${params.toString()}`;
}

function rewriteHlsPlaylist(text, manifestUrl, origin, headersParam) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
          try {
            return `URI="${proxied(origin, new URL(uri, manifestUrl).toString(), headersParam)}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        return proxied(origin, new URL(trimmed, manifestUrl).toString(), headersParam);
      } catch {
        return line;
      }
    })
    .join("\n");
}

function rewriteDashManifest(text, manifestUrl) {
  const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);

  // 1. Rewrite any relative <BaseURL> tags to absolute URLs
  let rewritten = text.replace(
    /<BaseURL([\s\S]*?)>([\s\S]*?)<\/BaseURL>/gi,
    (match, attrs, content) => {
      const trimmed = content.trim();
      if (!trimmed || /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed)) {
        return match;
      }
      try {
        const absolute = new URL(trimmed, baseDir).toString();
        return `<BaseURL${attrs}>${absolute}</BaseURL>`;
      } catch {
        return match;
      }
    },
  );

  // 2. If the manifest still does not contain any <BaseURL> at all, inject baseDir at the top
  if (!/<BaseURL[\s>]/i.test(rewritten)) {
    rewritten = rewritten.replace(/(<MPD[\s\S]*?>)/i, `$1\n  <BaseURL>${baseDir}</BaseURL>`);
  }

  return rewritten;
}

export async function handleStreamProxy(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError("Only GET and HEAD are allowed", 405);
  }

  // Cheap health check used by the client before retrying through the proxy.
  if (url.searchParams.has("ping")) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }

  const target = url.searchParams.get("url");
  if (!target) return jsonError("Missing url", 400);

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return jsonError("Invalid url", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return jsonError("Only http(s) is allowed", 400);
  }
  if (PRIVATE_HOST.test(parsed.hostname)) {
    return jsonError("Private hosts are not allowed", 403);
  }

  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);
  headers.set("Accept", request.headers.get("Accept") || "*/*");
  headers.set(
    "User-Agent",
    request.headers.get("User-Agent") ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  );
  if (!parsed.hostname.toLowerCase().includes("jio.com")) {
    headers.set("Referer", `${parsed.origin}/`);
    headers.set("Origin", parsed.origin);
  }

  const encodedHeaders = url.searchParams.get("h");
  if (encodedHeaders) {
    try {
      const extra = JSON.parse(encodedHeaders);
      if (extra && typeof extra === "object") {
        for (const [key, value] of Object.entries(extra)) {
          if (typeof value === "string" && /^[a-z0-9-]+$/i.test(key)) {
            headers.set(key, value);
          }
        }
      }
    } catch {
      // Ignore malformed headers; the request still works without them.
    }
  }

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: "follow",
    });
  } catch {
    return jsonError("Upstream fetch failed", 502);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const looksLikePlaylist =
    /mpegurl|m3u8/i.test(contentType) ||
    /\.m3u8?(\?|$)/i.test(parsed.pathname + parsed.search);
  const isDashManifest =
    /dash\+xml/i.test(contentType) ||
    /\.mpd(\?|$)/i.test(parsed.pathname + parsed.search);

  if (
    upstream.ok &&
    contentType &&
    !MEDIA_CONTENT_TYPE.test(contentType) &&
    !looksLikePlaylist &&
    !isDashManifest
  ) {
    return jsonError(`Unsupported content type: ${contentType}`, 415);
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Expose-Headers", "*");
  responseHeaders.delete("set-cookie");
  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("x-frame-options");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  if (looksLikePlaylist) {
    const text = await upstream.text();
    if (upstream.ok && !/text\/html/i.test(contentType)) {
      const rewritten = rewriteHlsPlaylist(text, parsed.toString(), url.origin, encodedHeaders);
      return new Response(rewritten, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    return new Response(text, { status: upstream.status, headers: responseHeaders });
  }

  if (isDashManifest) {
    const text = await upstream.text();
    if (upstream.ok && !/text\/html/i.test(contentType)) {
      const rewritten = rewriteDashManifest(text, parsed.toString());
      return new Response(rewritten, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    return new Response(text, { status: upstream.status, headers: responseHeaders });
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
