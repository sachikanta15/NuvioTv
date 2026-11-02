/**
 * Same-origin stream proxy helpers.
 *
 * Browsers cannot attach custom request headers to `<video>`/hls.js requests,
 * and many add-on CDNs don't send CORS headers. The Cloudflare Worker (and the
 * Vite dev middleware) expose `/stream-proxy`, which forwards the request with
 * the headers the add-on asked for and adds CORS headers on the response.
 */

export type ProxyHeaders = Record<string, string> | null | undefined;

export function isAlreadyProxied(url: string): boolean {
  return url.startsWith("/stream-proxy?") || url.includes("/stream-proxy?");
}

/** Builds a same-origin proxy URL, optionally carrying request headers. */
export function streamProxyUrl(url: string, headers?: ProxyHeaders): string {
  const params = new URLSearchParams({ url });
  if (headers && Object.keys(headers).length > 0) {
    params.set("h", JSON.stringify(headers));
  }
  return `/stream-proxy?${params.toString()}`;
}

/** True when a source advertises headers or says it isn't web-ready. */
export function sourceNeedsProxy(source: {
  headers?: ProxyHeaders;
  proxyRequired?: boolean;
}): boolean {
  return !!source.proxyRequired || !!(source.headers && Object.keys(source.headers).length > 0);
}

/** Rewrites a source URL through the proxy unless it is already proxied. */
export function proxySourceUrl(url: string, headers?: ProxyHeaders): string {
  if (isAlreadyProxied(url)) return url;
  return streamProxyUrl(url, headers);
}
