import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CompletedRunReporter } from "./run-reporter.js";

describe("completed-run reporter", () => {
  it("submits each completed run exactly once", async () => {
    const submissions: number[] = [];
    const reporter = new CompletedRunReporter(async (run) => {
      submissions.push(run.score);
    });
    const runId = reporter.startRun();

    assert.equal(reporter.report(runId, { score: 80, durationMs: 2_000 }), true);
    assert.equal(reporter.report(runId, { score: 80, durationMs: 2_000 }), false);
    await Promise.resolve();
    assert.deepEqual(submissions, [80]);
  });

  it("allows a retry while the previous submission remains pending", () => {
    const reporter = new CompletedRunReporter(() => new Promise(() => undefined));
    const firstRun = reporter.startRun();
    assert.equal(reporter.report(firstRun, { score: 80, durationMs: 2_000 }), true);

    const secondRun = reporter.startRun();
    assert.equal(reporter.report(secondRun, { score: 169, durationMs: 4_000 }), true);
  });

  it("contains submission failures", async () => {
    let failed = false;
    const reporter = new CompletedRunReporter(
      async () => {
        throw new Error("offline");
      },
      () => {
        failed = true;
      },
    );
    reporter.report(reporter.startRun(), { score: 80, durationMs: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(failed, true);
  });
});
