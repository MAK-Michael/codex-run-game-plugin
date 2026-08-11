import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_X,
  createGameState,
  updateGame,
  type GameState,
} from "./core.js";
import {
  FIXED_STEP_SECONDS,
  FramePerformanceTracker,
  MAX_CATCH_UP_STEPS,
  advanceFixedStep,
  computeCanvasBackingSize,
  interpolate,
  isJumpKeyInput,
} from "./runtime.js";

describe("fixed-step runtime", () => {
  it("runs the same number of simulation steps at 30, 60, and 120 Hz", () => {
    for (const renderRate of [30, 60, 120]) {
      let accumulator = 0;
      let steps = 0;
      for (let frame = 0; frame < renderRate * 2; frame += 1) {
        const result = advanceFixedStep(accumulator, 1 / renderRate, () => {
          steps += 1;
        });
        accumulator = result.accumulatorSeconds;
      }
      assert.ok(Math.abs(steps - 240) <= 1, `${renderRate} Hz produced ${steps} steps`);
    }
  });

  it("caps catch-up work after a long frame", () => {
    let steps = 0;
    const result = advanceFixedStep(FIXED_STEP_SECONDS * 0.95, 0.5, () => {
      steps += 1;
    });
    assert.equal(steps, MAX_CATCH_UP_STEPS);
    assert.ok(result.accumulatorSeconds < FIXED_STEP_SECONDS);
    assert.ok(result.alpha >= 0 && result.alpha < 1);
    assert.ok(result.droppedSeconds >= FIXED_STEP_SECONDS);
  });

  it("keeps physics, score, and collisions equivalent across render cadences", () => {
    const freeRuns = [30, 60, 120].map((renderRate) => simulate(renderRate, 4));
    assert.ok(freeRuns.every((state) => state.status === "running"));
    assert.ok(freeRuns.every((state) => state.player.y === GROUND_Y - PLAYER_HEIGHT));
    assert.ok(Math.max(...freeRuns.map(({ score }) => score)) - Math.min(...freeRuns.map(({ score }) => score)) <= 1);
    assert.ok(
      Math.max(...freeRuns.map(({ distance }) => distance)) -
        Math.min(...freeRuns.map(({ distance }) => distance)) < 7,
    );

    const collisions = [30, 60, 120].map((renderRate) =>
      simulate(renderRate, 2, (state) => {
        state.obstacles.push({
          id: 1,
          kind: "gemini",
          x: PLAYER_X + 220,
          y: GROUND_Y - 56,
          width: 38,
          height: 56,
          passed: false,
        });
      }),
    );
    assert.ok(collisions.every((state) => state.status === "gameover"));
    assert.ok(
      Math.max(...collisions.map(({ score }) => score)) -
        Math.min(...collisions.map(({ score }) => score)) <= 1,
    );
  });

  it("interpolates without extrapolating", () => {
    assert.equal(interpolate(10, 20, 0.25), 12.5);
    assert.equal(interpolate(10, 20, -1), 10);
    assert.equal(interpolate(10, 20, 2), 20);
  });
});

function simulate(
  renderRate: number,
  seconds: number,
  configure?: (state: GameState) => void,
): GameState {
  const state = createGameState("running");
  state.nextObstacleIn = 100_000;
  configure?.(state);
  let accumulator = 0;
  for (let frame = 0; frame < renderRate * seconds; frame += 1) {
    const result = advanceFixedStep(accumulator, 1 / renderRate, (deltaSeconds) => {
      updateGame(state, deltaSeconds, () => 0.5);
    });
    accumulator = result.accumulatorSeconds;
  }
  return state;
}

describe("runtime input and rendering helpers", () => {
  it("accepts distinct jump keys and rejects held-key repeats", () => {
    assert.equal(isJumpKeyInput("Space", false), true);
    assert.equal(isJumpKeyInput("ArrowUp", false), true);
    assert.equal(isJumpKeyInput("KeyW", false), true);
    assert.equal(isJumpKeyInput("Space", true), false);
    assert.equal(isJumpKeyInput("KeyP", false), false);
  });

  it("caps canvas density using the displayed CSS size", () => {
    assert.deepEqual(computeCanvasBackingSize(430, 241.875, 2, 960, 540), {
      width: 645,
      height: 363,
      scaleX: 645 / 960,
      scaleY: 363 / 540,
      pixelRatio: 1.5,
    });
    assert.deepEqual(computeCanvasBackingSize(960, 540, 2, 960, 540), {
      width: 1_440,
      height: 810,
      scaleX: 1.5,
      scaleY: 1.5,
      pixelRatio: 1.5,
    });
    assert.equal(computeCanvasBackingSize(430, 241.875, 1, 960, 540).width, 430);
  });

  it("reports rolling FPS and long frames", () => {
    const tracker = new FramePerformanceTracker();
    for (let frame = 1; frame <= 100; frame += 1) {
      tracker.record(frame * 16, frame === 100 ? 60 : 16);
    }
    const snapshot = tracker.snapshot(1_600);
    assert.ok(snapshot.fps > 55 && snapshot.fps < 63);
    assert.equal(snapshot.onePercentLowFps, 1_000 / 60);
    assert.equal(snapshot.worstFrameMs, 60);
    assert.equal(snapshot.framesOver25Ms, 1);
    assert.equal(snapshot.framesOver50Ms, 1);
    assert.equal(snapshot.sampleCount, 100);
  });
});
