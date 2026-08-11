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
        <button class="icon-button" id="leaderboard-button" type="button" aria-label="Open shared leaderboard" title="Shared leaderboard" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20v-8H3v8h4Zm7 0V4h-4v16h4Zm7 0V9h-4v11h4Z" fill="currentColor"/></svg>
        </button>
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
          <p class="overlay-network-status" id="overlay-network-status" role="status" aria-live="polite" hidden></p>
          <button class="primary-button" id="play-button" type="button">START SESSION <span aria-hidden="true">↵</span></button>
        </div>
      </div>
    </section>
    <section class="leaderboard-panel" id="leaderboard-panel" aria-label="Shared leaderboard" hidden>
      <div class="leaderboard-heading">
        <div>
          <p class="eyebrow">SHARED HIGH SCORES</p>
          <h2>GLOBAL RUNS</h2>
        </div>
        <button class="secondary-button" id="leaderboard-refresh" type="button">REFRESH</button>
      </div>
      <p class="leaderboard-status" id="leaderboard-status" role="status" aria-live="polite">Loading shared scores…</p>
      <div class="leaderboard-summary">
        <span id="leaderboard-stats">— completed runs</span>
        <span id="leaderboard-personal">No shared result yet</span>
      </div>
      <ol class="leaderboard-list" id="leaderboard-list" aria-label="All-time top scores"></ol>
      <p class="leaderboard-status submission-status" id="submission-status" role="status" aria-live="polite" hidden></p>
      <div class="profile-state" id="profile-loading">
        <span>INSTALLATION PROFILE</span>
        <p>Loading permanent leaderboard identity… Local play is ready.</p>
      </div>
      <form class="nickname-form" id="nickname-form" hidden>
        <label for="nickname-input">CHOOSE DISPLAY NAME <span>ONE TIME · DUPLICATES ALLOWED</span></label>
        <div class="nickname-row">
          <input id="nickname-input" name="nickname" type="text" maxlength="${MAX_NICKNAME_LENGTH}" autocomplete="off" placeholder="Permanent public name" aria-describedby="nickname-status">
          <button class="secondary-button" id="nickname-save" type="submit">LOCK NAME</button>
        </div>
        <p id="nickname-status">Once locked, this name cannot be renamed or removed from this Codex installation. You can keep playing unnamed.</p>
      </form>
      <div class="profile-state profile-locked" id="profile-locked" hidden>
        <span>DISPLAY NAME · LOCKED</span>
        <strong id="profile-display-name"></strong>
        <p>This permanent installation name cannot be renamed or removed.</p>
      </div>
      <div class="profile-state" id="profile-unavailable" hidden>
        <span>PERMANENT PROFILE UNAVAILABLE</span>
        <p>Codex cannot reach installation profile storage. Local gameplay still works.</p>
      </div>
    </section>
    <footer class="footer">
      <span><i class="live-dot"></i><b>SPACE / ↑ / W / TAP</b> TO JUMP</span>
      <span>LOCAL GAMEPLAY · NO TOKENS SPENT</span>
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
const overlayNetworkStatus = document.querySelector<HTMLParagraphElement>("#overlay-network-status")!;
const playButton = document.querySelector<HTMLButtonElement>("#play-button")!;
const leaderboardButton = document.querySelector<HTMLButtonElement>("#leaderboard-button")!;
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const displayModeStatus = document.querySelector<HTMLParagraphElement>("#display-mode-status")!;
const scoreElement = document.querySelector<HTMLElement>("#run-score")!;
const bestElement = document.querySelector<HTMLElement>("#best-score")!;
const leaderboardPanel = document.querySelector<HTMLElement>("#leaderboard-panel")!;
const leaderboardRefresh = document.querySelector<HTMLButtonElement>("#leaderboard-refresh")!;
const leaderboardStatus = document.querySelector<HTMLParagraphElement>("#leaderboard-status")!;
const leaderboardStats = document.querySelector<HTMLElement>("#leaderboard-stats")!;
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
let game = createGameState();
let lastFrame = performance.now();
let highScore = readNumber(HIGH_SCORE_KEY, window.openai?.widgetState?.highScore ?? 0);
let soundEnabled = readPreference(SOUND_KEY) !== "off";
let audioContext: AudioContext | undefined;
let runTime = 0;
let displayModeStatusTimer: number | undefined;
let pipUnavailable = false;
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
  submissionMessage = "Shared score unavailable. Local play is unaffected.";
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
    overlayNetworkStatus.hidden = true;
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
    overlayNetworkStatus.hidden = true;
    playButton.innerHTML = `START SESSION <span aria-hidden="true">↵</span>`;
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
  leaderboardButton.setAttribute("aria-label", open ? "Close shared leaderboard" : "Open shared leaderboard");
  window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
}

