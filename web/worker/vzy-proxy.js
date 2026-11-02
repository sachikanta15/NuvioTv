/**
 * `/vzy-api` — same-origin proxy for VZY SSO, OTP, and dynamic stream resolution.
 *
 * Forwards OTP authentication and dynamic stream requests to Watcho/VZY backends
 * with the required headers and CORS allowance for browser clients.
 */

const SSO_BASE = "https://sms-prod.dish.watcho.com";
const SSO_X_API_KEY = "xHQ3Gdzbqp57D6Smu1a1fnJwEfo190H5oHTUHy43";

const DRM_BASE = "https://vzy-sso.dish.watcho.com/v1";
const DRM_X_API_KEY = "OtQoJFYdAy8H8fOARcvXS39GtcvjCfEF8ZGJujRw";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

export async function handleVzyProxy(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const path = url.pathname.replace(/^\/vzy-api/, "");

  // 1. Generate OTP
  if (path === "/otp/generate") {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    try {
      const body = await request.json();
      const res = await fetch(`${SSO_BASE}/v1/generate-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SSO_X_API_KEY,
        },
        body: JSON.stringify({
          phoneNumber: String(body.phoneNumber || "").trim(),
          countryCode: Number(body.countryCode || 91),
          source: "web",
        }),
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // 2. Verify OTP & Login
  if (path === "/otp/login") {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    try {
      const body = await request.json();
      const res = await fetch(`${SSO_BASE}/v1/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SSO_X_API_KEY,
        },
        body: JSON.stringify({
          phoneNumber: String(body.phoneNumber || "").trim(),
          otp: String(body.otp || "").trim(),
          countryCode: Number(body.countryCode || 91),
          apiVersion: "11.0.2.1",
          partnerId: 5093,
          ClientTag: "KSPWeb-v0.0.115",
          kaltura_url: "https://5093.dsp1.ott.kaltura.com/api_v3/",
          udid: String(body.udid || `web_${Date.now()}`),
          City: String(body.city || ""),
          Source: "Web",
        }),
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // 3. Resolve dynamic stream URL for partner channels
  if (path === "/stream") {
    try {
      const token = request.headers.get("authorization") || url.searchParams.get("token") || "";
      const params = new URLSearchParams(url.search);
      params.delete("token");

      const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

      const res = await fetch(`${DRM_BASE}/stream?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "x-api-key": DRM_X_API_KEY,
          ...(token ? { Authorization: authHeader } : {}),
        },
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  // 4. Content auth token for Nagra DRM
  if (path === "/content-auth-token") {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
    try {
      const body = await request.json();
      const res = await fetch(`${DRM_BASE}/content-auth-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-partner-name": "nagra",
          "x-api-key": DRM_X_API_KEY,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

