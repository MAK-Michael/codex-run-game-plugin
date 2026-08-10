# Codex Run

Codex Run is an endless runner for the Codex desktop app. The game opens in a Codex chat as an MCP app.

Guide the Codex knot past AI rivals and broken developer tools. The game runs on your computer. It does not use the network or make model calls during play.

![Codex Run ready state](./plugins/codex-run/assets/screenshot-1.png)

## Play the game

- Press **Space**, **W**, or **Up Arrow** to jump. You can also select the game area.
- After a collision, use the same control to start a new run.
- Jump over Claude, Gemini, Kimi, and developer hazards.
- Stay low when a Grok mark is above the track.
- Select the speaker control to turn sound on or off.
- Select the pop-out control to request picture-in-picture mode. If Codex does not accept the request, the game stays in the chat.

## Automatic start

Codex Run can open when you give Codex a complex task. The plugin adds this instruction at the start of each task. Codex then decides if the task needs much work, research, or verification.

Automatic start is on by default. Use one of these requests to change the setting:

- **Disable Codex Run auto-start**
- **Enable Codex Run auto-start**

Use **Start Codex Run** to open the game at any time.

After installation, Codex asks you to review the command hook. You must approve the hook before automatic start can work.

## Install from GitHub

You need the Codex desktop app and Node.js 20 or later.

1. Run this command:

   ```bash
   codex plugin marketplace add MAK-Michael/codex-run-game-plugin --ref main
   ```

2. Restart Codex.
3. Open the Plugins Directory.
4. Select **Codex Run**.
5. Install the plugin.
6. Enable the plugin.
7. Read the command hook request.
8. Approve the hook if you trust it.
9. Start a new task and ask **Start Codex Run**.

The repository contains the built plugin files. You do not need to run `npm install` or build the plugin.

## Build from source

You need Node.js 20 or later.

```bash
cd plugins/codex-run
npm install
npm run verify
```

The `verify` command does these tasks:

1. Checks the TypeScript code.
2. Runs the tests.
3. Builds the UI and the MCP server.

The build command puts the files in `plugins/codex-run/dist/`.

To start the local UI development server, run:

```bash
cd plugins/codex-run
npm run dev
```

## Install from a local copy

1. If you changed the source, run `npm run build` in `plugins/codex-run`.
2. Open this repository as a Codex project.
3. Restart Codex.
4. Open the Plugins Directory.
5. Select **Codex Run**.
6. Install the plugin.
7. Enable the plugin.
8. Read the command hook request.
9. Approve the hook if you trust it.

The plugin starts `node ./dist/server/index.js` from the plugin directory.

## Data and network use

Codex Run does not need an account, an API key, or a backend. It does not send network requests or analytics data.

The plugin stores these settings on your computer:

- High score
- Sound setting
- Setting for automatic start

## Project layout

```text
plugins/codex-run/
├── .codex-plugin/plugin.json   # Plugin information
├── .mcp.json                   # MCP server settings
├── hooks/                      # Hook for automatic start
├── skills/                     # Instructions for automatic start
├── src/game/                   # Game rules and collision code
├── src/ui/                     # UI, controls, sound, and MCP app bridge
├── src/server/                 # MCP tools and UI resource
└── dist/                       # Built server and UI
```

The `start_codex_run` MCP tool opens `ui://codex-run/game-v1.html`. The UI uses the MCP app content type. It requests picture-in-picture mode only if the host has this feature.

## Tests

The tests check these functions:

- One jump before each landing
- Stable speed and scoring at different frame rates
- Collision and game-over rules
- Clean restart behavior
- MCP tool and UI resource contract
- Sprite colors and player frames
- Picture-in-picture confirmation
- Setting for automatic start

## License

The source code uses the [MIT License](./LICENSE).

Codex Run is an independent project. OpenAI and the other companies in the game do not endorse it. Product names and trademarks belong to their owners.
