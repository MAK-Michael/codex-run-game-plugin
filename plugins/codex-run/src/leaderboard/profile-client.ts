import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { normalizeNickname, normalizePlayerId } from "./identity.js";

export const INITIALIZE_PROFILE_TOOL_NAME = "initialize_codex_run_leaderboard_profile";
export const LOCK_DISPLAY_NAME_TOOL_NAME = "lock_codex_run_display_name";

export type LeaderboardProfile = {
  version: 1;
  playerId: string;
  nickname: string | null;
};

export function parseInitializedProfile(result: CallToolResult): LeaderboardProfile | undefined {
  if (result.isError || !isRecord(result.structuredContent)) return undefined;
  if (result.structuredContent.status !== "ready") return undefined;
  return parseProfile(result.structuredContent.profile);
}

export function parseLockedProfile(result: CallToolResult): LeaderboardProfile | undefined {
  if (result.isError || !isRecord(result.structuredContent)) return undefined;
  if (result.structuredContent.status !== "locked" && result.structuredContent.status !== "already_locked") {
    return undefined;
  }
  return parseProfile(result.structuredContent.profile);
}

function parseProfile(value: unknown): LeaderboardProfile | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  const playerId = normalizePlayerId(value.playerId);
  if (!playerId) return undefined;
  if (value.nickname !== null && typeof value.nickname !== "string") return undefined;
  const nickname = normalizeNickname(value.nickname);
  if (nickname === undefined) return undefined;
  return { version: 1, playerId, nickname };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
