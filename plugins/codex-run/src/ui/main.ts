import "./style.css";
import { App } from "@modelcontextprotocol/ext-apps";
import {
  GROUND_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGameState,
  isAirborneObstacle,
  requestJump,
  startOrRestart,
  updateGame,
  type GameState,
  type Obstacle,
} from "../game/core.js";
import {
  FramePerformanceTracker,
  advanceFixedStep,
  computeCanvasBackingSize,
  interpolate,
  isJumpKeyInput,
} from "../game/runtime.js";
import { spriteAtlas, type SpriteName } from "./sprites.js";
import {
  LeaderboardClient,
  type LeaderboardResponse,
  type RunResponse,
} from "../leaderboard/client.js";
import {
  LEADERBOARD_ORIGIN,
  isLeaderboardOriginConfigured,
} from "../leaderboard/config.js";
import { CompletedRunReporter, type RunReport } from "../leaderboard/run-reporter.js";
import {
  MAX_NICKNAME_LENGTH,
  normalizeNickname,
} from "../leaderboard/identity.js";
import {
  INITIALIZE_PROFILE_TOOL_NAME,
  LOCK_DISPLAY_NAME_TOOL_NAME,
  parseInitializedProfile,
  parseLockedProfile,
  type LeaderboardProfile,
} from "../leaderboard/profile-client.js";
import {
  loadLeaderboardResultState,
  loadLegacyLeaderboardProfile,
  saveLeaderboardResult,
} from "../leaderboard/storage.js";

