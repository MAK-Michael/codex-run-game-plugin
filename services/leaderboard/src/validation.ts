export const RULES_VERSION = 1;
export const MAX_NICKNAME_LENGTH = 20;
export const MIN_DURATION_MS = 2_000;
export const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
export const SCORE_TOLERANCE = 5;

const START_SPEED = 355;
const ACCELERATION = 8.4;
const MAX_SPEED = 790;
const SCORE_DISTANCE = 9;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_NICKNAME_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;

export type RunSubmission = {
  playerId: string;
  nickname: string | null;
  score: number;
  durationMs: number;
  rulesVersion: number;
};

export type ValidationResult =
  | { ok: true; value: RunSubmission }
  | { ok: false };

export function expectedScoreForDuration(durationMs: number): number {
  const seconds = durationMs / 1_000;
  const capTime = (MAX_SPEED - START_SPEED) / ACCELERATION;
  const distance =
    seconds <= capTime
      ? START_SPEED * seconds + 0.5 * ACCELERATION * seconds ** 2
      : START_SPEED * capTime +
        0.5 * ACCELERATION * capTime ** 2 +
        MAX_SPEED * (seconds - capTime);

  return Math.floor(distance / SCORE_DISTANCE);
}

export function normalizeNickname(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;

  const nickname = value.normalize("NFC").trim();
  if (nickname.length === 0) return null;
  if ([...nickname].length > MAX_NICKNAME_LENGTH) return undefined;
  if (UNSAFE_NICKNAME_PATTERN.test(nickname)) return undefined;
  return nickname;
}

export function validateRunSubmission(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false };

  const allowedKeys = new Set(["playerId", "nickname", "score", "durationMs", "rulesVersion"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return { ok: false };

  const nickname = normalizeNickname(value.nickname);
  if (nickname === undefined) return { ok: false };
  if (typeof value.playerId !== "string" || !UUID_PATTERN.test(value.playerId)) return { ok: false };
  if (!Number.isInteger(value.score) || (value.score as number) < 0) return { ok: false };
  if (
    !Number.isInteger(value.durationMs) ||
    (value.durationMs as number) < MIN_DURATION_MS ||
    (value.durationMs as number) > MAX_DURATION_MS
  ) {
    return { ok: false };
  }
  if (value.rulesVersion !== RULES_VERSION) return { ok: false };

  const score = value.score as number;
  const durationMs = value.durationMs as number;
  if (Math.abs(score - expectedScoreForDuration(durationMs)) > SCORE_TOLERANCE) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      playerId: value.playerId.toLowerCase(),
      nickname,
      score,
      durationMs,
      rulesVersion: RULES_VERSION,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
