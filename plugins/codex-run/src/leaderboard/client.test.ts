import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeaderboardClient } from "./client.js";

describe("leaderboard client", () => {
  it("loads and validates public scores", async () => {
    const client = new LeaderboardClient(
      "https://leaderboard.example",
      async () =>
        Response.json({
          entries: [
            { rank: 1, nickname: "MAK", score: 1842, achievedAt: "2026-08-11T12:00:00.000Z" },
          ],
          stats: { completedRuns: 248, approximatePlayers: 31 },
        }),
    );

    const response = await client.getLeaderboard();
    assert.equal(response.entries[0]?.nickname, "MAK");
    assert.equal(response.stats.completedRuns, 248);
  });

  it("submits the versioned completed-run payload", async () => {
    let capturedBody = "";
    const client = new LeaderboardClient("https://leaderboard.example", async (_input, init) => {
      capturedBody = String(init?.body);
      return Response.json({
        counted: true,
        personalBest: true,
        bestScore: 80,
        rank: 4,
        completedRuns: 248,
      }, { status: 201 });
    });

    const response = await client.submitRun({
      playerId: "8c0888d1-1c63-49cd-88d8-d2aaf93848e8",
      nickname: null,
      score: 80,
      durationMs: 2_000,
      rulesVersion: 1,
    });
    assert.equal(JSON.parse(capturedBody).rulesVersion, 1);
    assert.equal(response.rank, 4);
  });

  it("rejects malformed success responses", async () => {
    const client = new LeaderboardClient(
      "https://leaderboard.example",
      async () => Response.json({ entries: "not-an-array", stats: {} }),
    );
    await assert.rejects(() => client.getLeaderboard(), /Invalid leaderboard response/);
  });

  it("aborts a request after the configured timeout", async () => {
    const client = new LeaderboardClient(
      "https://leaderboard.example",
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      5,
    );
    await assert.rejects(() => client.getLeaderboard(), { name: "AbortError" });
  });
});
