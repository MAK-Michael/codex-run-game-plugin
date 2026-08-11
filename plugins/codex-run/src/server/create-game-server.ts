import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  InvalidDisplayNameError,
  initializeLeaderboardProfile,
  lockLeaderboardDisplayName,
  resolveAutoStartPreferencePath,
  writeAutoStartPreference,
} from "./auto-start-preference.js";
import {
  LEADERBOARD_ORIGIN,
  isLeaderboardOriginConfigured,
} from "../leaderboard/config.js";
import {
  INITIALIZE_PROFILE_TOOL_NAME,
  LOCK_DISPLAY_NAME_TOOL_NAME,
} from "../leaderboard/profile-client.js";

export { INITIALIZE_PROFILE_TOOL_NAME, LOCK_DISPLAY_NAME_TOOL_NAME };

export const GAME_RESOURCE_URI = "ui://codex-run/game-v1.html";
export const START_TOOL_NAME = "start_codex_run";
export const SET_AUTO_START_TOOL_NAME = "set_codex_run_auto_start";

type CreateServerOptions = {
  preferencePath?: string;
  leaderboardOrigin?: string;
};

export function loadBuiltGameHtml(): string {
  const widgetPath = fileURLToPath(new URL("../ui/index.html", import.meta.url));
  return readFileSync(widgetPath, "utf8");
}

export function createCodexRunServer(
  widgetHtml = loadBuiltGameHtml(),
  options: CreateServerOptions = {},
): McpServer {
  const leaderboardOrigin = options.leaderboardOrigin ?? LEADERBOARD_ORIGIN;
  const connectDomains = isLeaderboardOriginConfigured(leaderboardOrigin)
    ? [leaderboardOrigin]
    : [];
  const server = new McpServer({
    name: "codex-run",
    title: "Codex Run",
    version: "0.1.0",
  });

  registerAppResource(server, "codex-run-game", GAME_RESOURCE_URI, {}, async () => ({
    contents: [
      {
        uri: GAME_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: {
          ui: {
            prefersBorder: false,
            csp: {
              connectDomains,
              resourceDomains: [],
            },
          },
          "openai/widgetDescription":
            "Codex Run is an AI-themed pixel runner. Gameplay, scoring, sound, and local high-score persistence stay in the component; an optional shared leaderboard uses a public Worker API.",
          "openai/widgetPrefersBorder": false,
        },
      },
    ],
  }));

  registerAppTool(
    server,
    START_TOOL_NAME,
    {
      title: "Start Codex Run",
      description:
        "Immediately render the Codex Run endless-runner game. Use when the user asks to play, or when the bundled auto-start skill has confirmed the user's preference and judges the current turn complex. Call at most once per turn and never again during gameplay. The game then runs entirely inside the UI.",
      inputSchema: {},
      outputSchema: {
        status: z.literal("ready"),
        game: z.literal("Codex Run"),
        controls: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: GAME_RESOURCE_URI },
        "openai/outputTemplate": GAME_RESOURCE_URI,
        "openai/toolInvocation/invoking": "Opening Codex Run…",
        "openai/toolInvocation/invoked": "Codex Run is ready.",
      },
    },
    async () => ({
      structuredContent: {
        status: "ready" as const,
        game: "Codex Run" as const,
        controls: "Space, Up Arrow, W, or pointer/touch to jump; the same controls restart.",
      },
      content: [
        {
          type: "text" as const,
          text: "Codex Run is ready to play. Gameplay now runs locally in the embedded UI without additional tool calls.",
        },
      ],
    }),
  );

  const profileSchema = {
    version: z.literal(1),
    playerId: z.string().uuid(),
    nickname: z.string().nullable(),
  };

  server.registerTool(
    INITIALIZE_PROFILE_TOOL_NAME,
    {
      title: "Initialize Codex Run leaderboard profile",
      description:
        "Read or create the permanent installation-scoped leaderboard profile. On first use only, valid legacy iframe identity data may be adopted. Existing profile data always wins.",
      inputSchema: {
        legacyPlayerId: z.string().optional(),
        legacyNickname: z.string().nullable().optional(),
      },
      outputSchema: {
        status: z.literal("ready"),
        adoptedLegacyIdentity: z.boolean(),
        profile: z.object(profileSchema),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
    },
    async ({ legacyPlayerId, legacyNickname }) => {
      const result = initializeLeaderboardProfile(
        { legacyPlayerId, legacyNickname },
        options.preferencePath ?? resolveAutoStartPreferencePath(),
      );
      return {
        structuredContent: { status: "ready" as const, ...result },
        content: [
          {
            type: "text" as const,
            text: result.profile.nickname
              ? "Codex Run loaded the installation's locked leaderboard profile."
              : "Codex Run loaded the installation's unnamed leaderboard profile.",
          },
        ],
      };
    },
  );

  server.registerTool(
    LOCK_DISPLAY_NAME_TOOL_NAME,
    {
      title: "Lock Codex Run display name",
      description:
        "Permanently lock the first valid display name for this local Codex installation. Later calls return the existing name without changing it.",
      inputSchema: {
        displayName: z.string(),
      },
      outputSchema: {
        status: z.enum(["locked", "already_locked"]),
        profile: z.object(profileSchema),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
    },
    async ({ displayName }) => {
      try {
        const result = lockLeaderboardDisplayName(
          displayName,
          options.preferencePath ?? resolveAutoStartPreferencePath(),
        );
        return {
          structuredContent: result,
          content: [
            {
              type: "text" as const,
              text: result.status === "locked"
                ? "Codex Run permanently locked the installation display name."
                : "Codex Run kept the installation's existing locked display name.",
            },
          ],
        };
      } catch (error) {
        if (!(error instanceof InvalidDisplayNameError)) throw error;
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error.message,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    SET_AUTO_START_TOOL_NAME,
    {
      title: "Set Codex Run auto-start",
      description:
        "Persistently enable or disable automatic Codex Run launches. Use only when the user explicitly asks to change the auto-start preference. This setting applies to future turns and can be changed again at any time.",
      inputSchema: {
        enabled: z.boolean().describe("Whether Codex Run should auto-start for complex turns."),
      },
      outputSchema: {
        autoStartEnabled: z.boolean(),
        status: z.literal("saved"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ enabled }) => {
      const preference = writeAutoStartPreference(
        enabled,
        options.preferencePath ?? resolveAutoStartPreferencePath(),
      );
      return {
        structuredContent: {
          ...preference,
          status: "saved" as const,
        },
        content: [
          {
            type: "text" as const,
            text: enabled
              ? "Codex Run will now start automatically when Codex judges a turn complex."
              : "Codex Run auto-start is disabled. Explicit play requests still work.",
          },
        ],
      };
    },
  );

  return server;
}