type OpenAiHost = {
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
        <span class="brand-copy"><strong>CODEX RUN</strong><span>AI arcade · endless runner</span></span>
      </div>
      <div class="hud">
        <div class="scoreboard" aria-label="Current score and personal best">
          <span class="score-item"><span>BEST</span><strong id="best-score">00000</strong></span>
          <span class="score-item"><span>SCORE</span><strong id="run-score">00000</strong></span>
        </div>
        <button class="icon-button" id="leaderboard-button" type="button" aria-label="Open leaderboard" title="Leaderboard" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20v-8H3v8h4Zm7 0V4h-4v16h4Zm7 0V9h-4v11h4Z" fill="currentColor"/></svg>
        </button>
        <button class="icon-button" id="sound-button" type="button" aria-label="Mute sound" title="Mute sound">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path class="sound-waves" d="M16 8c1.2 1 1.8 2.3 1.8 4S17.2 15 16 16m2-10.5c2 1.7 3 3.8 3 6.5s-1 4.8-3 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>
    <section class="stage" id="stage" tabindex="0" role="application" aria-label="Ready to run. Press Space, W, Up Arrow, or tap to jump.">
      <canvas id="game-canvas" width="960" height="540"></canvas>
      <output class="performance-hud" id="performance-hud" aria-label="Game performance diagnostics" hidden></output>
      <div class="overlay" id="overlay">
        <div class="overlay-card">
          <p class="eyebrow" id="overlay-eyebrow">READY TO RUN</p>
          <h1 id="overlay-title">OUTRUN THE<br>AI PACK</h1>
          <p id="overlay-copy">Jump Claude, Gemini, and Kimi. Duck under Grok. Dodge the code traps.</p>
          <p class="overlay-network-status" id="overlay-network-status" role="status" aria-live="polite" hidden></p>
          <button class="primary-button" id="play-button" type="button">START RUN <span aria-hidden="true">↵</span></button>
        </div>
      </div>
    </section>
    <section class="leaderboard-panel" id="leaderboard-panel" aria-label="Leaderboard" hidden>
      <div class="leaderboard-heading">
        <div>
          <p class="eyebrow">ALL-TIME LEADERBOARD</p>
          <h2>TOP RUNNERS</h2>
        </div>
        <button class="secondary-button" id="leaderboard-refresh" type="button">REFRESH</button>
      </div>
      <p class="leaderboard-status" id="leaderboard-status" role="status" aria-live="polite">Loading leaderboard…</p>
      <div class="leaderboard-summary">
        <span id="leaderboard-personal">No leaderboard score yet</span>
      </div>
      <ol class="leaderboard-list" id="leaderboard-list" aria-label="Top 20 all-time scores"></ol>
      <p class="leaderboard-status submission-status" id="submission-status" role="status" aria-live="polite" hidden></p>
      <div class="profile-state" id="profile-loading">
        <span>PLAYER PROFILE</span>
        <p>Loading your leaderboard profile… You can play now.</p>
      </div>
      <form class="nickname-form" id="nickname-form" hidden>
        <label for="nickname-input">CHOOSE DISPLAY NAME <span>SET ONCE · DUPLICATES OK</span></label>
        <div class="nickname-row">
          <input id="nickname-input" name="nickname" type="text" maxlength="${MAX_NICKNAME_LENGTH}" autocomplete="off" placeholder="Your leaderboard name" aria-describedby="nickname-status">
          <button class="secondary-button" id="nickname-save" type="submit">LOCK NAME</button>
        </div>
        <p id="nickname-status">Choose carefully: this name is permanent on this Codex installation. Playing unnamed is fine.</p>
      </form>
      <div class="profile-state profile-locked" id="profile-locked" hidden>
        <span>DISPLAY NAME · PERMANENT</span>
        <strong id="profile-display-name"></strong>
        <p>This name is tied to this Codex installation and cannot be changed or removed.</p>
      </div>
      <div class="profile-state" id="profile-unavailable" hidden>
        <span>LEADERBOARD PROFILE OFFLINE</span>
        <p>Could not load your leaderboard profile. Local play still works.</p>
      </div>
    </section>
    <footer class="footer">
      <span><i class="live-dot"></i><b>SPACE / ↑ / W / TAP</b> TO JUMP</span>
      <span>PLAYS LOCALLY · 0 TOKENS USED</span>
    </footer>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const ctx = canvas.getContext("2d")!;
const performanceHud = document.querySelector<HTMLOutputElement>("#performance-hud")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const overlayEyebrow = document.querySelector<HTMLElement>("#overlay-eyebrow")!;
const overlayTitle = document.querySelector<HTMLElement>("#overlay-title")!;
const overlayCopy = document.querySelector<HTMLElement>("#overlay-copy")!;
const overlayNetworkStatus = document.querySelector<HTMLParagraphElement>("#overlay-network-status")!;
const playButton = document.querySelector<HTMLButtonElement>("#play-button")!;
const leaderboardButton = document.querySelector<HTMLButtonElement>("#leaderboard-button")!;
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button")!;
const scoreElement = document.querySelector<HTMLElement>("#run-score")!;
const bestElement = document.querySelector<HTMLElement>("#best-score")!;
const leaderboardPanel = document.querySelector<HTMLElement>("#leaderboard-panel")!;
const leaderboardRefresh = document.querySelector<HTMLButtonElement>("#leaderboard-refresh")!;
const leaderboardStatus = document.querySelector<HTMLParagraphElement>("#leaderboard-status")!;
const leaderboardPersonal = document.querySelector<HTMLElement>("#leaderboard-personal")!;
const leaderboardList = document.querySelector<HTMLOListElement>("#leaderboard-list")!;
const submissionStatus = document.querySelector<HTMLParagraphElement>("#submission-status")!;
const profileLoading = document.querySelector<HTMLElement>("#profile-loading")!;
const nicknameForm = document.querySelector<HTMLFormElement>("#nickname-form")!;
const nicknameInput = document.querySelector<HTMLInputElement>("#nickname-input")!;
const nicknameSave = document.querySelector<HTMLButtonElement>("#nickname-save")!;
const nicknameStatus = document.querySelector<HTMLParagraphElement>("#nickname-status")!;
const profileLocked = document.querySelector<HTMLElement>("#profile-locked")!;
const profileDisplayName = document.querySelector<HTMLElement>("#profile-display-name")!;
const profileUnavailable = document.querySelector<HTMLElement>("#profile-unavailable")!;

const HIGH_SCORE_KEY = "codex-run.highScore.v1";
const SOUND_KEY = "codex-run.sound.v1";
const GAME_OVER_MESSAGES = [
  "The build passed locally. Of course it did.",
  "One dependency update. Twelve new problems.",
  "The cache remembered everything except the fix.",
  "The bug was one line below the breakpoint.",
  "The refactor was supposed to be small.",
  "Works on your machine. Just your machine.",
] as const;
let game = createGameState();
let lastFrame: number | undefined;
let animationFrameId: number | undefined;
let physicsAccumulator = 0;
let renderAlpha = 1;
let previousPlayerY = game.player.y;
let previousDistance = game.distance;
const previousObstacleX = new Map<number, number>();
let canvasScaleX = 1;
let canvasScaleY = 1;
let nextHudUpdateAt = 0;
let lastHudScore = -1;
let lastHudBest = -1;
let lastAnnouncedStatus: GameState["status"] | undefined;
let lastAnnouncedMilestone = -1;
let performanceHudVisible = false;
let nextPerformanceHudUpdateAt = 0;
const performanceTracker = new FramePerformanceTracker();
let highScore = readNumber(HIGH_SCORE_KEY, window.openai?.widgetState?.highScore ?? 0);
let soundEnabled = readPreference(SOUND_KEY) !== "off";
let audioContext: AudioContext | undefined;
let runTime = 0;
const storage = resolveStorage();
let leaderboardResultState = storage
  ? loadLeaderboardResultState(storage)
  : { rank: null, bestScore: null };
let leaderboardProfile: LeaderboardProfile | undefined;
let profileApp: App | undefined;
let profilePhase: "loading" | "ready" | "unavailable" = "loading";
let profileMessage = "";
let profileLocking = false;
let profileInitializationPromise: Promise<void>;
const leaderboardConfigured = isLeaderboardOriginConfigured();
const leaderboardClient = leaderboardConfigured
  ? new LeaderboardClient(LEADERBOARD_ORIGIN)
  : undefined;
let leaderboardData: LeaderboardResponse | undefined;
let leaderboardPhase: "loading" | "empty" | "populated" | "unavailable" = "loading";
let submissionMessage = "";
let activeRunId = 0;
const runReporter = new CompletedRunReporter(submitCompletedRun, () => {
  submissionMessage = "Leaderboard offline. This run was not posted.";
  renderLeaderboard();
});

function resolveStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

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

function refreshHud(now = performance.now(), force = false): void {
  if (force || now >= nextHudUpdateAt) {
    const best = Math.max(highScore, game.score);
    if (game.score !== lastHudScore) {
      scoreElement.textContent = formatScore(game.score);
      lastHudScore = game.score;
    }
    if (best !== lastHudBest) {
      bestElement.textContent = formatScore(best);
      lastHudBest = best;
    }
    nextHudUpdateAt = now + 100;
  }

  const milestone = Math.floor(game.score / 100) * 100;
  if (
    force ||
    game.status !== lastAnnouncedStatus ||
    (game.status === "running" && milestone !== lastAnnouncedMilestone)
  ) {
    stage.setAttribute(
      "aria-label",
      game.status === "running"
        ? `Codex Run in progress. Score ${milestone}. Press Space, W, Up Arrow, or tap to jump.`
        : game.status === "gameover"
          ? `Run over. Score ${game.score}. Press Space or tap to run again.`
          : "Ready to run. Press Space, W, Up Arrow, or tap to start.",
    );
    lastAnnouncedStatus = game.status;
    lastAnnouncedMilestone = milestone;
  }
}

function updateOverlay(): void {
  if (game.status === "running") {
    overlay.hidden = true;
    overlayNetworkStatus.hidden = true;
    return;
  }
  overlay.hidden = false;
  if (game.status === "gameover") {
    overlayEyebrow.textContent = game.score >= highScore && game.score > 0 ? "NEW PERSONAL BEST" : "RUN OVER";
    overlayTitle.innerHTML = `${formatScore(game.score)}<br>TOKENS`;
    overlayCopy.textContent = GAME_OVER_MESSAGES[(Math.max(activeRunId, 1) - 1) % GAME_OVER_MESSAGES.length];
    playButton.innerHTML = `RUN AGAIN <span aria-hidden="true">↻</span>`;
  } else {
    overlayEyebrow.textContent = "READY TO RUN";
    overlayTitle.innerHTML = "OUTRUN THE<br>AI PACK";
    overlayCopy.textContent = "Jump Claude, Gemini, and Kimi. Duck under Grok. Dodge the code traps.";
    overlayNetworkStatus.hidden = true;
    playButton.innerHTML = `START RUN <span aria-hidden="true">↵</span>`;
  }
}

function setOverlaySubmissionStatus(message: string, runId: number): void {
  if (runId !== activeRunId || game.status !== "gameover") return;
  overlayNetworkStatus.textContent = message;
  overlayNetworkStatus.hidden = message.length === 0;
}

function setLeaderboardOpen(open: boolean): void {
  leaderboardPanel.hidden = !open;
  leaderboardButton.dataset.active = open ? "true" : "false";
  leaderboardButton.setAttribute("aria-expanded", String(open));
  leaderboardButton.setAttribute("aria-label", open ? "Close leaderboard" : "Open leaderboard");
  if (open) {
    renderLeaderboard();
  } else {
    window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
  }
}

function renderLeaderboard(): void {
  if (leaderboardPanel.hidden) return;
  leaderboardRefresh.disabled = leaderboardPhase === "loading" || !leaderboardClient;
  leaderboardList.replaceChildren();

  if (leaderboardPhase === "loading") {
    leaderboardStatus.textContent = "Loading leaderboard…";
  } else if (leaderboardPhase === "unavailable") {
    leaderboardStatus.textContent = leaderboardConfigured
      ? "Leaderboard unavailable. Your local best still works."
      : "Leaderboard is not connected in this build. Your local best still works.";
  } else if (leaderboardPhase === "empty") {
    leaderboardStatus.textContent = "No ranked scores yet. Claim the first spot.";
  } else {
    leaderboardStatus.textContent = "Top 20 all time";
  }

  if (leaderboardData) {
    for (const entry of leaderboardData.entries) {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const name = document.createElement("strong");
      const score = document.createElement("span");
      rank.textContent = `#${entry.rank}`;
      name.textContent = entry.nickname;
      score.textContent = formatScore(entry.score);
      item.title = `Set ${new Date(entry.achievedAt).toLocaleString()}`;
      item.append(rank, name, score);
      leaderboardList.append(item);
    }
  }

  const best = leaderboardResultState.bestScore;
  const rank = leaderboardResultState.rank;
  leaderboardPersonal.textContent =
    best === null
      ? "No leaderboard score yet"
      : rank === null
        ? `Your best ${formatScore(best)} · add a name to enter the rankings`
        : `Your best ${formatScore(best)} · rank #${rank} when last checked`;

  submissionStatus.hidden = submissionMessage.length === 0;
  submissionStatus.textContent = submissionMessage;
  profileLoading.hidden = profilePhase !== "loading";
  nicknameForm.hidden = profilePhase !== "ready" || leaderboardProfile?.nickname !== null;
  profileLocked.hidden = profilePhase !== "ready" || !leaderboardProfile?.nickname;
  profileUnavailable.hidden = profilePhase !== "unavailable";
  if (leaderboardProfile?.nickname) profileDisplayName.textContent = leaderboardProfile.nickname;
  if (!nicknameForm.hidden) {
    nicknameInput.disabled = profileLocking;
    nicknameSave.disabled = profileLocking;
    nicknameStatus.textContent = profileMessage ||
      "Choose carefully: this name is permanent on this Codex installation. Playing unnamed is fine.";
  }
  window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
}

async function refreshLeaderboard(fresh = false): Promise<void> {
  if (!leaderboardClient) {
    leaderboardPhase = "unavailable";
    renderLeaderboard();
    return;
  }

  leaderboardPhase = "loading";
  renderLeaderboard();
  try {
    leaderboardData = await leaderboardClient.getLeaderboard(fresh);
    leaderboardPhase = leaderboardData.entries.length === 0 ? "empty" : "populated";
  } catch {
    leaderboardPhase = "unavailable";
  }
  renderLeaderboard();
}

async function submitCompletedRun(run: RunReport, runId: number): Promise<void> {
  await profileInitializationPromise;
  if (!leaderboardClient || !leaderboardProfile) {
    const reason = leaderboardClient
      ? "Could not load your leaderboard profile. This run was not posted."
      : "Leaderboard is not connected in this build. This run was not posted.";
    submissionMessage = reason;
    setOverlaySubmissionStatus(reason, runId);
    renderLeaderboard();
    return;
  }

  submissionMessage = "Saving score…";
  setOverlaySubmissionStatus(submissionMessage, runId);
  renderLeaderboard();
  try {
    const result = await leaderboardClient.submitRun({
      playerId: leaderboardProfile.playerId,
      nickname: leaderboardProfile.nickname,
      score: run.score,
      durationMs: run.durationMs,
      rulesVersion: 1,
    });
    applyRunResponse(result);
    const profileConsistent = await reconcileAuthoritativeWorkerName(result);
    submissionMessage = !profileConsistent && result.nickname
      ? `Score saved as ${result.nickname}. Your local profile name could not be updated.`
      : result.rank === null
        ? "Score saved. Add a display name to enter the leaderboard."
        : result.personalBest
          ? `New personal best · rank #${result.rank}`
          : `Score saved · rank #${result.rank}`;
    setOverlaySubmissionStatus(submissionMessage, runId);
    renderLeaderboard();
    if (result.personalBest) await refreshLeaderboard(true);
  } catch {
    submissionMessage = "Leaderboard offline. This run was not posted.";
    setOverlaySubmissionStatus(submissionMessage, runId);
    renderLeaderboard();
  }
}

function applyRunResponse(result: RunResponse): void {
  leaderboardResultState = {
    rank: result.rank,
    bestScore: result.bestScore,
  };
  if (storage) saveLeaderboardResult(storage, result);
}

async function reconcileAuthoritativeWorkerName(result: RunResponse): Promise<boolean> {
  if (!result.nickname) return true;
  if (leaderboardProfile?.nickname === result.nickname) return true;
  if (leaderboardProfile?.nickname !== null || !profileApp) return false;
  try {
    const lockResult = await profileApp.callServerTool({
      name: LOCK_DISPLAY_NAME_TOOL_NAME,
      arguments: { displayName: result.nickname },
    });
    const profile = parseLockedProfile(lockResult);
    if (!profile) return false;
    leaderboardProfile = profile;
    return profile.nickname === result.nickname;
  } catch {
    profileApp = undefined;
    leaderboardProfile = undefined;
    profilePhase = "unavailable";
    return false;
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
    activeRunId = runReporter.startRun();
    overlayNetworkStatus.hidden = true;
    setLeaderboardOpen(false);
    updateOverlay();
    resetRenderState();
    refreshHud(performance.now(), true);
  }
  requestJump(game);
  startGameLoop();
}

playButton.addEventListener("click", (event) => {
  event.stopPropagation();
  primaryAction();
});

leaderboardButton.addEventListener("click", () => {
  setLeaderboardOpen(leaderboardPanel.hidden);
});

leaderboardRefresh.addEventListener("click", () => {
  void refreshLeaderboard(true);
});

nicknameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!profileApp || profilePhase !== "ready" || !leaderboardProfile) {
    profileMessage = "Leaderboard profile unavailable. You can keep playing.";
    renderLeaderboard();
    return;
  }

  const nickname = normalizeNickname(nicknameInput.value);
  if (!nickname) {
    profileMessage = `Enter a name with 1–${MAX_NICKNAME_LENGTH} characters.`;
    renderLeaderboard();
    return;
  }

  profileLocking = true;
  profileMessage = "Saving your display name…";
  renderLeaderboard();
  try {
    const result = await profileApp.callServerTool({
      name: LOCK_DISPLAY_NAME_TOOL_NAME,
      arguments: { displayName: nickname },
    });
    const profile = parseLockedProfile(result);
    if (!profile) throw new Error("Codex Run returned an invalid profile.");
    leaderboardProfile = profile;
    profileLocking = false;
    profileMessage = "";
    submissionMessage = `${profile.nickname ?? "Your name"} is now your permanent leaderboard name.`;
  } catch {
    profileLocking = false;
    profileMessage = "Could not save that name. Nothing changed, and you can keep playing.";
  }
  renderLeaderboard();
});

