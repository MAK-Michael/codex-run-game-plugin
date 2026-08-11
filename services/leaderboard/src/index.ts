import { validateRunSubmission, type RunSubmission } from "./validation.js";

const MAX_BODY_BYTES = 2_048;
const MAX_ACCEPTED_RUNS_PER_MINUTE = 30;

type PlayerRow = {
  nickname: string | null;
  best_score: number;
  best_achieved_at: string;
};

type LeaderboardRow = {
  nickname: string;
  best_score: number;
  best_achieved_at: string;
};

type CountRow = {
  completed_runs: number;
  approximate_players: number;
};

type ScalarRow = { value: number };

export default {
  async fetch(request, env, _context): Promise<Response> {
    if (request.method === "OPTIONS") return optionsResponse();

    const url = new URL(request.url);
    try {
      if (url.pathname === "/v1/leaderboard" && request.method === "GET") {
        return await getLeaderboard(env.DB);
      }
      if (url.pathname === "/v1/runs" && request.method === "POST") {
        return await postRun(request, env.DB);
      }
      if (url.pathname === "/v1/leaderboard" || url.pathname === "/v1/runs") {
        return json({ error: "method_not_allowed" }, 405, { Allow: allowedMethods(url.pathname) });
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      console.error("Leaderboard request failed", error);
      return json({ error: "service_unavailable" }, 503);
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;

async function getLeaderboard(db: D1Database): Promise<Response> {
  const [entriesResult, countsResult] = await db.batch([
    db
      .prepare(
        `SELECT nickname, best_score, best_achieved_at
         FROM players
         WHERE nickname IS NOT NULL
         ORDER BY best_score DESC, best_achieved_at ASC, player_id ASC
         LIMIT 20`,
      ),
    db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM runs) AS completed_runs,
         (SELECT COUNT(*) FROM players) AS approximate_players`,
    ),
  ]);

  const entries = (entriesResult.results as LeaderboardRow[]).map((row, index) => ({
    rank: index + 1,
    nickname: row.nickname,
    score: row.best_score,
    achievedAt: row.best_achieved_at,
  }));
  const counts = countsResult.results[0] as CountRow | undefined;

  return json(
    {
      entries,
      stats: {
        completedRuns: counts?.completed_runs ?? 0,
        approximatePlayers: counts?.approximate_players ?? 0,
      },
    },
    200,
    { "Cache-Control": "public, max-age=20, s-maxage=30" },
  );
}

async function postRun(request: Request, db: D1Database): Promise<Response> {
  const submission = await readSubmission(request);
  if (!submission) return json({ error: "invalid_request" }, 400);

  const now = new Date();
  const nowIso = now.toISOString();
  const recentCutoff = new Date(now.getTime() - 60_000).toISOString();
  const recent = await db
    .prepare("SELECT COUNT(*) AS value FROM runs WHERE player_id = ? AND created_at >= ?")
    .bind(submission.playerId, recentCutoff)
    .first<ScalarRow>();

  if ((recent?.value ?? 0) >= MAX_ACCEPTED_RUNS_PER_MINUTE) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  const previous = await db
    .prepare("SELECT nickname, best_score, best_achieved_at FROM players WHERE player_id = ?")
    .bind(submission.playerId)
    .first<PlayerRow>();
  const personalBest = previous === null || submission.score > previous.best_score;

  await db.batch([
    db
      .prepare(
        `INSERT INTO players (
           player_id, nickname, best_score, best_achieved_at, total_runs, created_at, last_seen_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           nickname = COALESCE(players.nickname, excluded.nickname),
           best_score = CASE
             WHEN excluded.best_score > players.best_score THEN excluded.best_score
             ELSE players.best_score
           END,
           best_achieved_at = CASE
             WHEN excluded.best_score > players.best_score THEN excluded.best_achieved_at
             ELSE players.best_achieved_at
           END,
           total_runs = players.total_runs + 1,
           last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        submission.playerId,
        submission.nickname,
        submission.score,
        nowIso,
        nowIso,
        nowIso,
      ),
    db
      .prepare(
        `INSERT INTO runs (run_id, player_id, score, duration_ms, rules_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        submission.playerId,
        submission.score,
        submission.durationMs,
        submission.rulesVersion,
        nowIso,
      ),
  ]);

  const player = await db
    .prepare("SELECT nickname, best_score, best_achieved_at FROM players WHERE player_id = ?")
    .bind(submission.playerId)
    .first<PlayerRow>();
  if (!player) throw new Error("Accepted player row is missing");

  const [countResult, rankResult] = await db.batch([
    db.prepare("SELECT COUNT(*) AS value FROM runs"),
    db
      .prepare(
        `SELECT COUNT(*) + 1 AS value
         FROM players
         WHERE nickname IS NOT NULL
           AND (
             best_score > ?
             OR (best_score = ? AND best_achieved_at < ?)
             OR (best_score = ? AND best_achieved_at = ? AND player_id < ?)
           )`,
      )
      .bind(
        player.best_score,
        player.best_score,
        player.best_achieved_at,
        player.best_score,
        player.best_achieved_at,
        submission.playerId,
      ),
  ]);

  const completedRuns = (countResult.results[0] as ScalarRow | undefined)?.value ?? 0;
  const rank = player.nickname
    ? ((rankResult.results[0] as ScalarRow | undefined)?.value ?? null)
    : null;

  return json(
    {
      counted: true,
      personalBest,
      bestScore: player.best_score,
      rank,
      nickname: player.nickname,
      nameLocked: player.nickname !== null,
      completedRuns,
    },
    201,
    { "Cache-Control": "no-store" },
  );
}

async function readSubmission(request: Request): Promise<RunSubmission | undefined> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return undefined;
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return undefined;

  const body = await readLimitedBody(request);
  if (body === undefined) return undefined;

  try {
    const result = validateRunSubmission(JSON.parse(body));
    return result.ok ? result.value : undefined;
  } catch {
    return undefined;
  }
}

async function readLimitedBody(request: Request): Promise<string | undefined> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

function allowedMethods(pathname: string): string {
  return pathname === "/v1/runs" ? "POST, OPTIONS" : "GET, OPTIONS";
}

function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders({
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "public, max-age=86400",
    }),
  });
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    }),
  });
}

function corsHeaders(values: Record<string, string>): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    ...values,
  });
}
