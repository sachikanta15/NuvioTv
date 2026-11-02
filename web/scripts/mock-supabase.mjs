/**
 * Dev-only mock of the Supabase REST endpoints the web app uses.
 *
 * It lets the sign-in, paywall and add-on restore flows be exercised without
 * touching the real backend. Run it, then point the app at it:
 *
 *   node scripts/mock-supabase.mjs
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-key npm run dev
 *
 * Sign in with member@example.com (supporter) or plain@example.com (free).
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const ANON_KEY = "test-key";

const USERS = {
  "member@example.com": {
    id: "user-member",
    password: "member123",
    tier: "SUPPORTER",
    entitlements: [
      "GOLD_THEME",
      "JADE_THEME",
      "ROSE_GOLD_THEME",
      "ARCTIC_BLUE_THEME",
      "GRAPHITE_THEME",
      "PROFILE_BACKGROUNDS",
      "PROFILE_AVATARS",
    ],
  },
  "plain@example.com": {
    id: "user-plain",
    password: "plain123",
    tier: "SUPPORTER",
    entitlements: [],
  },
};

const ADDONS = [
  {
    id: "a1",
    user_id: "user-member",
    url: "https://v3-cinemeta.strem.io",
    name: "Cinemeta",
    enabled: true,
    sort_order: 0,
    profile_id: 1,
  },
  {
    id: "a2",
    user_id: "user-member",
    url: "https://opensubtitles-v3.strem.io",
    name: "OpenSubtitles v3",
    enabled: true,
    sort_order: 1,
    profile_id: 1,
  },
  {
    id: "a3",
    user_id: "user-member",
    url: "https://anime-kitsu.strem.fun",
    name: "Anime Kitsu",
    enabled: false,
    sort_order: 2,
    profile_id: 1,
  },
  {
    // Same add-on written with the full manifest URL — the client must
    // de-duplicate it against the first row.
    id: "a4",
    user_id: "user-member",
    url: "https://v3-cinemeta.strem.io/manifest.json",
    name: "Cinemeta (mirror)",
    enabled: true,
    sort_order: 3,
    profile_id: 1,
  },
];

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, accept");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function token(user) {
  return {
    access_token: `mock-access-token-${user.id}`,
    refresh_token: `mock-refresh-token-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    user: { id: user.id, email: Object.keys(USERS).find((key) => USERS[key] === user) },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- auth -------------------------------------------------------------
  if (path === "/auth/v1/token" && req.method === "POST") {
    const body = await readBody(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const id = String(body.refresh_token ?? "").replace("mock-refresh-token-", "");
      const user = Object.values(USERS).find((entry) => entry.id === id);
      if (!user) return json(res, 400, { error: "invalid_grant", msg: "Invalid refresh token" });
      return json(res, 200, token(user));
    }
    const user = Object.values(USERS).find(
      (entry) =>
        Object.keys(USERS).find((key) => USERS[key] === entry) === String(body.email ?? "").toLowerCase(),
    );
    if (!user || user.password !== body.password) {
      return json(res, 400, { error: "invalid_grant", msg: "Invalid login credentials" });
    }
    return json(res, 200, token(user));
  }

  if (path === "/auth/v1/signup" && req.method === "POST") {
    return json(res, 422, { msg: "User already registered" });
  }

  // ---- rpc --------------------------------------------------------------
  if (path.startsWith("/rest/v1/rpc/") && req.method === "POST") {
    const fn = path.slice("/rest/v1/rpc/".length);
    const auth = req.headers.authorization ?? "";
    const userId = auth.replace("Bearer mock-access-token-", "");
    const user = Object.values(USERS).find((entry) => entry.id === userId);
    if (!user) return json(res, 401, { msg: "JWT expired" });

    if (fn === "get_my_member_access") {
      return json(res, 200, [{ tier: user.tier, entitlements: user.entitlements }]);
    }
    if (fn === "get_my_membership_overview") {
      return json(res, 200, [
        {
          status: "active",
          tier: user.tier,
          supporter_since: "2024-03-11",
          provider_connected: true,
          has_subscription: true,
          subscription_access_active: true,
          subscription_status: "active",
          provider: "patreon",
          has_active_grant: false,
          grant_is_lifetime: false,
          grant_expires_at: null,
          grant_kind: null,
          grant_tier: null,
          has_lifetime_grant: false,
          lifetime_grant_tier: null,
          current_period_end: null,
          cancels_at_period_end: false,
          monthly_amount_cents: 500,
          currency_code: "USD",
        },
      ]);
    }
    if (fn === "get_sync_owner") return json(res, 200, user.id);
    if (fn === "sync_push_addons") return json(res, 200, null);
    return json(res, 404, { msg: `Unknown function ${fn}` });
  }

  // ---- table ------------------------------------------------------------
  if (path === "/rest/v1/addons" && req.method === "GET") {
    const auth = req.headers.authorization ?? "";
    const userId = auth.replace("Bearer mock-access-token-", "");
    const wanted = url.searchParams.get("user_id")?.replace("eq.", "");
    const profile = url.searchParams.get("profile_id")?.replace("eq.", "");
    const rows = ADDONS.filter(
      (row) => (!wanted || row.user_id === wanted) && (!profile || String(row.profile_id) === profile),
    );
    return json(res, 200, rows);
  }

  json(res, 404, { msg: `No mock for ${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock supabase listening on http://127.0.0.1:${PORT}`);
  console.log("  member@example.com / member123  -> supporter with every entitlement");
  console.log("  plain@example.com  / plain123   -> supporter with no entitlements");
});
