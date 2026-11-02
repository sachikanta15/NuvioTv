/**
 * Dev-only end-to-end check of the account / paywall / add-on restore flow
 * against the mock Supabase backend.
 *
 *   node scripts/mock-supabase.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=test-key npm run dev
 *   node scripts/check-auth.mjs http://127.0.0.1:5199
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:5199";
const PORT = 9337;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/nuvio-chrome-auth",
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function target() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error("no chrome");
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const problems = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    problems.push(m.params.exceptionDetails.exception?.description ?? "exception");
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    problems.push(
      m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "),
    );
  }
});
const send = (method, params = {}) => {
  id += 1;
  const c = id;
  return new Promise((res) => {
    pending.set(c, res);
    ws.send(JSON.stringify({ id: c, method, params }));
  });
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed");
  }
  return r.result?.result?.value;
};
const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/nuvio-auth/${name}.png`, Buffer.from(res.result.data, "base64"));
};

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

// Seed onboarding so the app is not blocked by the wizard.
const seed = JSON.stringify(
  JSON.stringify({ state: { onboarded: true, homeLayout: "modern" }, version: 1 }),
);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("nuvio.settings.v1", ${seed}); } catch (e) {}`,
});

await send("Page.navigate", { url: `${baseUrl}/account` });
await sleep(3500);

/* ------------------------------------------------ 1. signed out state */
let text = await evaluate("document.body.innerText");
check("signed out shows the sign-in form", text.includes("Create account") && text.includes("Sign in"));
check(
  "signed out shows the membership panel",
  text.includes("Nuvio Supporter Membership"),
);
await shot("01-signed-out");

/* ------------------------------------------------ 2. sign in */
await evaluate(`
  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const email = document.querySelector("#account-email");
  const password = document.querySelector("#account-password");
  setValue(email, "member@example.com");
  setValue(password, "member123");
  email.closest("form").requestSubmit();
  true;
`);
await sleep(4000);

text = await evaluate("document.body.innerText");
check("signed in shows the account email", text.includes("member@example.com"), text.slice(0, 0));
check("membership tier is Supporter", text.includes("Supporter"));
check("entitlements are listed", text.includes("Gold theme") && text.includes("Arctic Blue theme"));
check("add-on sync section is present", text.includes("Add-on sync"));
await shot("02-signed-in");

/* ------------------------------------------------ 3. add-ons restored */
const addonState = await evaluate(`
  const raw = localStorage.getItem("nuvio.addons.v1");
  const parsed = raw ? JSON.parse(raw) : null;
  JSON.stringify((parsed?.state?.addons ?? []).map((a) => ({
    url: a.transportUrl, name: a.displayName, enabled: a.enabled,
  })));
`);
const addons = JSON.parse(addonState);
check("add-ons were restored from the account", addons.length === 3, `${addons.length} add-ons`);
check(
  "restored add-on keeps the account name",
  addons.some((a) => a.name === "Cinemeta"),
  JSON.stringify(addons.map((a) => a.name)),
);
check(
  "restored add-on keeps the account enabled flag",
  addons.some((a) => a.enabled === false),
  JSON.stringify(addons.map((a) => a.enabled)),
);
check(
  "duplicate manifest URL is de-duplicated",
  addons.filter((a) => a.url === "https://v3-cinemeta.strem.io").length === 1,
  JSON.stringify(addons.map((a) => a.url)),
);
check(
  "no add-on keeps a /manifest.json suffix",
  addons.every((a) => !a.url.endsWith("/manifest.json")),
  JSON.stringify(addons.map((a) => a.url)),
);

/* ------------------------------------------------ 4. themes unlocked */
await send("Page.navigate", { url: `${baseUrl}/settings` });
await sleep(3000);
// Count the theme tiles that carry the locked badge (the tile text is
// uppercased by CSS, so read the DOM rather than the page text).
const lockedBadges = async () =>
  Number(
    await evaluate(`
      [...document.querySelectorAll("button")]
        .filter((b) => /^(Gold|Jade|Rose Gold|Arctic Blue|Graphite)/.test(b.innerText.trim()))
        .filter((b) => b.innerText.includes("LOCKED")).length
    `),
  );
check("supporter themes are unlocked", (await lockedBadges()) === 0, `${await lockedBadges()} locked`);
await shot("03-themes-unlocked");

/* ------------------------------------------------ 5. sign out locks them */
await send("Page.navigate", { url: `${baseUrl}/account` });
await sleep(2500);
await evaluate(`
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "Sign out")?.click();
  true;
`);
await sleep(2000);

await send("Page.navigate", { url: `${baseUrl}/settings` });
await sleep(3000);
const lockedAfterSignOut = await lockedBadges();
check("supporter themes lock again after sign out", lockedAfterSignOut === 5, `${lockedAfterSignOut} locked`);
await shot("04-themes-locked");

/* ------------------------------------------------ 6. no runtime errors */
check("no console errors or exceptions", problems.length === 0, problems.join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

ws.close();
chrome.kill();
process.exit(failed.length === 0 ? 0 : 1);
