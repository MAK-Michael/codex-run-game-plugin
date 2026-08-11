import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  InvalidDisplayNameError,
  initializeLeaderboardProfile,
  lockLeaderboardDisplayName,
  readAutoStartPreference,
  readLeaderboardProfile,
  resolveAutoStartPreferencePath,
  writeAutoStartPreference,
} from "./auto-start-preference.js";

const PLAYER_ID = "8c0888d1-1c63-49cd-88d8-d2aaf93848e8";
const OTHER_PLAYER_ID = "67455f1e-0475-4d0d-9b3a-f586dfaace57";
const temporaryDirectories: string[] = [];

function temporaryPreferencePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "codex-run-preference-"));
  temporaryDirectories.push(directory);
  const nestedDirectory = join(directory, "nested");
  mkdirSync(nestedDirectory, { recursive: true });
  return join(nestedDirectory, "preferences.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Codex Run preferences", () => {
  it("defaults auto-start to enabled for a new installation", () => {
    assert.deepEqual(readAutoStartPreference(temporaryPreferencePath()), {
      autoStartEnabled: true,
    });
  });

  it("migrates an auto-start-only file and preserves fields across every writer", () => {
    const path = temporaryPreferencePath();
    writeFileSync(path, JSON.stringify({ autoStartEnabled: false, futureField: "keep" }), {
      encoding: "utf8",
      flag: "w",
    });

    const initialized = initializeLeaderboardProfile({}, path, () => PLAYER_ID);
    assert.equal(initialized.profile.playerId, PLAYER_ID);
    writeAutoStartPreference(true, path);

    const stored = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.version, 1);
    assert.equal(stored.autoStartEnabled, true);
    assert.equal(stored.futureField, "keep");
    assert.deepEqual(stored.leaderboardProfile, initialized.profile);
  });

  it("uses CODEX_HOME so the same profile survives a plugin reinstall path change", () => {
    const path = resolveAutoStartPreferencePath(
      { CODEX_HOME: "/tmp/custom-codex-home" },
      "/tmp/ignored-home",
    );
    assert.equal(path, "/tmp/custom-codex-home/codex-run/preferences.json");

    const testPath = temporaryPreferencePath();
    const first = initializeLeaderboardProfile({}, testPath, () => PLAYER_ID);
    const afterReinstall = initializeLeaderboardProfile({}, testPath, () => OTHER_PLAYER_ID);
    assert.deepEqual(afterReinstall.profile, first.profile);
    assert.equal(afterReinstall.adoptedLegacyIdentity, false);
  });

  it("adopts a valid legacy iframe identity only before a server profile exists", () => {
    const path = temporaryPreferencePath();
    const first = initializeLeaderboardProfile(
      { legacyPlayerId: PLAYER_ID.toUpperCase(), legacyNickname: "  MAK  " },
      path,
      () => OTHER_PLAYER_ID,
    );
    assert.deepEqual(first, {
      adoptedLegacyIdentity: true,
      profile: { version: 1, playerId: PLAYER_ID, nickname: "MAK" },
    });

    const later = initializeLeaderboardProfile(
      { legacyPlayerId: OTHER_PLAYER_ID, legacyNickname: "RENAME" },
      path,
      () => OTHER_PLAYER_ID,
    );
    assert.deepEqual(later.profile, first.profile);
  });

  it("ignores invalid legacy input and generates one unnamed installation identity", () => {
    const path = temporaryPreferencePath();
    const result = initializeLeaderboardProfile(
      { legacyPlayerId: "not-a-uuid", legacyNickname: "MAK" },
      path,
      () => PLAYER_ID,
    );
    assert.deepEqual(result, {
      adoptedLegacyIdentity: false,
      profile: { version: 1, playerId: PLAYER_ID, nickname: null },
    });
  });

  it("fails closed instead of replacing an existing malformed or future profile", () => {
    const path = temporaryPreferencePath();
    writeFileSync(path, JSON.stringify({
      version: 1,
      autoStartEnabled: false,
      leaderboardProfile: { version: 2, playerId: PLAYER_ID, nickname: "LOCKED" },
    }));

    assert.throws(
      () => initializeLeaderboardProfile(
        { legacyPlayerId: OTHER_PLAYER_ID, legacyNickname: "REPLACEMENT" },
        path,
        () => OTHER_PLAYER_ID,
      ),
      /invalid or unsupported/,
    );
    const stored = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    assert.deepEqual(stored.leaderboardProfile, {
      version: 2,
      playerId: PLAYER_ID,
      nickname: "LOCKED",
    });
    assert.equal(stored.autoStartEnabled, false);
  });

  it("locks the first valid display name and never renames or clears it", () => {
    const path = temporaryPreferencePath();
    initializeLeaderboardProfile({}, path, () => PLAYER_ID);
    assert.deepEqual(lockLeaderboardDisplayName("  MAK  ", path), {
      status: "locked",
      profile: { version: 1, playerId: PLAYER_ID, nickname: "MAK" },
    });
    assert.deepEqual(lockLeaderboardDisplayName("RENAME", path), {
      status: "already_locked",
      profile: { version: 1, playerId: PLAYER_ID, nickname: "MAK" },
    });
    assert.deepEqual(lockLeaderboardDisplayName("", path), {
      status: "already_locked",
      profile: { version: 1, playerId: PLAYER_ID, nickname: "MAK" },
    });
    assert.equal(readLeaderboardProfile(path)?.nickname, "MAK");
  });

  it("rejects empty, unsafe, and overlong first names without modifying the profile", () => {
    const path = temporaryPreferencePath();
    initializeLeaderboardProfile({}, path, () => PLAYER_ID);
    for (const value of ["", "bad\nname", "x".repeat(21)]) {
      assert.throws(
        () => lockLeaderboardDisplayName(value, path),
        InvalidDisplayNameError,
      );
    }
    assert.equal(readLeaderboardProfile(path)?.nickname, null);
  });
});
