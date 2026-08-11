export const PLAYER_ID_KEY = "codex-run.leaderboardPlayerId.v1";
export const NICKNAME_KEY = "codex-run.leaderboardNickname.v1";
export const RANK_KEY = "codex-run.leaderboardRank.v1";
export const BEST_SCORE_KEY = "codex-run.leaderboardBest.v1";
export const MAX_NICKNAME_LENGTH = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_NICKNAME_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;

export type LeaderboardLocalState = {
  playerId: string;
  nickname: string | null;
  rank: number | null;
  bestScore: number | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadLeaderboardLocalState(
  storage: StorageLike,
  createUuid: () => string = () => crypto.randomUUID(),
): LeaderboardLocalState | undefined {
  try {
    let playerId = storage.getItem(PLAYER_ID_KEY);
    if (!playerId || !UUID_PATTERN.test(playerId)) {
      playerId = createUuid();
      if (!UUID_PATTERN.test(playerId)) return undefined;
      storage.setItem(PLAYER_ID_KEY, playerId);
      if (storage.getItem(PLAYER_ID_KEY) !== playerId) return undefined;
    }

    const storedNickname = normalizeNickname(storage.getItem(NICKNAME_KEY));
    const nickname = storedNickname === undefined ? null : storedNickname;
    const rank = readPositiveInteger(storage.getItem(RANK_KEY));
    const bestScore = readNonNegativeInteger(storage.getItem(BEST_SCORE_KEY));
    return { playerId, nickname, rank, bestScore };
  } catch {
    return undefined;
  }
}

export function saveNickname(storage: StorageLike, value: string): string | null | undefined {
  const nickname = normalizeNickname(value);
  if (nickname === undefined) return undefined;

  try {
    if (nickname === null) storage.removeItem(NICKNAME_KEY);
    else storage.setItem(NICKNAME_KEY, nickname);
    return nickname;
  } catch {
    return undefined;
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

export function normalizeNickname(value: string | null): string | null | undefined {
  if (value === null) return null;
  const nickname = value.normalize("NFC").trim();
  if (nickname.length === 0) return null;
  if ([...nickname].length > MAX_NICKNAME_LENGTH) return undefined;
  if (UNSAFE_NICKNAME_PATTERN.test(nickname)) return undefined;
  return nickname;
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
