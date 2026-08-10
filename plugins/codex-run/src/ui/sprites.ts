const CELL_SIZE = 64;

export type SpriteName =
  | "codex-idle"
  | "codex-run-a"
  | "codex-run-b"
  | "codex-jump"
  | "codex-fall"
  | "codex-crash"
  | "claude-a"
  | "claude-b"
  | "gemini-a"
  | "gemini-b"
  | "grok-a"
  | "grok-b"
  | "kimi-a"
  | "kimi-b"
  | "code"
  | "braces"
  | "terminal"
  | "dust"
  | "crash-burst";

const CELLS: Record<SpriteName, readonly [column: number, row: number]> = {
  "codex-idle": [0, 0],
  "codex-run-a": [1, 0],
  "codex-run-b": [2, 0],
  "codex-jump": [3, 0],
  "codex-fall": [4, 0],
  "codex-crash": [5, 0],
  "claude-a": [0, 1],
  "claude-b": [1, 1],
  "gemini-a": [2, 1],
  "gemini-b": [3, 1],
  "grok-a": [4, 1],
  "grok-b": [5, 1],
  "kimi-a": [6, 1],
  "kimi-b": [7, 1],
  code: [1, 2],
  braces: [2, 2],
  terminal: [3, 2],
  dust: [4, 2],
  "crash-burst": [5, 2],
};

export class SpriteAtlas {
  readonly image = new Image();

  constructor(url: string) {
    this.image.decoding = "async";
    this.image.src = url;
  }

  get ready(): boolean {
    return this.image.complete && this.image.naturalWidth > 0;
  }

  draw(
    context: CanvasRenderingContext2D,
    name: SpriteName,
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean {
    if (!this.ready) return false;
    const [column, row] = CELLS[name];
    context.drawImage(
      this.image,
      column * CELL_SIZE,
      row * CELL_SIZE,
      CELL_SIZE,
      CELL_SIZE,
      Math.round(x),
      Math.round(y),
      Math.round(width),
      Math.round(height),
    );
    return true;
  }
}

export const spriteAtlas = new SpriteAtlas(new URL("../../assets/game-sprites.png", import.meta.url).href);
