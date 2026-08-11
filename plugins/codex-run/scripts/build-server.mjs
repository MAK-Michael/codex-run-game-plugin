import { build } from "esbuild";

const productionLeaderboardOrigin =
  "https://codex-run-leaderboard-prod.michael-ef6.workers.dev";
const leaderboardOrigin =
  process.env.CODEX_RUN_LEADERBOARD_ORIGIN ?? productionLeaderboardOrigin;

const url = new URL(leaderboardOrigin);
if (
  url.protocol !== "https:" ||
  url.origin !== leaderboardOrigin ||
  url.pathname !== "/"
) {
  throw new Error("CODEX_RUN_LEADERBOARD_ORIGIN must be an exact HTTPS origin.");
}

await build({
  bundle: true,
  define: {
    __CODEX_RUN_LEADERBOARD_ORIGIN__: JSON.stringify(leaderboardOrigin),
  },
  entryPoints: ["src/server/index.ts"],
  format: "esm",
  outfile: "dist/server/index.js",
  platform: "node",
  target: "node20",
});
