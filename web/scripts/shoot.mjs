/**
 * Dev-only helper: renders the app in headless Chrome and writes screenshots
 * for a set of viewports so the UI can be reviewed without a browser.
 *
 * Usage: npm run shoot -- [baseUrl] [outDir]
 * Set CHROME_PATH to point at a different Chrome/Chromium binary.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outDir = process.argv[3] ?? "/tmp/nuvio-shots";
const PORT = 9333;

mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/nuvio-chrome-profile",
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function targets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params = {}) {
  id += 1;
  const current = id;
  return new Promise((resolve) => {
    pending.set(current, resolve);
    ws.send(JSON.stringify({ id: current, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return res.result?.result?.value;
}

const ONBOARD = JSON.stringify(
  JSON.stringify({
    state: {
    onboarded: true,
    experienceMode: "full",
    homeLayout: "modern",
    theme: "violet",
    themeColors: { first: "#B75AFF", second: "#EC70A9", third: "#FFB37A" },
    customGradient: true,
    amoled: false,
    font: "inter",
    fontScale: 1,
    reduceMotion: false,
    posterLabelsEnabled: true,
    imdbRatingsVisibility: "all",
    continueWatchingEnabled: true,
    heroEnabled: true,
    playback: {
      autoSelectBestStream: false,
      autoPlayNextEpisode: true,
      preferDirectPlay: false,
      subtitleLanguage: "off",
      preferOriginalAudio: false,
      showFullReleaseDate: true,
      hideUnreleasedContent: true,
      blurUnwatchedEpisodes: false,
    },
    cardWidth: 150,
  },
  version: 1,
}),
);

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, dsf: 2, mobile: true },
  { name: "tablet", width: 834, height: 1112, dsf: 2, mobile: false },
  { name: "desktop", width: 1440, height: 900, dsf: 1, mobile: false },
];

const ROUTES = [
  { name: "home", path: "/" },
  { name: "discover", path: "/discover" },
  { name: "search", path: "/search" },
  { name: "library", path: "/library" },
  { name: "settings", path: "/settings" },
  { name: "collections", path: "/collections" },
  { name: "profiles", path: "/profiles" },
  { name: "detail", path: "/detail/movie/tt0111161" },
  { name: "addons", path: "/addons" },
];

await send("Page.enable");
await send("Runtime.enable");

// Seed localStorage before any app script runs so onboarding is skipped.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("nuvio.settings.v1", ${ONBOARD}); } catch (e) {}`,
});

for (const vp of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.dsf,
    mobile: vp.mobile,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile });

  for (const route of ROUTES) {
    await send("Page.navigate", { url: `${baseUrl}${route.path}` });
    await sleep(4500);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (shot.result?.data) {
      writeFileSync(`${outDir}/${vp.name}-${route.name}.png`, Buffer.from(shot.result.data, "base64"));
      console.log("saved", `${vp.name}-${route.name}.png`);
    }
  }
}

ws.close();
chrome.kill();
process.exit(0);
