import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEST_SCORE_KEY,
  NICKNAME_KEY,
  PLAYER_ID_KEY,
  RANK_KEY,
  loadLeaderboardResultState,
  loadLegacyLeaderboardProfile,
  saveLeaderboardResult,
} from "./storage.js";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const PLAYER_ID = "8c0888d1-1c63-49cd-88d8-d2aaf93848e8";

describe("leaderboard local state", () => {
  it("reads a valid legacy identity without creating or changing one", () => {
    const storage = new MemoryStorage();
    assert.equal(loadLegacyLeaderboardProfile(storage), undefined);
    storage.setItem(PLAYER_ID_KEY, PLAYER_ID.toUpperCase());
    storage.setItem(NICKNAME_KEY, "  MAK  ");
    assert.deepEqual(loadLegacyLeaderboardProfile(storage), {
      playerId: PLAYER_ID,
      nickname: "MAK",
    });
  });

  it("persists only ephemeral rank and server best in iframe storage", () => {
    const storage = new MemoryStorage();
    saveLeaderboardResult(storage, { rank: 4, bestScore: 1842 });

    assert.equal(storage.getItem(RANK_KEY), "4");
    assert.equal(storage.getItem(BEST_SCORE_KEY), "1842");
    assert.deepEqual(loadLeaderboardResultState(storage), {
      rank: 4,
      bestScore: 1842,
    });
  });

  it("keeps result caching optional when iframe storage fails", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    assert.deepEqual(loadLeaderboardResultState(storage), { rank: null, bestScore: null });
  });
});
