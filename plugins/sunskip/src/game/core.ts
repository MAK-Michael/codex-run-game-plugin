export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
export const GROUND_Y = 424;
export const PLAYER_X = 154;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 62;

export type GameStatus = "ready" | "running" | "gameover";
export type ObstacleKind =
  | "claude"
  | "gemini"
  | "grok"
  | "kimi"
  | "code"
  | "braces"
  | "terminal";

export interface PlayerState {
  y: number;
  velocityY: number;
}

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  width: number;
  height: number;
  passed: boolean;
}

export interface GameState {
  status: GameStatus;
  player: PlayerState;
  obstacles: Obstacle[];
  speed: number;
  distance: number;
  score: number;
  nextObstacleIn: number;
  nextObstacleId: number;
}

export type RandomSource = () => number;

const GRAVITY = 2_180;
const JUMP_VELOCITY = -790;
const START_SPEED = 355;
const MAX_SPEED = 790;
const ACCELERATION = 8.4;
const OBSTACLE_POOL: readonly ObstacleKind[] = [
  "claude",
  "gemini",
  "grok",
  "grok",
  "kimi",
  "code",
  "braces",
  "terminal",
];

export function isAirborneObstacle(kind: ObstacleKind): boolean {
  return kind === "grok";
}

export function createGameState(status: GameStatus = "ready"): GameState {
  return {
    status,
    player: { y: GROUND_Y - PLAYER_HEIGHT, velocityY: 0 },
    obstacles: [],
    speed: START_SPEED,
    distance: 0,
    score: 0,
    nextObstacleIn: 520,
    nextObstacleId: 1,
  };
}

export function isGrounded(state: GameState): boolean {
  return state.player.y >= GROUND_Y - PLAYER_HEIGHT - 0.5 && state.player.velocityY >= 0;
}

export function jump(state: GameState): boolean {
  if (state.status !== "running" || !isGrounded(state)) return false;
  state.player.velocityY = JUMP_VELOCITY;
  return true;
}

export function startOrRestart(state: GameState): GameState {
  if (state.status === "running") return state;
  return createGameState("running");
}

export function updateGame(
  state: GameState,
  deltaSeconds: number,
  random: RandomSource = Math.random,
): { state: GameState; scored: boolean; crashed: boolean } {
  if (state.status !== "running" || deltaSeconds <= 0) {
    return { state, scored: false, crashed: false };
  }

  const dt = Math.min(deltaSeconds, 0.05);
  const previousScore = state.score;
  state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION * dt);
  state.distance += state.speed * dt;
  state.score = Math.floor(state.distance / 9);

  state.player.velocityY += GRAVITY * dt;
  state.player.y += state.player.velocityY * dt;
  const floorY = GROUND_Y - PLAYER_HEIGHT;
  if (state.player.y >= floorY) {
    state.player.y = floorY;
    state.player.velocityY = 0;
  }

  for (const obstacle of state.obstacles) {
    obstacle.x -= state.speed * dt;
    if (!obstacle.passed && obstacle.x + obstacle.width < PLAYER_X) {
      obstacle.passed = true;
    }
  }
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.x > -120);

  state.nextObstacleIn -= state.speed * dt;
  if (state.nextObstacleIn <= 0) {
    const kindIndex = Math.min(OBSTACLE_POOL.length - 1, Math.floor(random() * OBSTACLE_POOL.length));
    const kind = OBSTACLE_POOL[kindIndex];
    state.obstacles.push(createObstacle(state.nextObstacleId++, kind, random()));
    const speedPressure = Math.min(120, (state.speed - START_SPEED) * 0.25);
    state.nextObstacleIn = 410 + random() * 250 - speedPressure;
  }

  const crashed = state.obstacles.some((obstacle) => collidesWithPlayer(state, obstacle));
  if (crashed) state.status = "gameover";

  return {
    state,
    scored: Math.floor(previousScore / 100) < Math.floor(state.score / 100),
    crashed,
  };
}

export function createObstacle(id: number, kind: ObstacleKind, variation = 0.5): Obstacle {
  const dimensions: Record<Exclude<ObstacleKind, "grok">, { width: number; height: number }> = {
    claude: { width: 48, height: 49 },
    gemini: { width: 38, height: 56 },
    kimi: { width: 48, height: 55 },
    code: { width: 54, height: 50 },
    braces: { width: 46, height: 56 },
    terminal: { width: 52, height: 50 },
  };
  const { width, height } = kind === "grok" ? { width: 64, height: 38 } : dimensions[kind];
  return {
    id,
    kind,
    x: WORLD_WIDTH + 80,
    y: kind === "grok" ? GROUND_Y - 111 - variation * 7 : GROUND_Y - height,
    width,
    height,
    passed: false,
  };
}

export function collidesWithPlayer(state: GameState, obstacle: Obstacle): boolean {
  const playerBox = {
    x: PLAYER_X + 8,
    y: state.player.y + 7,
    width: PLAYER_WIDTH - 15,
    height: PLAYER_HEIGHT - 10,
  };
  const airborne = isAirborneObstacle(obstacle.kind);
  const obstacleInsetX = airborne ? 9 : 5;
  const obstacleInsetY = airborne ? 7 : 5;
  const obstacleBox = {
    x: obstacle.x + obstacleInsetX,
    y: obstacle.y + obstacleInsetY,
    width: obstacle.width - obstacleInsetX * 2,
    height: obstacle.height - obstacleInsetY * 2,
  };

  return (
    playerBox.x < obstacleBox.x + obstacleBox.width &&
    playerBox.x + playerBox.width > obstacleBox.x &&
    playerBox.y < obstacleBox.y + obstacleBox.height &&
    playerBox.y + playerBox.height > obstacleBox.y
  );
}
