import { normalizeNickname, normalizePlayerId } from "./identity.js";

export const PLAYER_ID_KEY = "codex-run.leaderboardPlayerId.v1";
export const NICKNAME_KEY = "codex-run.leaderboardNickname.v1";
export const RANK_KEY = "codex-run.leaderboardRank.v1";
export const BEST_SCORE_KEY = "codex-run.leaderboardBest.v1";

export type LegacyLeaderboardProfile = {
  playerId: string;
  nickname: string | null;
};

export type LeaderboardResultState = {
  rank: number | null;
  bestScore: number | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadLegacyLeaderboardProfile(
  storage: StorageLike,
): LegacyLeaderboardProfile | undefined {
  try {
    const playerId = normalizePlayerId(storage.getItem(PLAYER_ID_KEY));
    if (!playerId) return undefined;
    const storedNickname = normalizeNickname(storage.getItem(NICKNAME_KEY));
    const nickname = storedNickname === undefined ? null : storedNickname;
    return { playerId, nickname };
  } catch {
    return undefined;
  }
}

export function loadLeaderboardResultState(storage: StorageLike): LeaderboardResultState {
  try {
    const rank = readPositiveInteger(storage.getItem(RANK_KEY));
    const bestScore = readNonNegativeInteger(storage.getItem(BEST_SCORE_KEY));
    return { rank, bestScore };
  } catch {
    return { rank: null, bestScore: null };
  }
}

export function saveLeaderboardResult(
  storage: StorageLike,
  result: { rank: number | null; bestScore: number },
): void {
  try {
    if (result.rank === null) storage.removeItem(RANK_KEY);
    else storage.setItem(RANK_KEY, String(result.rank));
    storage.setItem(BEST_SCORE_KEY, String(result.bestScore));
  } catch {
    // Storage failure does not affect local gameplay or the current run.
  }
}

function readPositiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function readNonNegativeInteger(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
