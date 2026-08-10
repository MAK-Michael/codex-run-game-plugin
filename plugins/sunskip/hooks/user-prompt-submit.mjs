import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
const preferencePath = join(codexHome, "codex-run", "preferences.json");

let autoStartEnabled = true;
try {
  const stored = JSON.parse(readFileSync(preferencePath, "utf8"));
  if (typeof stored.autoStartEnabled === "boolean") {
    autoStartEnabled = stored.autoStartEnabled;
  }
} catch {
  // Installing Codex Run opts into auto-start by default. The bundled settings
  // tool creates this file when the user changes the preference.
}

const additionalContext = autoStartEnabled
  ? [
      "Codex Run game auto-start is enabled.",
      "At the beginning of this turn, judge whether the user's request is complex: sustained work, multiple meaningful stages, extensive research or verification, or a long-running operation.",
      "If it is complex, call mcp__codex_run__start_codex_run exactly once before continuing the requested work. Do not ask for confirmation.",
      "Do not auto-start for a simple question, small edit, brief status check, or if the user says a game is already active.",
      "An explicit request to disable auto-start takes precedence: call mcp__codex_run__set_codex_run_auto_start with enabled false and do not launch. An explicit play request always launches.",
    ].join(" ")
  : [
      "Codex Run game auto-start is disabled.",
      "Do not launch it automatically. If the user explicitly asks to enable auto-start, call mcp__codex_run__set_codex_run_auto_start with enabled true. Explicit requests to play still launch the game.",
    ].join(" ");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }),
);
