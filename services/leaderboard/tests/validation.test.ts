import { describe, expect, it } from "vitest";
import {
  expectedScoreForDuration,
  normalizeNickname,
  validateRunSubmission,
} from "../src/validation.js";

describe("run validation", () => {
  it("mirrors the version 1 score curve", () => {
    expect(expectedScoreForDuration(2_000)).toBe(80);
    expect(expectedScoreForDuration(10_000)).toBe(441);
    expect(expectedScoreForDuration(60_000)).toBe(4_015);
  });

  it("normalizes optional nicknames and rejects unsafe input", () => {
    expect(normalizeNickname("  MAK  ")).toBe("MAK");
    expect(normalizeNickname("   ")).toBeNull();
    expect(normalizeNickname(null)).toBeNull();
    expect(normalizeNickname("bad\nname")).toBeUndefined();
    expect(normalizeNickname("x".repeat(21))).toBeUndefined();
  });

  it("accepts only internally consistent version 1 payloads", () => {
    const value = {
      playerId: "8c0888d1-1c63-49cd-88d8-d2aaf93848e8",
      nickname: "MAK",
      score: 80,
      durationMs: 2_000,
      rulesVersion: 1,
    };

    expect(validateRunSubmission(value)).toMatchObject({ ok: true });
    expect(validateRunSubmission({ ...value, score: 50_000 })).toEqual({ ok: false });
    expect(validateRunSubmission({ ...value, rulesVersion: 2 })).toEqual({ ok: false });
    expect(validateRunSubmission({ ...value, extra: true })).toEqual({ ok: false });
  });
});
