import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import {
  GAME_RESOURCE_URI,
  INITIALIZE_PROFILE_TOOL_NAME,
  LOCK_DISPLAY_NAME_TOOL_NAME,
  SET_AUTO_START_TOOL_NAME,
  START_TOOL_NAME,
  createCodexRunServer,
} from "./create-game-server.js";

describe("MCP launch contract", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "codex-run-contract-"));
  const preferencePath = join(tempDirectory, "preferences.json");
  const server = createCodexRunServer(
    "<!doctype html><title>Codex Run</title><canvas></canvas>",
    { preferencePath },
  );
  const client = new Client({ name: "codex-run-contract-test", version: "0.1.0" });

  before(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  after(async () => {
    await client.close();
    await server.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("links the fast start tool to a playable MCP App resource", async () => {
    const { tools } = await client.listTools();
    const startTool = tools.find((tool) => tool.name === START_TOOL_NAME);
    assert.ok(startTool);
    const toolMeta = startTool._meta as { ui?: { resourceUri?: string } } | undefined;
    assert.equal(toolMeta?.ui?.resourceUri, GAME_RESOURCE_URI);

    const result = await client.callTool({ name: START_TOOL_NAME, arguments: {} });
    assert.deepEqual(result.structuredContent, {
      status: "ready",
      game: "Codex Run",
      controls: "Space, Up Arrow, W, or pointer/touch to jump; the same controls restart.",
    });

    const resource = await client.readResource({ uri: GAME_RESOURCE_URI });
    assert.equal(resource.contents[0]?.mimeType, RESOURCE_MIME_TYPE);
    assert.match("text" in resource.contents[0]! ? resource.contents[0].text : "", /<canvas>/);
  });

  it("allows only the configured leaderboard origin for network connections", async () => {
    const configuredServer = createCodexRunServer(
      "<!doctype html><title>Codex Run</title><canvas></canvas>",
      {
        preferencePath,
        leaderboardOrigin: "https://codex-run.example.workers.dev",
      },
    );
    const configuredClient = new Client({ name: "csp-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      configuredServer.connect(serverTransport),
      configuredClient.connect(clientTransport),
    ]);

    try {
      const resource = await configuredClient.readResource({ uri: GAME_RESOURCE_URI });
      const meta = resource.contents[0]?._meta as {
        ui?: { csp?: { connectDomains?: string[]; resourceDomains?: string[] } };
      };
      assert.deepEqual(meta.ui?.csp, {
        connectDomains: ["https://codex-run.example.workers.dev"],
        resourceDomains: [],
      });
    } finally {
      await configuredClient.close();
      await configuredServer.close();
    }
  });

  it("persists the user's auto-start preference", async () => {
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === SET_AUTO_START_TOOL_NAME));

    const result = await client.callTool({
      name: SET_AUTO_START_TOOL_NAME,
      arguments: { enabled: false },
    });
    assert.deepEqual(result.structuredContent, {
      autoStartEnabled: false,
      status: "saved",
    });
    assert.equal(JSON.parse(readFileSync(preferencePath, "utf8")).autoStartEnabled, false);
  });

  it("initializes one app-only installation profile and locks its first valid name", async () => {
    const { tools } = await client.listTools();
    const initializeTool = tools.find((tool) => tool.name === INITIALIZE_PROFILE_TOOL_NAME);
    const lockTool = tools.find((tool) => tool.name === LOCK_DISPLAY_NAME_TOOL_NAME);
    assert.deepEqual(initializeTool?._meta, { ui: { visibility: ["app"] } });
    assert.deepEqual(lockTool?._meta, { ui: { visibility: ["app"] } });
    assert.equal(initializeTool?.annotations?.readOnlyHint, false);
    assert.equal(initializeTool?.annotations?.idempotentHint, true);

    const initialized = await client.callTool({
      name: INITIALIZE_PROFILE_TOOL_NAME,
      arguments: {
        legacyPlayerId: "8C0888D1-1C63-49CD-88D8-D2AAF93848E8",
        legacyNickname: null,
      },
    });
    assert.deepEqual(initialized.structuredContent, {
      status: "ready",
      adoptedLegacyIdentity: true,
      profile: {
        version: 1,
        playerId: "8c0888d1-1c63-49cd-88d8-d2aaf93848e8",
        nickname: null,
      },
    });

    const locked = await client.callTool({
      name: LOCK_DISPLAY_NAME_TOOL_NAME,
      arguments: { displayName: "  MAK  " },
    });
    assert.deepEqual(locked.structuredContent, {
      status: "locked",
      profile: {
        version: 1,
        playerId: "8c0888d1-1c63-49cd-88D8-D2AAF93848E8".toLowerCase(),
        nickname: "MAK",
      },
    });

    const renameAttempt = await client.callTool({
      name: LOCK_DISPLAY_NAME_TOOL_NAME,
      arguments: { displayName: "RENAME" },
    });
    assert.deepEqual(renameAttempt.structuredContent, {
      status: "already_locked",
      profile: (locked.structuredContent as { profile: unknown }).profile,
    });
  });
});
