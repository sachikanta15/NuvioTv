/** Verifies the app talks to the real backend (no account needed). */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:5199";
const PORT = 9339;

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=/tmp/nuvio-chrome-live",
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
  return r.result?.result?.value;
};
const shot = async (name) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/nuvio-live/${name}.png`, Buffer.from(res.result.data, "base64"));
};

const results = [];
const check = (label, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

await send("Page.enable");
await send("Runtime.enable");
const seed = JSON.stringify(
  JSON.stringify({ state: { onboarded: true, homeLayout: "modern" }, version: 1 }),
);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { localStorage.setItem("nuvio.settings.v1", ${seed}); } catch (e) {}`,
});

await send("Page.navigate", { url: `${baseUrl}/account` });
await sleep(3500);

let text = await evaluate("document.body.innerText");
check("account screen is configured", !text.includes("not configured"), "");
check("sign-in form is rendered", text.includes("Create account"));
await shot("01-account");

// Wrong password must produce a friendly error from the real backend.
await evaluate(`
  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  setValue(document.querySelector("#account-email"), "definitely-not-a-user@example.com");
  setValue(document.querySelector("#account-password"), "wrongpassword123");
  document.querySelector("#account-email").closest("form").requestSubmit();
  true;
`);
await sleep(4000);

text = await evaluate("document.body.innerText");
check(
  "real backend rejects bad credentials with a readable message",
  /invalid login credentials/i.test(text),
  text.match(/[^]*?Invalid[^]*?\n/)?.[0]?.slice(0, 90) ?? "",
);
check("still signed out after a failed sign-in", text.includes("Create account"));
await shot("02-signin-error");

// The paywall must be live.
await send("Page.navigate", { url: `${baseUrl}/settings` });
await sleep(3000);
const locked = Number(
  await evaluate(`
    [...document.querySelectorAll("button")]
      .filter((b) => /^(Gold|Jade|Rose Gold|Arctic Blue|Graphite)/.test(b.innerText.trim()))
      .filter((b) => b.innerText.includes("LOCKED")).length
  `),
);
check("supporter themes are locked when signed out", locked === 5, `${locked} locked`);
await shot("03-paywall");

check("no uncaught exceptions", problems.length === 0, problems.join(" | "));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);

ws.close();
chrome.kill();
process.exit(failed === 0 ? 0 : 1);
