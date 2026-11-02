import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { handleStreamProxy } from "./worker/stream-proxy.js";
import { handleJioTvDirect } from "./worker/jiotv-direct.js";
import { handleJioTvAddon } from "./worker/jiotv-addon.js";
import { handleVzyProxy } from "./worker/vzy-proxy.js";

/**
 * Mirrors the deployed Worker's `/stream-proxy` route during `npm run dev`.
 * This keeps header-required and CORS-restricted streams testable locally.
 */
function streamProxyPlugin(): Plugin {
  return {
    name: "nuvio-stream-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = `http://${req.headers.host ?? "127.0.0.1:5173"}`;
        const url = new URL(req.url ?? "/", origin);
        if (url.pathname !== "/stream-proxy") {
          next();
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const request = new Request(url.toString(), {
          method: req.method ?? "GET",
          headers,
        });
        void handleStreamProxy(request, {}, url)
          .then(async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) {
              res.end();
              return;
            }
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          })
          .catch(() => {
            res.statusCode = 502;
            res.end("Stream proxy failed");
          });
      });
    },
  };
}

function jiotvPlugin(): Plugin {
  return {
    name: "nuvio-jiotv",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = `http://${req.headers.host ?? "127.0.0.1:5173"}`;
        const url = new URL(req.url ?? "/", origin);
        const isApi =
          url.pathname === "/jiotv-api" ||
          url.pathname.startsWith("/jiotv-api/");
        const isAddon =
          url.pathname === "/jiotv-addon" ||
          url.pathname.startsWith("/jiotv-addon/");
        if (!isApi && !isAddon) {
          next();
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const request = new Request(url.toString(), {
          method: req.method ?? "GET",
          headers,
        });
        const responsePromise = isApi
          ? handleJioTvDirect(request, {}, url)
          : handleJioTvAddon(request, {}, url);
        void responsePromise
          .then(async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) {
              res.end();
              return;
            }
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          })
          .catch(() => {
            res.statusCode = 502;
            res.end("JioTV API failed");
          });
      });
    },
  };
}

function vzyProxyPlugin(): Plugin {
  return {
    name: "nuvio-vzy-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const origin = `http://${req.headers.host ?? "127.0.0.1:5173"}`;
        const url = new URL(req.url ?? "/", origin);
        if (!url.pathname.startsWith("/vzy-api")) {
          next();
          return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        req.on("end", () => {
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
          const request = new Request(url.toString(), {
            method: req.method ?? "GET",
            headers,
            body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
          });

          void handleVzyProxy(request, {}, url)
            .then(async (response: Response) => {
              res.statusCode = response.status;
              response.headers.forEach((value: string, key: string) =>
                res.setHeader(key, value),
              );
              if (!response.body) {
                res.end();
                return;
              }
              const reader = response.body.getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
              }
              res.end();
            })
            .catch((err: Error) => {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: err.message }));
            });
        });
      });
    },
  };
}

/** Automatically boots the local stream relay on :8090 if not already running. */
function relayAutoStartPlugin(): Plugin {
  return {
    name: "nuvio-relay-autostart",
    configureServer() {
      const relayPath = fileURLToPath(
        new URL("../relay/server.mjs", import.meta.url),
      );
      void import("node:http").then(({ default: http }) => {
        const req = http.get("http://127.0.0.1:8090/health", (res) => {
          if (res.statusCode === 200) {
            console.log("[Relay] Stream relay is active on :8090");
          }
        });
        req.on("error", () => {
          void import("node:child_process").then(({ spawn }) => {
            console.log("[Relay] Starting local stream relay on :8090...");
            const child = spawn(process.execPath, [relayPath], {
              stdio: "inherit",
              detached: false,
            });
            child.on("error", (e) =>
              console.warn("[Relay] Auto-spawn error:", e.message),
            );
            process.on("exit", () => child.kill());
            process.on("SIGINT", () => {
              child.kill();
              process.exit(0);
            });
          });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    streamProxyPlugin(),
    jiotvPlugin(),
    vzyProxyPlugin(),
    relayAutoStartPlugin(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
