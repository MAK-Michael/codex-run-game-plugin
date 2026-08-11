export const MAX_NICKNAME_LENGTH = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_NICKNAME_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;

export function normalizePlayerId(value: unknown): string | undefined {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : undefined;
}

export function normalizeNickname(value: string | null): string | null | undefined {
  if (value === null) return null;
  const nickname = value.normalize("NFC").trim();
  if (nickname.length === 0) return null;
  if ([...nickname].length > MAX_NICKNAME_LENGTH) return undefined;
  if (UNSAFE_NICKNAME_PATTERN.test(nickname)) return undefined;
  return nickname;
}
