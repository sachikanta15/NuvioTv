/** Type declarations for `worker/jiotv-addon.js` (used by Vite config). */

/** Route `/jiotv-addon/*` requests (Worker and dev middleware). */
export function handleJioTvAddon(
  request: Request,
  env: Record<string, unknown>,
  url: URL,
): Promise<Response>;

export const PREFIX: string;