stage.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button")) return;
  event.preventDefault();
  primaryAction();
});

window.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement | null)?.closest("button, input, form")) return;
  if (event.shiftKey && event.code === "KeyP" && !event.repeat) {
    event.preventDefault();
    togglePerformanceHud();
    return;
  }
  if (!isJumpKeyInput(event.code, event.repeat)) return;
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

async function initializePermanentProfile(): Promise<void> {
  if (window.parent === window) {
    profilePhase = "unavailable";
    renderLeaderboard();
    return;
  }

  const appBridge = new App(
    { name: "codex-run", version: "0.1.0" },
    {},
    { autoResize: false },
  );
  try {
    await appBridge.connect();
    if (!appBridge.getHostCapabilities()?.serverTools) {
      throw new Error("This host does not proxy MCP server tool calls to apps.");
    }

    const legacyProfile = storage ? loadLegacyLeaderboardProfile(storage) : undefined;
    const result = await appBridge.callServerTool({
      name: INITIALIZE_PROFILE_TOOL_NAME,
      arguments: legacyProfile
        ? {
            legacyPlayerId: legacyProfile.playerId,
            legacyNickname: legacyProfile.nickname,
          }
        : {},
    });
    const profile = parseInitializedProfile(result);
    if (!profile) throw new Error("Codex Run returned an invalid installation profile.");
    if (legacyProfile?.playerId !== profile.playerId) {
      leaderboardResultState = { rank: null, bestScore: null };
    }

    profileApp = appBridge;
    leaderboardProfile = profile;
    profilePhase = "ready";
  } catch (error) {
    console.warn("Codex Run permanent profile storage is unavailable", error);
    profileApp = undefined;
    leaderboardProfile = undefined;
    profilePhase = "unavailable";
    try {
      await appBridge.close();
    } catch {
      // The connection may already be closed after a failed handshake.
    }
  }
  renderLeaderboard();
}

