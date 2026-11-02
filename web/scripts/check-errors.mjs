/**
 * Dev-only helper: loads every route in headless Chrome and reports console
 * errors, warnings and uncaught exceptions.
 *
 * Usage: npm run check:errors -- [baseUrl]
 * Set CHROME_PATH to point at a different Chrome/Chromium binary.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const PORT = 9335;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/nuvio-chrome-profile3",
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
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    problems.push(
      `[console.${m.params.type}] ` +
        m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "),
    );
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    problems.push(`[exception] ${d.exception?.description ?? d.text}`);
  }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    problems.push(`[log] ${m.params.entry.text} ${m.params.entry.url ?? ""}`);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const seed = JSON.stringify(
  JSON.stringify({
    state: { onboarded: true, homeLayout: "modern", theme: "violet", heroEnabled: true },
    version: 1,
  }),
);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("nuvio.settings.v1", ${seed}); } catch (e) {}`,
});

const ROUTES = [
  "/",
  "/discover",
  "/search?q=matrix",
  "/library",
  "/collections",
  "/profiles",
  "/settings",
  "/about",
  "/addons",
  "/jiotv",
  "/detail/movie/tt0111161",
  "/detail/series/tt0903747",
  "/browse/https%3A%2F%2Fv3-cinemeta.strem.io%2F/manifest.json/movie/top",
  "/nowhere",
];

for (const route of ROUTES) {
  const before = problems.length;
  await send("Page.navigate", { url: `${baseUrl}${route}` });
  await sleep(3500);
  const found = problems.slice(before);
  console.log(`${route}: ${found.length ? found.length + " issue(s)" : "ok"}`);
  for (const f of found) console.log("   " + f);
}

ws.close();
chrome.kill();
process.exit(0);
