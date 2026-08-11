import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEST_SCORE_KEY,
  NICKNAME_KEY,
  PLAYER_ID_KEY,
  RANK_KEY,
  loadLeaderboardLocalState,
  saveLeaderboardResult,
  saveNickname,
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
  it("creates and then reuses one anonymous player UUID", () => {
    const storage = new MemoryStorage();
    assert.equal(loadLeaderboardLocalState(storage, () => PLAYER_ID)?.playerId, PLAYER_ID);
    assert.equal(storage.getItem(PLAYER_ID_KEY), PLAYER_ID);
    assert.equal(loadLeaderboardLocalState(storage, () => "unreachable")?.playerId, PLAYER_ID);
  });

  it("persists optional nickname, rank, and server best", () => {
    const storage = new MemoryStorage();
    loadLeaderboardLocalState(storage, () => PLAYER_ID);
    assert.equal(saveNickname(storage, "  MAK  "), "MAK");
    saveLeaderboardResult(storage, { rank: 4, bestScore: 1842 });

    assert.equal(storage.getItem(NICKNAME_KEY), "MAK");
    assert.equal(storage.getItem(RANK_KEY), "4");
    assert.equal(storage.getItem(BEST_SCORE_KEY), "1842");
    assert.deepEqual(loadLeaderboardLocalState(storage), {
      playerId: PLAYER_ID,
      nickname: "MAK",
      rank: 4,
      bestScore: 1842,
    });
  });

  it("leaves participation unavailable when storage fails", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    assert.equal(loadLeaderboardLocalState(storage, () => PLAYER_ID), undefined);
  });
});
