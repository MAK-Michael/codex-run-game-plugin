import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEADERBOARD_ORIGIN, isLeaderboardOriginConfigured } from "./config.js";

describe("leaderboard origin", () => {
  it("defaults source execution to the production Worker", () => {
    assert.equal(
      LEADERBOARD_ORIGIN,
      "https://codex-run-leaderboard-prod.michael-ef6.workers.dev",
    );
  });

  it("accepts only an exact configured HTTPS origin", () => {
    assert.equal(isLeaderboardOriginConfigured("https://codex-run.example.workers.dev"), true);
    assert.equal(isLeaderboardOriginConfigured("https://codex-run.example.workers.dev/path"), false);
    assert.equal(isLeaderboardOriginConfigured("http://localhost:8787"), false);
    assert.equal(isLeaderboardOriginConfigured("https://codex-run-leaderboard.invalid"), false);
  });
});
