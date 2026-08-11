import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index.js";

const API_ORIGIN = "https://leaderboard.example";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function run(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    playerId: uuid(1),
    nickname: "MAK",
    score: 80,
    durationMs: 2_000,
    rulesVersion: 1,
    ...overrides,
  };
}

async function post(payload: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return dispatch(`${API_ORIGIN}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function leaderboard(): Promise<Response> {
  return dispatch(`${API_ORIGIN}/v1/leaderboard`);
}

async function dispatch(input: string, init?: RequestInit): Promise<Response> {
  const context = createExecutionContext();
  const request = new Request(input, init) as unknown as Request<unknown, IncomingRequestCfProperties>;
  const response = await worker.fetch(request, env, context);
  await waitOnExecutionContext(context);
  return response;
}

describe("leaderboard API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM runs"),
      env.DB.prepare("DELETE FROM players"),
    ]);
  });

  it("returns a cacheable empty leaderboard", async () => {
    const response = await leaderboard();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=20");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      entries: [],
      stats: { completedRuns: 0, approximatePlayers: 0 },
    });
  });

  it("counts anonymous runs without publishing them", async () => {
    const response = await post(run({ nickname: null }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ counted: true, rank: null, completedRuns: 1 });

    const publicResponse = await leaderboard();
    expect(await publicResponse.json()).toEqual({
      entries: [],
      stats: { completedRuns: 1, approximatePlayers: 1 },
    });
  });

  it("publishes one best score per named player and counts every valid run", async () => {
    const playerId = uuid(2);
    const first = await post(run({ playerId, score: 80, durationMs: 2_000 }));
    expect(await first.json()).toMatchObject({ personalBest: true, bestScore: 80, rank: 1 });

    const lower = await post(run({ playerId, score: 78, durationMs: 2_000 }));
    expect(await lower.json()).toMatchObject({ personalBest: false, bestScore: 80, completedRuns: 2 });

    const higher = await post(run({ playerId, score: 169, durationMs: 4_000 }));
    expect(await higher.json()).toMatchObject({ personalBest: true, bestScore: 169, completedRuns: 3 });

    const body = (await (await leaderboard()).json()) as {
      entries: Array<{ nickname: string; score: number }>;
      stats: { completedRuns: number };
    };
    expect(body.entries).toEqual([
      expect.objectContaining({ nickname: "MAK", score: 169 }),
    ]);
    expect(body.stats.completedRuns).toBe(3);
  });

  it("breaks tied scores by earliest achievement and allows duplicate nicknames", async () => {
    const earlierId = uuid(3);
    const laterId = uuid(4);
    await post(run({ playerId: earlierId, nickname: "SAME" }));
    await post(run({ playerId: laterId, nickname: "SAME" }));
    await env.DB.prepare("UPDATE players SET best_achieved_at = ? WHERE player_id = ?")
      .bind("2026-01-01T00:00:00.000Z", earlierId)
      .run();
    await env.DB.prepare("UPDATE players SET best_achieved_at = ? WHERE player_id = ?")
      .bind("2026-01-02T00:00:00.000Z", laterId)
      .run();

    const body = (await (await leaderboard()).json()) as {
      entries: Array<{ nickname: string; achievedAt: string }>;
    };
    expect(body.entries.map((entry) => entry.nickname)).toEqual(["SAME", "SAME"]);
    expect(body.entries[0]?.achievedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it.each([
    ["invalid UUID", { playerId: "nope" }],
    ["negative score", { score: -1 }],
    ["non-integer score", { score: 80.5 }],
    ["short duration", { durationMs: 1_999 }],
    ["long duration", { durationMs: 86_400_001 }],
    ["unsupported rules", { rulesVersion: 2 }],
    ["unsafe nickname", { nickname: "bad\nname" }],
    ["long nickname", { nickname: "x".repeat(21) }],
    ["inconsistent score", { score: 50_000 }],
  ])("rejects %s", async (_label, overrides) => {
    const response = await post(run(overrides));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects malformed, oversized, and non-JSON bodies", async () => {
    const malformed = await dispatch(`${API_ORIGIN}/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const wrongType = await post(run(), { "Content-Type": "text/plain" });
    expect(wrongType.status).toBe(400);

    const oversized = await dispatch(`${API_ORIGIN}/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(2_100) }),
    });
    expect(oversized.status).toBe(400);
  });

  it("rate limits after 30 accepted runs for one player in a minute", async () => {
    const playerId = uuid(5);
    for (let index = 0; index < 30; index += 1) {
      const response = await post(run({ playerId }));
      expect(response.status).toBe(201);
    }

    const rejected = await post(run({ playerId }));
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");
  });

  it("never exposes player IDs in public or submission responses", async () => {
    const playerId = uuid(6);
    const submission = await post(run({ playerId }));
    const submissionBody = await submission.text();
    const publicBody = await (await leaderboard()).text();
    expect(submissionBody).not.toContain(playerId);
    expect(publicBody).not.toContain(playerId);
    expect(submissionBody).not.toContain("playerId");
    expect(publicBody).not.toContain("playerId");
  });

  it("supports preflight and rejects unsupported routes and methods", async () => {
    const preflight = await dispatch(`${API_ORIGIN}/v1/runs`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

    const wrongMethod = await dispatch(`${API_ORIGIN}/v1/runs`);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST, OPTIONS");

    const missing = await dispatch(`${API_ORIGIN}/health`);
    expect(missing.status).toBe(404);
  });
});
