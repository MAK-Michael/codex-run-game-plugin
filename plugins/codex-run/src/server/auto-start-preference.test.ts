import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  readAutoStartPreference,
  resolveAutoStartPreferencePath,
  writeAutoStartPreference,
} from "./auto-start-preference.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Codex Run auto-start preference", () => {
  it("defaults to enabled for a new installation", () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-run-preference-"));
    temporaryDirectories.push(directory);
    assert.deepEqual(readAutoStartPreference(join(directory, "missing.json")), {
      autoStartEnabled: true,
    });
  });

  it("persists an explicit preference", () => {
    const directory = mkdtempSync(join(tmpdir(), "codex-run-preference-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "nested", "preferences.json");
    writeAutoStartPreference(false, path);
    assert.deepEqual(readAutoStartPreference(path), { autoStartEnabled: false });
  });

  it("uses CODEX_HOME when resolving the shared hook and MCP path", () => {
    assert.equal(
      resolveAutoStartPreferencePath({ CODEX_HOME: "/tmp/custom-codex-home" }, "/tmp/home"),
      "/tmp/custom-codex-home/codex-run/preferences.json",
    );
  });
});
