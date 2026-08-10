import "./style.css";
import {
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGameState,
  isAirborneObstacle,
  jump,
  startOrRestart,
  updateGame,
  type GameState,
  type Obstacle,
} from "../game/core.js";
import { spriteAtlas, type SpriteName } from "./sprites.js";
import {
  requestHostDisplayMode,
  type DisplayMode,
  type DisplayModeHost,
} from "./display-mode.js";

type OpenAiHost = DisplayModeHost & {
  widgetState?: { highScore?: number };
  setWidgetState?: (state: { highScore: number }) => void;
  notifyIntrinsicHeight?: (height: number) => void;
};

declare global {
  interface Window {
    openai?: OpenAiHost;
  }
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Codex Run root was not found.");

app.innerHTML = `
  <main class="shell" aria-label="Codex Run endless runner">
    <header class="topbar">
      <div class="brand" aria-label="Codex Run">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-copy"><strong>CODEX RUN</strong><span>Local model · session 01</span></span>
      </div>
      <div class="hud">
        <div class="scoreboard" aria-live="polite">
          <span class="score-item"><span>HI</span><strong id="best-score">00000</strong></span>
          <span class="score-item"><span>RUN</span><strong id="run-score">00000</strong></span>
        </div>
        <button class="icon-button" id="sound-button" type="button" aria-label="Mute sound" title="Mute sound">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path class="sound-waves" d="M16 8c1.2 1 1.8 2.3 1.8 4S17.2 15 16 16m2-10.5c2 1.7 3 3.8 3 6.5s-1 4.8-3 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
        <button class="icon-button" id="pip-button" type="button" aria-label="Open picture in picture" title="Open picture in picture" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/></svg>
        </button>
      </div>
    </header>
    <p class="display-mode-status" id="display-mode-status" role="status" aria-live="polite" hidden></p>
    <section class="stage" id="stage" tabindex="0" role="application" aria-label="Game ready. Press Space, W, or Up Arrow to jump.">
      <canvas id="game-canvas" width="1920" height="1080"></canvas>
      <div class="overlay" id="overlay">
        <div class="overlay-card">
          <p class="eyebrow" id="overlay-eyebrow">MODEL READY</p>
          <h1 id="overlay-title">PRESS SPACE<br>TO RUN</h1>
          <p id="overlay-copy">Jump the rival AIs. Stay low beneath Grok. Dodge broken code and dev tools.</p>
          <button class="primary-button" id="play-button" type="button">START SESSION <span aria-hidden="true">↵</span></button>
        </div>
      </div>
    </section>
    <footer class="footer">
      <span><i class="live-dot"></i><b>SPACE / ↑ / W / TAP</b> TO JUMP</span>
      <span>NO NETWORK · NO TOKENS SPENT</span>
    </footer>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const overlayEyebrow = document.querySelector<HTMLElement>("#overlay-eyebrow")!;
const overlayTitle = document.querySelector<HTMLElement>("#overlay-title")!;
const overlayCopy = document.querySelector<HTMLElement>("#overlay-copy")!;
const playButton = document.querySelector<HTMLButtonElement>("#play-button")!;
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const displayModeStatus = document.querySelector<HTMLParagraphElement>("#display-mode-status")!;
const scoreElement = document.querySelector<HTMLElement>("#run-score")!;
const bestElement = document.querySelector<HTMLElement>("#best-score")!;

const HIGH_SCORE_KEY = "codex-run.highScore.v1";
const SOUND_KEY = "codex-run.sound.v1";
let game = createGameState();
let lastFrame = performance.now();
let highScore = readNumber(HIGH_SCORE_KEY, window.openai?.widgetState?.highScore ?? 0);
let soundEnabled = localStorage.getItem(SOUND_KEY) !== "off";
let audioContext: AudioContext | undefined;
let runTime = 0;
let displayModeStatusTimer: number | undefined;
let pipUnavailable = false;

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sandboxed hosts can disable storage; the current run remains playable.
  }
}

function formatScore(value: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(5, "0");
}

function refreshHud(): void {
  scoreElement.textContent = formatScore(game.score);
  bestElement.textContent = formatScore(Math.max(highScore, game.score));
  stage.setAttribute(
    "aria-label",
    game.status === "running"
      ? `Codex Run running. Score ${game.score}. Press Space, W, or Up Arrow to jump.`
      : game.status === "gameover"
        ? `Run over with score ${game.score}. Press Space or tap to restart.`
        : "Game ready. Press Space, W, or Up Arrow to start and jump.",
  );
}

function updateOverlay(): void {
  if (game.status === "running") {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  if (game.status === "gameover") {
    overlayEyebrow.textContent = game.score >= highScore && game.score > 0 ? "NEW HIGH SCORE" : "CONTEXT LOST";
    overlayTitle.innerHTML = "GAME OVER";
    overlayCopy.textContent = `${formatScore(game.score)} tokens processed. Clear the context and try again.`;
    playButton.innerHTML = `RETRY <span aria-hidden="true">↻</span>`;
  } else {
    overlayEyebrow.textContent = "MODEL READY";
    overlayTitle.innerHTML = "PRESS SPACE<br>TO RUN";
    overlayCopy.textContent = "Jump the rival AIs. Stay low beneath Grok. Dodge broken code and dev tools.";
    playButton.innerHTML = `START SESSION <span aria-hidden="true">↵</span>`;
  }
}

function ensureAudio(): AudioContext | undefined {
  if (!soundEnabled) return undefined;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(frequency: number, duration: number, volume: number, sweep = 0): void {
  const audio = ensureAudio();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + sweep), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playJumpSound(): void {
  tone(220, 0.11, 0.08, 170);
}

function playMilestoneSound(): void {
  tone(560, 0.09, 0.045, 180);
  setTimeout(() => tone(760, 0.12, 0.035, 120), 70);
}

function playCrashSound(): void {
  tone(150, 0.24, 0.09, -105);
}

function primaryAction(): void {
  stage.focus({ preventScroll: true });
  if (game.status !== "running") {
    game = startOrRestart(game);
    runTime = 0;
    updateOverlay();
  }
  if (jump(game)) playJumpSound();
}

playButton.addEventListener("click", (event) => {
  event.stopPropagation();
  primaryAction();
});

stage.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button")) return;
  event.preventDefault();
  primaryAction();
});

window.addEventListener("keydown", (event) => {
  if (!["Space", "ArrowUp", "KeyW"].includes(event.code) || event.repeat) return;
  if ((event.target as HTMLElement | null)?.closest("button")) return;
  event.preventDefault();
  primaryAction();
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  writePreference(SOUND_KEY, soundEnabled ? "on" : "off");
  soundButton.setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
  soundButton.setAttribute("title", soundEnabled ? "Mute sound" : "Enable sound");
  const waves = soundButton.querySelector<SVGPathElement>(".sound-waves");
  if (waves) waves.style.display = soundEnabled ? "" : "none";
  if (soundEnabled) tone(420, 0.08, 0.04, 90);
});

function showDisplayModeStatus(message: string, isError = false): void {
  if (displayModeStatusTimer !== undefined) window.clearTimeout(displayModeStatusTimer);
  displayModeStatus.textContent = message;
  displayModeStatus.dataset.tone = isError ? "error" : "success";
  displayModeStatus.hidden = false;
  displayModeStatusTimer = window.setTimeout(() => {
    displayModeStatus.hidden = true;
    displayModeStatusTimer = undefined;
  }, isError ? 7_000 : 3_000);
}

function waitForDisplayMode(target: DisplayMode, timeoutMs = 1_500): Promise<DisplayMode | undefined> {
  if (window.openai?.displayMode === target) return Promise.resolve(target);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (mode: DisplayMode | undefined) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("openai:set_globals", onGlobals as EventListener);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
      resolve(mode);
    };
    const check = () => {
      const mode = window.openai?.displayMode;
      if (mode === target) finish(mode);
    };
    const onGlobals = () => check();
    const pollTimer = window.setInterval(check, 50);
    const timeoutTimer = window.setTimeout(() => finish(window.openai?.displayMode), timeoutMs);
    window.addEventListener("openai:set_globals", onGlobals as EventListener, { passive: true });
  });
}

function refreshDisplayModeControl(): void {
  const supported = typeof window.openai?.requestDisplayMode === "function";
  pipButton.hidden = !supported;
  const inPip = window.openai?.displayMode === "pip";
  const label = inPip ? "Return game inline" : "Open game in picture in picture";
  pipButton.setAttribute("aria-label", label);
  pipButton.setAttribute("title", pipUnavailable ? "Picture in picture is unavailable in this Codex build" : label);
  pipButton.disabled = pipUnavailable && !inPip;
  pipButton.dataset.active = inPip ? "true" : "false";
}

pipButton.addEventListener("click", async () => {
  const target: DisplayMode = window.openai?.displayMode === "pip" ? "inline" : "pip";
  pipButton.disabled = true;
  showDisplayModeStatus(target === "pip" ? "Opening picture in picture…" : "Returning the game inline…");

  const result = await requestHostDisplayMode(window.openai, target, waitForDisplayMode);
  if (result.status === "entered") {
    pipUnavailable = false;
    showDisplayModeStatus(target === "pip" ? "Game opened in picture in picture." : "Game returned inline.");
  } else {
    if (target === "pip") pipUnavailable = true;
    const detail = result.status === "rejected" ? ` (${result.error})` : "";
    console.warn(`Codex Run could not enter ${target} mode${detail}`);
    showDisplayModeStatus(
      target === "pip"
        ? "Picture in picture is unavailable in this Codex build. The game will stay inline."
        : "The host could not return the game inline.",
      true,
    );
  }
  refreshDisplayModeControl();
});

function detectHostFeatures(): void {
  refreshDisplayModeControl();
}

window.addEventListener("openai:set_globals", detectHostFeatures as EventListener, { passive: true });
detectHostFeatures();
setTimeout(detectHostFeatures, 400);
setTimeout(detectHostFeatures, 1_500);

function initializeMcpAppsBridge(): void {
  if (window.parent === window) return;
  const id = 1;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.data?.jsonrpc !== "2.0" || event.data?.id !== id) return;
    window.removeEventListener("message", onMessage);
    if (!event.data.error) {
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    }
  };
  window.addEventListener("message", onMessage, { passive: true });
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id,
      method: "ui/initialize",
      params: {
        appInfo: { name: "codex-run", version: "0.1.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      },
    },
    "*",
  );
}

function drawBackground(state: GameState): void {
  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const cloudOffset = state.distance * 0.035;
  drawDataCloud(768 - (cloudOffset % 1_180), 118, 1);
  drawDataCloud(330 - ((cloudOffset * 0.72 + 390) % 1_130), 196, 0.72);
  drawDataCloud(1_090 - ((cloudOffset * 0.84 + 80) % 1_170), 255, 0.56);

  ctx.fillStyle = "#53565c";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 3);

  const groundOffset = -(Math.floor(state.distance) % 68);
  for (let x = groundOffset; x < WORLD_WIDTH + 80; x += 68) {
    ctx.fillRect(Math.round(x), GROUND_Y + 13, 32, 2);
    ctx.fillRect(Math.round(x + 43), GROUND_Y + 24, 12, 2);
    ctx.fillRect(Math.round(x + 16), GROUND_Y + 34, 22, 2);
  }

  ctx.fillStyle = "#d6d7d4";
  const tokenOffset = -(Math.floor(state.distance * 0.16) % 180);
  for (let x = tokenOffset; x < WORLD_WIDTH + 180; x += 180) {
    ctx.fillRect(Math.round(x), GROUND_Y + 67, 4, 4);
    ctx.fillRect(Math.round(x + 9), GROUND_Y + 67, 4, 4);
    ctx.fillRect(Math.round(x + 18), GROUND_Y + 67, 13, 4);
  }
}

function drawDataCloud(x: number, y: number, scale: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#d6d7d4";
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(13, 24);
  ctx.lineTo(13, 13);
  ctx.lineTo(26, 13);
  ctx.lineTo(26, 5);
  ctx.lineTo(49, 5);
  ctx.lineTo(49, 12);
  ctx.lineTo(66, 12);
  ctx.lineTo(66, 25);
  ctx.lineTo(82, 25);
  ctx.stroke();
  ctx.fillStyle = "#d6d7d4";
  ctx.fillRect(28, 18, 5, 5);
  ctx.fillRect(39, 18, 5, 5);
  ctx.fillRect(50, 18, 5, 5);
  ctx.restore();
}

function drawPlayer(state: GameState): void {
  const airborne = state.player.y < GROUND_Y - PLAYER_HEIGHT - 3;
  const runningFrame = Math.floor(runTime * 10) % 2 === 0 ? "codex-run-a" : "codex-run-b";
  const sprite: SpriteName =
    game.status === "gameover"
      ? "codex-crash"
      : airborne
        ? state.player.velocityY < 0
          ? "codex-jump"
          : "codex-fall"
        : game.status === "running"
          ? runningFrame
          : "codex-idle";

  spriteAtlas.draw(ctx, sprite, PLAYER_X - 8, state.player.y - 2, 64, 64);

  if (!airborne && game.status === "running") {
    spriteAtlas.draw(ctx, "dust", PLAYER_X - 31, GROUND_Y - 30, 34, 34);
  }
  if (game.status === "gameover") {
    spriteAtlas.draw(ctx, "crash-burst", PLAYER_X + 26, state.player.y - 8, 53, 53);
  }
}

function drawObstacle(obstacle: Obstacle): void {
  const alternate = Math.floor(runTime * 9 + obstacle.id) % 2 === 1;
  const sprite: SpriteName =
    obstacle.kind === "claude"
      ? alternate
        ? "claude-b"
        : "claude-a"
      : obstacle.kind === "gemini"
        ? alternate
          ? "gemini-b"
          : "gemini-a"
        : obstacle.kind === "grok"
          ? alternate
            ? "grok-b"
            : "grok-a"
          : obstacle.kind === "kimi"
            ? alternate
              ? "kimi-b"
              : "kimi-a"
            : obstacle.kind;

  const padding = isAirborneObstacle(obstacle.kind) ? 8 : 6;
  const drawn = spriteAtlas.draw(
    ctx,
    sprite,
    obstacle.x - padding,
    obstacle.y - padding,
    obstacle.width + padding * 2,
    obstacle.height + padding * 2,
  );
  if (!drawn) {
    ctx.fillStyle = "#53565c";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }
}

function render(): void {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const targetWidth = Math.round(WORLD_WIDTH * ratio);
  const targetHeight = Math.round(WORLD_HEIGHT * ratio);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBackground(game);
  for (const obstacle of game.obstacles) drawObstacle(obstacle);
  drawPlayer(game);
}

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1_000, 0.05);
  lastFrame = now;
  runTime += dt;

  if (game.status === "running") {
    const result = updateGame(game, dt);
    if (result.scored) playMilestoneSound();
    if (result.crashed) {
      playCrashSound();
      if (game.score > highScore) {
        highScore = game.score;
        writePreference(HIGH_SCORE_KEY, String(highScore));
        window.openai?.setWidgetState?.({ highScore });
      }
      updateOverlay();
    }
  }

  refreshHud();
  render();
  requestAnimationFrame(frame);
}

const resizeObserver = new ResizeObserver(() => {
  window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
});
resizeObserver.observe(document.querySelector(".shell")!);

initializeMcpAppsBridge();
refreshHud();
updateOverlay();
requestAnimationFrame(frame);