function drawBackground(distance: number): void {
  ctx.fillStyle = "#f7f7f5";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const cloudOffset = distance * 0.035;
  drawDataCloud(768 - (cloudOffset % 1_180), 118, 1);
  drawDataCloud(330 - ((cloudOffset * 0.72 + 390) % 1_130), 196, 0.72);
  drawDataCloud(1_090 - ((cloudOffset * 0.84 + 80) % 1_170), 255, 0.56);

  ctx.fillStyle = "#53565c";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 3);

  const groundOffset = -(Math.floor(distance) % 68);
  for (let x = groundOffset; x < WORLD_WIDTH + 80; x += 68) {
    ctx.fillRect(Math.round(x), GROUND_Y + 13, 32, 2);
    ctx.fillRect(Math.round(x + 43), GROUND_Y + 24, 12, 2);
    ctx.fillRect(Math.round(x + 16), GROUND_Y + 34, 22, 2);
  }

  ctx.fillStyle = "#d6d7d4";
  const tokenOffset = -(Math.floor(distance * 0.16) % 180);
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

function drawPlayer(state: GameState, playerY: number): void {
  const airborne = playerY < GROUND_Y - PLAYER_HEIGHT - 3;
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

  spriteAtlas.draw(ctx, sprite, PLAYER_X - 8, playerY - 2, 64, 64);

  if (!airborne && game.status === "running") {
    spriteAtlas.draw(ctx, "dust", PLAYER_X - 31, GROUND_Y - 30, 34, 34);
  }
  if (game.status === "gameover") {
    spriteAtlas.draw(ctx, "crash-burst", PLAYER_X + 26, playerY - 8, 53, 53);
  }
}

