export type DisplayMode = "inline" | "pip" | "fullscreen";

export type DisplayModeHost = {
  displayMode?: DisplayMode;
  requestDisplayMode?: (options: { mode: DisplayMode }) => Promise<unknown>;
};

export type DisplayModeRequestResult =
  | { status: "entered"; mode: DisplayMode }
  | { status: "unsupported" }
  | { status: "rejected"; error: string }
  | { status: "unconfirmed"; actualMode?: DisplayMode };

type ConfirmDisplayMode = (target: DisplayMode) => Promise<DisplayMode | undefined>;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "The host rejected the display-mode request.");
}

export async function requestHostDisplayMode(
  host: DisplayModeHost | undefined,
  target: DisplayMode,
  confirmDisplayMode: ConfirmDisplayMode,
): Promise<DisplayModeRequestResult> {
  if (!host || typeof host.requestDisplayMode !== "function") return { status: "unsupported" };
  const request = host.requestDisplayMode;

  try {
    await request.call(host, { mode: target });
  } catch (error) {
    return { status: "rejected", error: describeError(error) };
  }

  if (host.displayMode === target) return { status: "entered", mode: target };

  const confirmedMode = await confirmDisplayMode(target);
  if (confirmedMode === target) return { status: "entered", mode: target };
  return { status: "unconfirmed", actualMode: confirmedMode ?? host.displayMode };
}
