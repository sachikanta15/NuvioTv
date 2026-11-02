/** One-off: open the mobile drawer and the mobile search sheet, then capture. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const PORT = 9336;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/nuvio-chrome-profile4",
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
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
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
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r.result?.result?.value;
};
const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/nuvio-shots/${name}.png`, Buffer.from(res.result.data, "base64"));
  console.log("saved", name);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true });

const seed = JSON.stringify(
  JSON.stringify({ state: { onboarded: true, homeLayout: "modern" }, version: 1 }),
);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("nuvio.settings.v1", ${seed}); } catch (e) {}`,
});

await send("Page.navigate", { url: `${baseUrl}/library` });
await sleep(3500);

await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open menu')?.click()`);
await sleep(700);
await shot("mobile-drawer");

await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Close menu')?.click()`);
await sleep(500);
await evaluate(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Search')?.click()`);
await sleep(700);
await shot("mobile-search-sheet");

ws.close();
chrome.kill();
process.exit(0);
