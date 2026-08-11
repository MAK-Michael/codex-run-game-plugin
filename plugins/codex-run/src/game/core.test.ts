import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GROUND_Y,
  JUMP_BUFFER_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_X,
  collidesWithPlayer,
  createObstacle,
  createGameState,
  requestJump,
  startOrRestart,
  updateGame,
  type Obstacle,
} from "./core.js";

describe("game state", () => {
  it("starts a grounded jump from a buffered request", () => {
    const state = createGameState("running");
    assert.equal(requestJump(state), true);
    const result = updateGame(state, 1 / 120, () => 0.5);
    assert.equal(result.jumped, true);
    assert.ok(state.player.velocityY < 0);
    assert.equal(state.jumpBufferSeconds, 0);
  });

  it("buffers one jump shortly before landing without allowing a mid-air jump", () => {
    const state = createGameState("running");
    state.player.y = GROUND_Y - PLAYER_HEIGHT - 1;
    state.player.velocityY = 240;

    assert.equal(requestJump(state), true);
    assert.equal(updateGame(state, 1 / 120, () => 0.5).jumped, true);
    assert.equal(state.player.y, GROUND_Y - PLAYER_HEIGHT);
    assert.ok(state.player.velocityY < 0);

    assert.equal(requestJump(state), true);
    const airborne = updateGame(state, 1 / 120, () => 0.5);
    assert.equal(airborne.jumped, false);
    assert.ok(state.jumpBufferSeconds > 0);
    assert.ok(state.jumpBufferSeconds < JUMP_BUFFER_SECONDS);
  });

  it("refreshes rather than stacks repeated buffered requests", () => {
    const state = createGameState("running");
    state.player.y -= 120;
    state.player.velocityY = 100;

    requestJump(state);
    updateGame(state, 0.04, () => 0.5);
    assert.ok(state.jumpBufferSeconds < JUMP_BUFFER_SECONDS);
    requestJump(state);
    assert.equal(state.jumpBufferSeconds, JUMP_BUFFER_SECONDS);

    state.player.y = GROUND_Y - PLAYER_HEIGHT - 1;
    state.player.velocityY = 240;
    assert.equal(updateGame(state, 1 / 120, () => 0.5).jumped, true);
    assert.equal(state.jumpBufferSeconds, 0);
  });

  it("expires an early airborne request before landing", () => {
    const state = createGameState("running");
    state.player.y -= 180;
    requestJump(state);
    updateGame(state, JUMP_BUFFER_SECONDS + 0.01, () => 0.5);
    assert.equal(state.jumpBufferSeconds, 0);

    state.player.y = GROUND_Y - PLAYER_HEIGHT;
    state.player.velocityY = 0;
    assert.equal(updateGame(state, 1 / 120, () => 0.5).jumped, false);
  });

  it("accelerates and scores from distance without frame-rate dependence", () => {
    const fine = createGameState("running");
    const coarse = createGameState("running");
    fine.nextObstacleIn = 100_000;
    coarse.nextObstacleIn = 100_000;

    for (let i = 0; i < 120; i += 1) updateGame(fine, 1 / 60, () => 0.5);
    for (let i = 0; i < 40; i += 1) updateGame(coarse, 1 / 20, () => 0.5);

    assert.ok(fine.speed > 355);
    assert.ok(Math.abs(fine.score - coarse.score) <= 1);
  });

  it("ends the run on a hit but not when a jump clears the obstacle", () => {
    const obstacle: Obstacle = {
      id: 1,
      kind: "gemini",
      x: PLAYER_X + 8,
      y: GROUND_Y - 55,
      width: 42,
      height: 55,
      passed: false,
    };
    const grounded = createGameState("running");
    grounded.obstacles = [{ ...obstacle }];
    assert.equal(collidesWithPlayer(grounded, grounded.obstacles[0]), true);
    assert.equal(updateGame(grounded, 1 / 60, () => 0.5).crashed, true);
    assert.equal(grounded.status, "gameover");

    const airborne = createGameState("running");
    airborne.player.y -= 120;
    assert.equal(collidesWithPlayer(airborne, obstacle), false);

    const claude = createObstacle(2, "claude", 0.5);
    const grok = createObstacle(3, "grok", 0.5);
    assert.equal(claude.y + claude.height, GROUND_Y);
    assert.ok(grok.y + grok.height < GROUND_Y - PLAYER_HEIGHT);
  });

  it("restarts with a clean run after game over", () => {
    const ended = createGameState("gameover");
    ended.score = 842;
    ended.obstacles.push({
      id: 1,
      kind: "gemini",
      x: 200,
      y: 370,
      width: 40,
      height: 54,
      passed: false,
    });
    const restarted = startOrRestart(ended);
    assert.equal(restarted.status, "running");
    assert.equal(restarted.score, 0);
    assert.deepEqual(restarted.obstacles, []);
  });
});
