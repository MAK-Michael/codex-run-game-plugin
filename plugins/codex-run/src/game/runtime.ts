export const FIXED_STEP_SECONDS = 1 / 120;
export const MAX_FRAME_SECONDS = 0.1;
export const MAX_CATCH_UP_STEPS = 12;
export const MAX_CANVAS_PIXEL_RATIO = 1.5;
export const PERFORMANCE_WINDOW_MS = 10_000;

export interface FixedStepAdvance {
  accumulatorSeconds: number;
  alpha: number;
  steps: number;
  droppedSeconds: number;
}

export function advanceFixedStep(
  accumulatorSeconds: number,
  elapsedSeconds: number,
  step: (deltaSeconds: number) => void,
): FixedStepAdvance {
  const normalizedElapsed = Math.max(0, elapsedSeconds);
  const elapsed = Math.min(MAX_FRAME_SECONDS, normalizedElapsed);
  let accumulator = Math.max(0, accumulatorSeconds) + elapsed;
  let steps = 0;

  while (accumulator >= FIXED_STEP_SECONDS && steps < MAX_CATCH_UP_STEPS) {
    step(FIXED_STEP_SECONDS);
    accumulator -= FIXED_STEP_SECONDS;
    steps += 1;
  }

  let droppedSeconds = normalizedElapsed - elapsed;
  if (accumulator >= FIXED_STEP_SECONDS) {
    droppedSeconds += accumulator - (accumulator % FIXED_STEP_SECONDS);
    accumulator %= FIXED_STEP_SECONDS;
  }

  return {
    accumulatorSeconds: accumulator,
    alpha: accumulator / FIXED_STEP_SECONDS,
    steps,
    droppedSeconds,
  };
}

export interface CanvasBackingSize {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  pixelRatio: number;
}

export function computeCanvasBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  worldWidth: number,
  worldHeight: number,
): CanvasBackingSize {
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  const pixelRatio = Math.min(MAX_CANVAS_PIXEL_RATIO, Math.max(1, devicePixelRatio || 1));
  const width = Math.max(1, Math.round(safeWidth * pixelRatio));
  const height = Math.max(1, Math.round(safeHeight * pixelRatio));
  return {
    width,
    height,
    scaleX: width / worldWidth,
    scaleY: height / worldHeight,
    pixelRatio,
  };
}

export function interpolate(previous: number, current: number, alpha: number): number {
  const amount = Math.min(1, Math.max(0, alpha));
  return previous + (current - previous) * amount;
}

export function isJumpKeyInput(code: string, repeat: boolean): boolean {
  return !repeat && ["Space", "ArrowUp", "KeyW"].includes(code);
}

export interface PerformanceSnapshot {
  fps: number;
  onePercentLowFps: number;
  worstFrameMs: number;
  framesOver25Ms: number;
  framesOver50Ms: number;
  sampleCount: number;
}

interface FrameSample {
  timestampMs: number;
  durationMs: number;
}

export class FramePerformanceTracker {
  private readonly samples: FrameSample[] = [];

  reset(): void {
    this.samples.length = 0;
  }

  record(timestampMs: number, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    this.samples.push({ timestampMs, durationMs });
    this.prune(timestampMs);
  }

  snapshot(timestampMs: number): PerformanceSnapshot {
    this.prune(timestampMs);
    if (this.samples.length === 0) {
      return {
        fps: 0,
        onePercentLowFps: 0,
        worstFrameMs: 0,
        framesOver25Ms: 0,
        framesOver50Ms: 0,
        sampleCount: 0,
      };
    }

    const durations = this.samples.map(({ durationMs }) => durationMs);
    const totalDuration = durations.reduce((total, duration) => total + duration, 0);
    const slowestCount = Math.max(1, Math.ceil(durations.length * 0.01));
    const slowest = [...durations].sort((a, b) => b - a).slice(0, slowestCount);
    const slowestAverage = slowest.reduce((total, duration) => total + duration, 0) / slowest.length;

    return {
      fps: totalDuration > 0 ? (durations.length * 1_000) / totalDuration : 0,
      onePercentLowFps: slowestAverage > 0 ? 1_000 / slowestAverage : 0,
      worstFrameMs: Math.max(...durations),
      framesOver25Ms: durations.filter((duration) => duration > 25).length,
      framesOver50Ms: durations.filter((duration) => duration > 50).length,
      sampleCount: durations.length,
    };
  }

  private prune(timestampMs: number): void {
    const cutoff = timestampMs - PERFORMANCE_WINDOW_MS;
    let firstCurrentSample = 0;
    while (
      firstCurrentSample < this.samples.length &&
      this.samples[firstCurrentSample].timestampMs < cutoff
    ) {
      firstCurrentSample += 1;
    }
    if (firstCurrentSample > 0) this.samples.splice(0, firstCurrentSample);
  }
}
