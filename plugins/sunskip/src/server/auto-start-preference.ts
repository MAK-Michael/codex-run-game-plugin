import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AutoStartPreference = {
  autoStartEnabled: boolean;
};

export function resolveAutoStartPreferencePath(
  env: NodeJS.ProcessEnv = process.env,
  userHome = homedir(),
): string {
  const codexHome = env.CODEX_HOME?.trim() || join(userHome, ".codex");
  return join(codexHome, "codex-run", "preferences.json");
}

export function readAutoStartPreference(path = resolveAutoStartPreferencePath()): AutoStartPreference {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<AutoStartPreference>;
    if (typeof value.autoStartEnabled === "boolean") {
      return { autoStartEnabled: value.autoStartEnabled };
    }
  } catch {
    // A missing or invalid file falls back to the plugin's opt-in default.
  }
  return { autoStartEnabled: true };
}

export function writeAutoStartPreference(
  autoStartEnabled: boolean,
  path = resolveAutoStartPreferencePath(),
): AutoStartPreference {
  const preference = { autoStartEnabled };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(preference, null, 2)}\n`, "utf8");
  return preference;
}
