import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInitializedProfile, parseLockedProfile } from "./profile-client.js";

const profile = {
  version: 1,
  playerId: "8c0888d1-1c63-49cd-88d8-d2aaf93848e8",
  nickname: "MAK",
};

describe("leaderboard profile tool results", () => {
  it("accepts authoritative initialized and locked profiles", () => {
    assert.deepEqual(parseInitializedProfile({
      content: [],
      structuredContent: { status: "ready", profile },
    }), profile);
    assert.deepEqual(parseLockedProfile({
      content: [],
      structuredContent: { status: "already_locked", profile },
    }), profile);
  });

  it("rejects tool errors and malformed profile data", () => {
    assert.equal(parseInitializedProfile({ content: [], isError: true }), undefined);
    assert.equal(parseLockedProfile({
      content: [],
      structuredContent: {
        status: "locked",
        profile: { ...profile, playerId: "invalid" },
      },
    }), undefined);
  });
});
