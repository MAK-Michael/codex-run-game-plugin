declare const __CODEX_RUN_LEADERBOARD_ORIGIN__: string | undefined;

const PRODUCTION_LEADERBOARD_ORIGIN =
  "https://codex-run-leaderboard-prod.michael-ef6.workers.dev";

// Vite and the server build inject the same origin. Direct source execution in
// tests falls back to production so the committed build is production-only.
export const LEADERBOARD_ORIGIN =
  typeof __CODEX_RUN_LEADERBOARD_ORIGIN__ === "string"
    ? __CODEX_RUN_LEADERBOARD_ORIGIN__
    : PRODUCTION_LEADERBOARD_ORIGIN;

export function isLeaderboardOriginConfigured(origin = LEADERBOARD_ORIGIN): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.origin === origin &&
      url.pathname === "/" &&
      !url.hostname.endsWith(".invalid")
    );
  } catch {
    return false;
  }
}
