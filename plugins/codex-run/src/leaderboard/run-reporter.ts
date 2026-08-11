export type RunReport = {
  score: number;
  durationMs: number;
};

type SubmitRun = (run: RunReport, runId: number) => Promise<void>;

export class CompletedRunReporter {
  private activeRunId = 0;
  private submittedActiveRun = false;

  constructor(
    private readonly submit: SubmitRun,
    private readonly onFailure: () => void = () => undefined,
  ) {}

  startRun(): number {
    this.activeRunId += 1;
    this.submittedActiveRun = false;
    return this.activeRunId;
  }

  report(runId: number, run: RunReport): boolean {
    if (runId !== this.activeRunId || this.submittedActiveRun) return false;
    this.submittedActiveRun = true;
    void this.submit(run, runId).catch(() => this.onFailure());
    return true;
  }
}
