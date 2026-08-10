# Codex Run: GitHub Leaderboard Private-Beta Plan

## Goal

Make Codex Run shareable with friends through a GitHub-backed Codex plugin marketplace, with a shared online high-score leaderboard.

This plan stops at the GitHub friends/private-beta release. It does not include submission to the public ChatGPT and Codex plugin directory.

## Agreed direction

| Area | Choice |
| --- | --- |
| Score backend | Cloudflare Worker and D1 |
| GitHub repository | Public `MAK-Michael/codex-run-game-plugin` |
| Installation | GitHub-backed Codex plugin marketplace |
| Packaging | Commit compiled `dist/`; keep `node_modules/` ignored |
| Leaderboard | All-time top 20, with one best score per player |
| Player identity | Nickname and anonymous local player ID; no login |
| Cheat protection | Plausibility checks and rate limiting; not tournament-grade verification |
| Deployment | Manual Cloudflare deployment initially |
| Public plugin directory | Out of scope |

## Target architecture

```text
Codex desktop app
  -> installed Codex Run plugin from GitHub
  -> local bundled MCP server
  -> embedded game UI
       -> GET /v1/leaderboard
       -> POST /v1/scores
            -> Cloudflare Worker
            -> D1 database
```

Gameplay, rendering, input, and scoring continue to run locally. The network is used only to retrieve and submit leaderboard data. No OpenAI API calls or tokens are required during gameplay.

## Phase 1: Preserve the current game

1. Treat the current offline game as the baseline.
2. Review the untracked repository contents before staging anything.
3. Create a focused baseline commit containing the existing source, tests, assets, documentation, marketplace definition, and license.
4. Do not include `node_modules/`, local secrets, logs, or machine-specific files.

### Acceptance criteria

- The baseline commit reproduces the current offline game.
- `npm run verify` passes from `plugins/sunskip`.
- The baseline contains no leaderboard behavior or network access.

## Phase 2: Make the plugin distributable from GitHub

The current MCP configuration launches `node ./dist/server/index.js`, so a clean marketplace installation needs the built files to be present.

1. Update `.gitignore` to allow `plugins/sunskip/dist/` while continuing to ignore all `node_modules/` directories.
2. Commit the production UI and bundled MCP server under `plugins/sunskip/dist/`.
3. Rename the marketplace identifier from the generic `personal` name to `codex-run` and give it a clear display name.
4. Confirm that the installed plugin can launch from a clean clone without running `npm install`.
5. Add GitHub Actions CI that:
   - Installs dependencies with `npm ci`.
   - Runs `npm run verify`.
   - Rebuilds the plugin.
   - Fails when committed `dist/` differs from the verified build.

### Acceptance criteria

- A clean clone contains everything needed to start the bundled MCP server.
- `node_modules/` is not tracked.
- The marketplace entry is unambiguous and discoverable.
- CI catches stale build artifacts.

## Phase 3: Add the Cloudflare leaderboard service

### Endpoints

#### `GET /v1/leaderboard`

Returns the top 20 all-time scores, ordered by score descending. Equal scores use the earliest achievement time as the tie-breaker.

Example response:

```json
{
  "entries": [
    {
      "rank": 1,
      "displayName": "MAK",
      "score": 1842,
      "achievedAt": "2026-08-10T12:00:00.000Z"
    }
  ]
}
```

#### `POST /v1/scores`

Accepts a player's completed run and returns their accepted best score and current rank.

Example request:

```json
{
  "playerId": "anonymous-local-id",
  "displayName": "MAK",
  "score": 1842,
  "durationMs": 42100,
  "gameVersion": "0.1.0"
}
```

Example response:

```json
{
  "accepted": true,
  "bestScore": 1842,
  "rank": 4
}
```

### D1 data model

#### `players`

- `id`: anonymous stable player ID
- `display_name`: public nickname
- `created_at`
- `updated_at`

#### `scores`

- `id`
- `player_id`
- `score`
- `duration_ms`
- `game_version`
- `created_at`

The public leaderboard should expose only the display name, score, rank, and achievement time.

### Validation and abuse controls

- Require a short normalized nickname.
- Require a non-negative integer score within a plausible configured range.
- Require a plausible relationship between score and run duration.
- Reject unsupported game versions when leaderboard rules change.
- Limit request body size.
- Rate-limit by anonymous player ID and transient request signals.
- Preserve only the player's best accepted score for ranking purposes.
- Never place a privileged database or Cloudflare credential in the client.
- Do not intentionally store email addresses or IP addresses.

This casual validation discourages accidental or basic abuse, but it cannot make a client-computed score cheat-proof. A later competitive version could issue seeded runs and replay the submitted jump timeline on the server.