function drawObstacle(obstacle: Obstacle, obstacleX: number): void {
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
    obstacleX - padding,
    obstacle.y - padding,
    obstacle.width + padding * 2,
    obstacle.height + padding * 2,
  );
  if (!drawn) {
    ctx.fillStyle = "#53565c";
    ctx.fillRect(obstacleX, obstacle.y, obstacle.width, obstacle.height);
  }
}

function render(alpha = renderAlpha): void {
  ctx.setTransform(canvasScaleX, 0, 0, canvasScaleY, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const distance = interpolate(previousDistance, game.distance, alpha);
  const playerY = interpolate(previousPlayerY, game.player.y, alpha);
  drawBackground(distance);
  for (const obstacle of game.obstacles) {
    const previousX = previousObstacleX.get(obstacle.id) ?? obstacle.x;
    drawObstacle(obstacle, interpolate(previousX, obstacle.x, alpha));
  }
  drawPlayer(game, playerY);
}

function capturePreviousRenderState(): void {
  previousPlayerY = game.player.y;
  previousDistance = game.distance;
  previousObstacleX.clear();
  for (const obstacle of game.obstacles) previousObstacleX.set(obstacle.id, obstacle.x);
}

function resetRenderState(): void {
  capturePreviousRenderState();
  physicsAccumulator = 0;
  renderAlpha = 1;
}

function resizeCanvas(): void {
  const bounds = canvas.getBoundingClientRect();
  const backing = computeCanvasBackingSize(
    bounds.width,
    bounds.height,
    window.devicePixelRatio || 1,
    WORLD_WIDTH,
    WORLD_HEIGHT,
  );
  if (canvas.width !== backing.width || canvas.height !== backing.height) {
    canvas.width = backing.width;
    canvas.height = backing.height;
  }
  canvasScaleX = backing.scaleX;
  canvasScaleY = backing.scaleY;
}

function startGameLoop(): void {
  if (game.status !== "running" || document.hidden || animationFrameId !== undefined) return;
  lastFrame = performance.now();
  resetRenderState();
  performanceTracker.reset();
  nextPerformanceHudUpdateAt = 0;
  animationFrameId = requestAnimationFrame(frame);
}

function stopGameLoop(): void {
  if (animationFrameId !== undefined) cancelAnimationFrame(animationFrameId);
  animationFrameId = undefined;
  lastFrame = undefined;
  physicsAccumulator = 0;
}

function finishRun(now: number): void {
  playCrashSound();
  if (game.score > highScore) {
    highScore = game.score;
    writePreference(HIGH_SCORE_KEY, String(highScore));
    window.openai?.setWidgetState?.({ highScore });
  }
  updateOverlay();
  refreshHud(now, true);
  runReporter.report(activeRunId, {
    score: game.score,
    durationMs: Math.max(1, Math.round(runTime * 1_000)),
  });
}

function frame(now: number): void {
  animationFrameId = undefined;
  if (game.status !== "running" || document.hidden) {
    lastFrame = undefined;
    renderAlpha = 1;
    render();
    updatePerformanceHud(now, true);
    return;
  }

  const elapsedMs = Math.max(0, now - (lastFrame ?? now));
  lastFrame = now;
  performanceTracker.record(now, elapsedMs);

  const advance = advanceFixedStep(physicsAccumulator, elapsedMs / 1_000, (deltaSeconds) => {
    if (game.status !== "running") return;
    capturePreviousRenderState();
    const result = updateGame(game, deltaSeconds);
    runTime += deltaSeconds;
    if (result.jumped) playJumpSound();
    if (result.scored) playMilestoneSound();
    if (result.crashed) finishRun(now);
  });
  physicsAccumulator = advance.accumulatorSeconds;
  renderAlpha = game.status === "running" ? advance.alpha : 1;

  refreshHud(now);
  render();
  updatePerformanceHud(now);
  if (game.status === "running") {
    animationFrameId = requestAnimationFrame(frame);
  } else {
    lastFrame = undefined;
  }
}

function togglePerformanceHud(): void {
  performanceHudVisible = !performanceHudVisible;
  performanceHud.hidden = !performanceHudVisible;
  updatePerformanceHud(performance.now(), true);
}

function updatePerformanceHud(now: number, force = false): void {
  if (!performanceHudVisible || (!force && now < nextPerformanceHudUpdateAt)) return;
  const stats = performanceTracker.snapshot(now);
  performanceHud.textContent = stats.sampleCount === 0
    ? "FPS  IDLE\n1%   --\nMAX  --\n>25  0  >50  0"
    : [
        `FPS  ${stats.fps.toFixed(1)}`,
        `1%   ${stats.onePercentLowFps.toFixed(1)}`,
        `MAX  ${stats.worstFrameMs.toFixed(1)}ms`,
        `>25  ${stats.framesOver25Ms}  >50  ${stats.framesOver50Ms}`,
      ].join("\n");
  nextPerformanceHudUpdateAt = now + 250;
}

const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
  render();
  window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
});
resizeObserver.observe(document.querySelector(".shell")!);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopGameLoop();
  } else if (game.status === "running") {
    startGameLoop();
  } else {
    resizeCanvas();
    render(1);
  }
});

spriteAtlas.image.addEventListener("load", () => render(), { once: true });
resizeCanvas();
refreshHud(performance.now(), true);
updateOverlay();
renderLeaderboard();
render(1);
profileInitializationPromise = initializePermanentProfile();
void refreshLeaderboard();
