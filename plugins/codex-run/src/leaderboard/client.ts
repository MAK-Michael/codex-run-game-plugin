export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  score: number;
  achievedAt: string;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  stats: {
    completedRuns: number;
    approximatePlayers: number;
  };
};

export type CompletedRun = {
  playerId: string;
  nickname: string | null;
  score: number;
  durationMs: number;
  rulesVersion: 1;
};

export type RunResponse = {
  counted: true;
  personalBest: boolean;
  bestScore: number;
  rank: number | null;
  nickname: string | null;
  nameLocked: boolean;
  completedRuns: number;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class LeaderboardClient {
  constructor(
    private readonly origin: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 3_000,
  ) {}

  async getLeaderboard(fresh = false): Promise<LeaderboardResponse> {
    const value = await this.request("/v1/leaderboard", {
      method: "GET",
      cache: fresh ? "no-cache" : "default",
    });
    if (!isLeaderboardResponse(value)) throw new Error("Invalid leaderboard response");
    return value;
  }

  async submitRun(run: CompletedRun): Promise<RunResponse> {
    const value = await this.request("/v1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    if (!isRunResponse(value)) throw new Error("Invalid run response");
    return value;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.origin}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
      return await response.json();
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

function isLeaderboardResponse(value: unknown): value is LeaderboardResponse {
  if (!isRecord(value) || !Array.isArray(value.entries) || !isRecord(value.stats)) return false;
  if (value.entries.length > 20 || !value.entries.every(isLeaderboardEntry)) return false;
  return isNonNegativeInteger(value.stats.completedRuns) && isNonNegativeInteger(value.stats.approximatePlayers);
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return (
    isRecord(value) &&
    Number.isInteger(value.rank) &&
    (value.rank as number) > 0 &&
    typeof value.nickname === "string" &&
    isNonNegativeInteger(value.score) &&
    typeof value.achievedAt === "string"
  );
}

function isRunResponse(value: unknown): value is RunResponse {
  return (
    isRecord(value) &&
    value.counted === true &&
    typeof value.personalBest === "boolean" &&
    isNonNegativeInteger(value.bestScore) &&
    (value.rank === null || (Number.isInteger(value.rank) && (value.rank as number) > 0)) &&
    (value.nickname === null || typeof value.nickname === "string") &&
    value.nameLocked === (value.nickname !== null) &&
    isNonNegativeInteger(value.completedRuns)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
