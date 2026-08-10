import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requestHostDisplayMode,
  type DisplayModeHost,
} from "./display-mode.js";

describe("host display-mode requests", () => {
  it("reports unsupported hosts without making a request", async () => {
    const result = await requestHostDisplayMode(undefined, "pip", async () => undefined);
    assert.deepEqual(result, { status: "unsupported" });
  });

  it("confirms picture-in-picture after the host updates its globals", async () => {
    const host: DisplayModeHost = {
      displayMode: "inline",
      requestDisplayMode: async () => undefined,
    };
    const result = await requestHostDisplayMode(host, "pip", async () => {
      host.displayMode = "pip";
      return host.displayMode;
    });
    assert.deepEqual(result, { status: "entered", mode: "pip" });
  });

  it("preserves the host rejection reason", async () => {
    const host: DisplayModeHost = {
      requestDisplayMode: async () => {
        throw new Error("PiP is unavailable in this host");
      },
    };
    const result = await requestHostDisplayMode(host, "pip", async () => undefined);
    assert.deepEqual(result, {
      status: "rejected",
      error: "PiP is unavailable in this host",
    });
  });

  it("does not claim success when the host resolves without changing mode", async () => {
    const host: DisplayModeHost = {
      displayMode: "inline",
      requestDisplayMode: async () => undefined,
    };
    const result = await requestHostDisplayMode(host, "pip", async () => "inline");
    assert.deepEqual(result, { status: "unconfirmed", actualMode: "inline" });
  });
});
