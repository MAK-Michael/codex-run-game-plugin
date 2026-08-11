# Codex Run

Codex Run is an endless runner for the Codex desktop app. The game opens in a Codex chat as an MCP app.

> **Unofficial project:** Codex Run is an independent project. It is not affiliated with, endorsed by, or sponsored by OpenAI or any other company. All product names and trademarks belong to their respective owners.

Guide the Codex knot past AI rivals and broken developer tools. Gameplay runs on your computer and does not make model calls. The optional shared leaderboard uses a small network request after a completed run.

![Codex Run ready state](./plugins/codex-run/assets/screenshot-1.png)

## Play the game

- Press **Space**, **W**, or **Up Arrow** to jump. You can also select the game area.
- After a collision, use the same control to start a new run.
- Jump over Claude, Gemini, Kimi, and developer hazards.
- Stay low when a Grok mark is above the track.
- Select the speaker control to turn sound on or off.
- Select the pop-out control to request picture-in-picture mode. If Codex does not accept the request, the game stays in the chat.
- Select the chart control to view or refresh the shared all-time top 20. You can play immediately without a name. If you later join the public board, the first valid display name you lock is permanent for this local Codex installation. Different players may use the same name.

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

The repository contains the built plugin files. You do not need to run `pnpm install` or build the plugin.

## Build from source

You need Node.js 20 or later.

```bash
cd plugins/codex-run
pnpm install
pnpm run verify
```

The `verify` command does these tasks:

1. Checks the TypeScript code.
2. Runs the tests.
3. Builds the UI and the MCP server.

The build command puts the files in `plugins/codex-run/dist/`.

The leaderboard Worker has an independent package and lockfile:

```bash
cd services/leaderboard
pnpm install
pnpm run verify
```

That command uses a local D1 test database and a dry-run Worker build. Cloudflare deployment is manual.

To start the local UI development server, run:

```bash
cd plugins/codex-run
pnpm run dev
```

To build the locally installed plugin against the deployed development leaderboard:

```bash
cd plugins/codex-run
pnpm run build:dev
```

Restart Codex after the build so the MCP server and embedded UI reload together. Before committing or releasing, run `pnpm run verify`; it restores and verifies the production-only build.

## Install from a local copy

1. If you changed the source, run `pnpm run build` in `plugins/codex-run`.
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

Codex Run does not need an account, login, email address, or API key. Local gameplay, controls, sound, and high-score persistence do not make model calls or spend tokens.

When the shared leaderboard is enabled, each valid completed run sends these fields to the public leaderboard service in the background:

- Installation-scoped player UUID generated and stored on your computer
- Permanent display name, after you choose and lock one
- Score
- Simulated run duration
- Game rules version

Runs without a display name count toward approximate play statistics but do not appear publicly. The leaderboard keeps the first non-empty name submitted for a player UUID and ignores later attempts to rename or clear it. Display names are not unique. Failed or offline submissions are not queued, so completed-run and player counts are approximate. Starting or retrying a run never waits for the network, and profile or leaderboard failures never block local gameplay.

The leaderboard application database stores anonymous players and completed runs. It does not intentionally store email addresses or IP addresses. Cloudflare still processes normal request metadata as the infrastructure provider.

The MCP server stores the versioned leaderboard profile and automatic-start setting outside the plugin installation directory at `$CODEX_HOME/codex-run/preferences.json` (by default `~/.codex/codex-run/preferences.json`):

- Setting for automatic start
- Installation-scoped leaderboard player UUID
- Locked leaderboard display name, or `null` until you choose one

Every preference update preserves the other fields in this file. Because it lives under `CODEX_HOME`, the identity survives plugin reinstalls and normal Codex updates or reinstalls when that directory is preserved. There is no account recovery or cross-device identity claim: a new machine, a different OS user, a different `CODEX_HOME`, or deletion of `~/.codex` can create a new identity and allow a new name choice.

The embedded game may also cache these non-authoritative settings in its iframe storage:

- High score
- Sound setting
- Last known shared rank and best score

During the first upgrade only, if no server profile exists, the MCP server makes a best-effort attempt to adopt a valid legacy iframe player UUID and display name. After the server profile exists, iframe storage and later run submissions cannot replace it.

## Project layout

```text
.
├── plugins/codex-run/
│   ├── .codex-plugin/plugin.json   # Plugin information
│   ├── .mcp.json                   # MCP server settings
│   ├── hooks/                      # Hook for automatic start
│   ├── skills/                     # Instructions for automatic start
│   ├── src/game/                   # Game rules and collision code
│   ├── src/ui/                     # UI, controls, sound, and MCP app bridge
│   ├── src/server/                 # MCP tools and UI resource
│   └── dist/                       # Built server and UI
└── services/leaderboard/
    ├── migrations/                 # Versioned D1 schema
    ├── src/                        # Worker API and validation
    └── tests/                      # Local Worker and D1 integration tests
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
- Installation-profile migration, merge-safe preference writes, and first-name locking
- One background submission per completed run
- Worker payload, rate, score-duration, ranking, privacy, and CORS behavior

## License

The source code uses the [MIT License](./LICENSE).

Codex Run is not affiliated with, endorsed by, or sponsored by OpenAI or any other company. Product names and trademarks belong to their respective owners.
