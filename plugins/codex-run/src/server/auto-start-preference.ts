import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { normalizeNickname, normalizePlayerId } from "../leaderboard/identity.js";

export const PREFERENCES_VERSION = 1;
export const LEADERBOARD_PROFILE_VERSION = 1;

export type AutoStartPreference = {
  autoStartEnabled: boolean;
};

export type LeaderboardProfile = {
  version: typeof LEADERBOARD_PROFILE_VERSION;
  playerId: string;
  nickname: string | null;
};

export class InvalidDisplayNameError extends Error {
  constructor() {
    super("Display name must be non-empty and follow the Codex Run nickname rules.");
    this.name = "InvalidDisplayNameError";
  }
}

export function resolveAutoStartPreferencePath(
  env: NodeJS.ProcessEnv = process.env,
  userHome = homedir(),
): string {
  const codexHome = env.CODEX_HOME?.trim() || join(userHome, ".codex");
  return join(codexHome, "codex-run", "preferences.json");
}

export function readAutoStartPreference(path = resolveAutoStartPreferencePath()): AutoStartPreference {
  const value = readPreferencesRecord(path);
  return {
    autoStartEnabled: typeof value.autoStartEnabled === "boolean"
      ? value.autoStartEnabled
      : true,
  };
}

export function writeAutoStartPreference(
  autoStartEnabled: boolean,
  path = resolveAutoStartPreferencePath(),
): AutoStartPreference {
  writePreferencesPatch({ autoStartEnabled }, path);
  return { autoStartEnabled };
}

export function readLeaderboardProfile(
  path = resolveAutoStartPreferencePath(),
): LeaderboardProfile | undefined {
  return parseLeaderboardProfile(readPreferencesRecord(path).leaderboardProfile);
}

export function initializeLeaderboardProfile(
  legacy: { legacyPlayerId?: string; legacyNickname?: string | null } = {},
  path = resolveAutoStartPreferencePath(),
  createUuid: () => string = randomUUID,
): { profile: LeaderboardProfile; adoptedLegacyIdentity: boolean } {
  const preferences = readPreferencesRecord(path);
  if (Object.hasOwn(preferences, "leaderboardProfile")) {
    const existing = parseLeaderboardProfile(preferences.leaderboardProfile);
    if (!existing) {
      throw new Error("The stored Codex Run leaderboard profile is invalid or unsupported.");
    }
    return { profile: existing, adoptedLegacyIdentity: false };
  }

  const legacyPlayerId = normalizePlayerId(legacy.legacyPlayerId);
  const playerId = legacyPlayerId ?? normalizePlayerId(createUuid());
  if (!playerId) throw new Error("Codex Run could not create a valid installation player ID.");

  const normalizedLegacyNickname = legacyPlayerId
    ? normalizeLegacyNickname(legacy.legacyNickname)
    : null;
  const profile: LeaderboardProfile = {
    version: LEADERBOARD_PROFILE_VERSION,
    playerId,
    nickname: normalizedLegacyNickname,
  };
  writePreferencesPatch({ leaderboardProfile: profile }, path);
  return { profile, adoptedLegacyIdentity: legacyPlayerId !== undefined };
}

export function lockLeaderboardDisplayName(
  displayName: string,
  path = resolveAutoStartPreferencePath(),
  createUuid: () => string = randomUUID,
): { profile: LeaderboardProfile; status: "locked" | "already_locked" } {
  const profile = initializeLeaderboardProfile({}, path, createUuid).profile;
  if (profile.nickname !== null) return { profile, status: "already_locked" };

  const nickname = normalizeNickname(displayName);
  if (!nickname) throw new InvalidDisplayNameError();

  const lockedProfile = { ...profile, nickname };
  writePreferencesPatch({ leaderboardProfile: lockedProfile }, path);
  return { profile: lockedProfile, status: "locked" };
}

function normalizeLegacyNickname(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const nickname = normalizeNickname(value);
  return nickname ?? null;
}

function parseLeaderboardProfile(value: unknown): LeaderboardProfile | undefined {
  if (!isRecord(value) || value.version !== LEADERBOARD_PROFILE_VERSION) return undefined;
  const playerId = normalizePlayerId(value.playerId);
  if (!playerId) return undefined;
  if (value.nickname !== null && typeof value.nickname !== "string") return undefined;
  const nickname = normalizeNickname(value.nickname);
  if (nickname === undefined) return undefined;
  return { version: LEADERBOARD_PROFILE_VERSION, playerId, nickname };
}

function readPreferencesRecord(path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function writePreferencesPatch(patch: Record<string, unknown>, path: string): void {
  const preference = {
    ...readPreferencesRecord(path),
    version: PREFERENCES_VERSION,
    ...patch,
  };
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(preference, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created or may already have been renamed.
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
