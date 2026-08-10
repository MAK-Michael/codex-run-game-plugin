---
name: auto-start-codex-run
description: Control and apply the Codex Run game auto-start preference for complex, multi-stage, or long-running work. Use when the plugin hook reports the preference, when the user asks to enable or disable automatic game launches, or when the user explicitly asks to play Codex Run.
---

# Auto-start Codex Run

Use the bundled `start_codex_run` MCP tool as an optional task companion. The plugin's `UserPromptSubmit` hook injects the saved preference on every turn so this workflow does not depend on semantic skill activation. Never make the game a prerequisite for completing the user's work.

## Decide whether the turn qualifies

Use judgment rather than a rigid time or tool-call threshold. Treat a turn as qualifying when it appears to require sustained work, multiple meaningful stages, extensive investigation or verification, or waiting on long-running operations. Do not offer or auto-start the game for simple questions, small edits, or brief status checks.

## Resolve the preference

1. Treat the hook-provided enabled or disabled state as authoritative.
2. Honor an explicit request to start or play the game regardless of the saved auto-start preference.
3. When the user explicitly asks to enable or disable auto-start, call `set_codex_run_auto_start` with the requested boolean. Do not use memory, repository instructions, or `AGENTS.md` for this preference.
4. Installing the plugin defaults auto-start to enabled. The user can disable it at any time by asking Codex.

## Launch behavior

- With auto-start enabled, call `start_codex_run` near the beginning of each qualifying user turn.
- Call it at most once in a turn. Do not call again during gameplay or when the user says an existing inline or picture-in-picture game is still active.
- After launching, continue the user's requested work normally; gameplay runs locally in the embedded UI.
- If the tool is unavailable or fails, continue the task and mention the issue briefly. Do not retry repeatedly.
- With auto-start disabled, launch only when the user explicitly asks to play.