### Acceptance criteria

- Valid scores are stored and ranked correctly.
- A lower repeat score does not replace a player's best score.
- Invalid names, values, versions, and request bodies are rejected.
- Leaderboard reads return stable ordering and at most 20 entries.
- API and database tests pass locally before deployment.

## Phase 4: Integrate the leaderboard into the game

1. Ask for a nickname on first use.
2. Generate an anonymous player ID and save it locally.
3. Preserve the nickname and player ID across sessions when storage is available.
4. Load the top 20 leaderboard when the game opens.
5. Submit a score only after a completed run beats the locally known personal best.
6. Show the accepted rank after submission.
7. Add an in-game leaderboard view that does not obstruct active gameplay.
8. Preserve the current local high score.
9. Keep gameplay available when the leaderboard service is offline or slow.
10. Allow the exact production Worker origin in the MCP App `connectDomains` policy.
11. Update the `NO NETWORK` footer because leaderboard traffic makes that statement inaccurate; retain `NO TOKENS SPENT`.

### Network behavior

- Leaderboard requests must use short timeouts.
- A failed read shows a quiet unavailable state without blocking play.
- A failed submission reports that the score remains local rather than claiming it was ranked.
- The client must not retry writes indefinitely.
- No secret is bundled into the single-file UI.

### Acceptance criteria

- The leaderboard loads and renders correctly.
- A completed personal-best run is submitted once.
- The returned rank is visible to the player.
- Offline gameplay behaves like the current game.
- The existing jump, collision, scoring, restart, sound, and picture-in-picture behavior remains intact.

## Phase 5: Verification

### Automated verification

- Run `npm run verify` from `plugins/sunskip`.
- Run the Worker and D1 test suite.
- Test leaderboard ordering and tie-breaking.
- Test one-best-score-per-player behavior.
- Test malformed requests, unsupported versions, rate limits, and sanitization.
- Test the leaderboard client with successful, empty, rejected, timed-out, and unavailable responses.
- Rebuild `dist/` and confirm that the committed output is current.

### Clean-install verification

1. Clone the repository into a fresh temporary directory.
2. Confirm that `node_modules/` is absent.
3. Add the cloned repository as a Codex marketplace source.
4. Install Codex Run from the Plugins Directory.
5. Start a new task and ask `Start Codex Run.`
6. Play and submit a score.
7. Open a separate clean installation and confirm that it sees the same score.
8. Disable network access and confirm that gameplay remains usable.

### Security and repository checks

- No Cloudflare token, API secret, `.dev.vars`, or local credential is tracked.
- The client contains only the public leaderboard endpoint.
- Public nickname input is escaped and constrained before rendering.
- Generated build artifacts contain no development configuration or source-map secrets.

## Phase 6: GitHub release

1. Review the complete diff and verification evidence.
2. Create the public repository `MAK-Michael/codex-run` only after explicit approval.
3. Add the verified repository as the `origin` remote.
4. Push the focused commits to `main`.
5. Confirm GitHub Actions passes on the pushed revision.
6. Add a concise repository description, relevant topics, and the existing MIT license.
7. Update the README with the friends-installation flow.

Proposed installation command:

```bash
codex plugin marketplace add MAK-Michael/codex-run-game-plugin --ref main
```

After adding the marketplace, the player should:

1. Restart the ChatGPT desktop app.
2. Open the Plugins Directory.
3. Select the Codex Run marketplace.
4. Install and enable Codex Run.
5. Start a new task and ask `Start Codex Run.`

### Final acceptance criteria

- A person with Codex and Node.js 20 or newer can install the plugin from GitHub using the documented flow.
- The game starts from a clean marketplace installation.
- Scores submitted from separate installations appear on the same leaderboard.
- Offline or failed leaderboard requests do not prevent play.
- GitHub Actions is green for the released revision.
- The repository exposes no deployment credentials.

## Explicitly out of scope

- Real-time multiplayer.
- Player accounts, email login, OAuth, or password recovery.
- Prizes or tournament-grade cheat prevention.
- A separate public website.
- Public ChatGPT and Codex plugin-directory submission.
- Deploying the MCP server as a public Streamable HTTP service.
- Automatic Cloudflare deployment from GitHub Actions.
- Social features, comments, friends lists, or direct challenges.

## Approval gates

No external resource should be created without approval at the relevant gate:

1. Approve the implementation plan and default product decisions.
2. Approve creation of the Cloudflare Worker and D1 database.
3. Approve the production deployment after local verification.
4. Approve creation of the public GitHub repository.
5. Approve the final push after clean-install acceptance passes.
