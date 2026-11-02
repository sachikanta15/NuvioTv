import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { handleStreamProxy } from "./worker/stream-proxy.js";

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

export default defineConfig({
  plugins: [react(), streamProxyPlugin()],
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
