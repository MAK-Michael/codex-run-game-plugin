const originArgument = process.argv.slice(2).find((argument) => argument !== "--");

if (!originArgument) {
  console.error("Usage: pnpm run smoke -- https://<worker-origin>");
  process.exit(1);
}

let origin;
try {
  const url = new URL(originArgument);
  const isLocalhost =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");

  if (
    url.origin !== originArgument ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !isLocalhost)
  ) {
    throw new Error("Expected an exact HTTPS origin or a local HTTP origin");
  }
  origin = url.origin;
} catch (error) {
  console.error(`Invalid Worker origin: ${error.message}`);
  process.exit(1);
}

const leaderboardResponse = await fetch(`${origin}/v1/leaderboard`, {
  headers: { Origin: "https://chatgpt.com" },
});

if (!leaderboardResponse.ok) {
  throw new Error(
    `GET /v1/leaderboard returned ${leaderboardResponse.status}.`,
  );
}

if (leaderboardResponse.headers.get("access-control-allow-origin") !== "*") {
  throw new Error("GET /v1/leaderboard is missing the expected CORS header.");
}

const leaderboard = await leaderboardResponse.json();
if (
  !Array.isArray(leaderboard.entries) ||
  typeof leaderboard.stats?.completedRuns !== "number" ||
  typeof leaderboard.stats?.approximatePlayers !== "number"
) {
  throw new Error("GET /v1/leaderboard returned an unexpected payload.");
}

const optionsResponse = await fetch(`${origin}/v1/runs`, {
  method: "OPTIONS",
  headers: {
    Origin: "https://chatgpt.com",
    "Access-Control-Request-Headers": "content-type",
    "Access-Control-Request-Method": "POST",
  },
});

if (optionsResponse.status !== 204) {
  throw new Error(`OPTIONS /v1/runs returned ${optionsResponse.status}.`);
}

if (
  optionsResponse.headers.get("access-control-allow-origin") !== "*" ||
  !optionsResponse.headers.get("access-control-allow-methods")?.includes("POST")
) {
  throw new Error("OPTIONS /v1/runs is missing the expected CORS headers.");
}

console.log(
  `Smoke check passed for ${origin}: ${leaderboard.entries.length} public entries, ` +
    `${leaderboard.stats.completedRuns} completed runs, ` +
    `${leaderboard.stats.approximatePlayers} approximate players.`,
);
