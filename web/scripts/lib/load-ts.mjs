import { build } from "esbuild";

/**
 * Loads a TypeScript module for the local check scripts without depending on
 * Node's native type stripping.
 */
export async function loadTs(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