function renderLeaderboard(): void {
  leaderboardRefresh.disabled = leaderboardPhase === "loading" || !leaderboardClient;
  leaderboardList.replaceChildren();

  if (leaderboardPhase === "loading") {
    leaderboardStatus.textContent = "Loading shared scores…";
  } else if (leaderboardPhase === "unavailable") {
    leaderboardStatus.textContent = leaderboardConfigured
      ? "Shared scores are unavailable. Local play is unaffected."
      : "Shared scores await the production Worker endpoint. Local play is ready.";
  } else if (leaderboardPhase === "empty") {
    leaderboardStatus.textContent = "No named scores yet. Be the first.";
  } else {
    leaderboardStatus.textContent = "All-time top 20 · earliest score wins a tie";
  }

  if (leaderboardData) {
    leaderboardStats.textContent = `${formatCount(leaderboardData.stats.completedRuns)} completed runs · ${formatCount(leaderboardData.stats.approximatePlayers)} players`;
    for (const entry of leaderboardData.entries) {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const name = document.createElement("strong");
      const score = document.createElement("span");
      rank.textContent = `#${entry.rank}`;
      name.textContent = entry.nickname;
      score.textContent = formatScore(entry.score);
      item.title = `Achieved ${new Date(entry.achievedAt).toLocaleString()}`;
      item.append(rank, name, score);
      leaderboardList.append(item);
    }
  } else {
    leaderboardStats.textContent = "— completed runs";
  }

  const best = leaderboardResultState.bestScore;
  const rank = leaderboardResultState.rank;
  leaderboardPersonal.textContent =
    best === null
      ? "No shared result yet"
      : rank === null
        ? `Your shared best ${formatScore(best)} · add a name to rank`
        : `Your shared best ${formatScore(best)} · last known rank #${rank}`;

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
      "Once locked, this name cannot be renamed or removed from this Codex installation. You can keep playing unnamed.";
  }
  window.openai?.notifyIntrinsicHeight?.(document.documentElement.scrollHeight);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
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
      ? "Permanent profile unavailable; score stayed local."
      : "Shared score unavailable in this build.";
    submissionMessage = reason;
    setOverlaySubmissionStatus(reason, runId);
    renderLeaderboard();
    return;
  }

  submissionMessage = "Submitting this run in the background…";
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
      ? `Run counted. The public board already has this player ID locked as ${result.nickname}; the local permanent profile could not be synchronized.`
      : result.rank === null
        ? "Run counted. Add a display name to join the public board."
        : `Run counted · rank #${result.rank}${result.personalBest ? " · new shared best" : ""}`;
    setOverlaySubmissionStatus(submissionMessage, runId);
    renderLeaderboard();
    if (result.personalBest) await refreshLeaderboard(true);
  } catch {
    submissionMessage = "Shared score unavailable. Local play is unaffected.";
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
  }
  if (jump(game)) playJumpSound();
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
    profileMessage = "Permanent profile storage is unavailable; gameplay still works.";
    renderLeaderboard();
    return;
  }

  const nickname = normalizeNickname(nicknameInput.value);
  if (!nickname) {
    profileMessage = `Choose a non-empty name using ${MAX_NICKNAME_LENGTH} characters or fewer without control characters.`;
    renderLeaderboard();
    return;
  }

  profileLocking = true;
  profileMessage = "Locking this permanent display name…";
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
    submissionMessage = `Display name ${profile.nickname ?? ""} is locked permanently for this Codex installation.`;
  } catch {
    profileLocking = false;
    profileMessage = "Codex could not lock the name. Nothing changed, and local play is unaffected.";
  }
  renderLeaderboard();
});

stage.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button")) return;
  event.preventDefault();
  primaryAction();
});

window.addEventListener("keydown", (event) => {
  if (!["Space", "ArrowUp", "KeyW"].includes(event.code) || event.repeat) return;
  if ((event.target as HTMLElement | null)?.closest("button, input, form")) return;
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
      runReporter.report(activeRunId, {
        score: game.score,
        durationMs: Math.max(1, Math.round(runTime * 1_000)),
      });
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

refreshHud();
updateOverlay();
renderLeaderboard();
profileInitializationPromise = initializePermanentProfile();
void refreshLeaderboard();
requestAnimationFrame(frame);
