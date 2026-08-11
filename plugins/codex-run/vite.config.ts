import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const productionLeaderboardOrigin =
  "https://codex-run-leaderboard-prod.michael-ef6.workers.dev";
const leaderboardOrigin =
  process.env.CODEX_RUN_LEADERBOARD_ORIGIN ?? productionLeaderboardOrigin;

validateLeaderboardOrigin(leaderboardOrigin);

export default defineConfig({
  define: {
    __CODEX_RUN_LEADERBOARD_ORIGIN__: JSON.stringify(leaderboardOrigin),
  },
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    assetsInlineLimit: 100_000,
  },
});

function validateLeaderboardOrigin(origin: string): void {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.pathname !== "/") {
    throw new Error("CODEX_RUN_LEADERBOARD_ORIGIN must be an exact HTTPS origin.");
  }
}
