# Codex Run leaderboard service

This directory contains the open-source Cloudflare Worker and D1 schema for the casual Codex Run shared leaderboard. It exposes only:

- `GET /v1/leaderboard`
- `POST /v1/runs`

The API accepts anonymous completed-run submissions, keeps every valid run for approximate counts, and publishes one best score per named player. It is an obvious-abuse filter, not proof that a human played.

## Local verification

```bash
pnpm install
pnpm run verify
```

The verification command type-checks the Worker, runs the Worker/D1 integration tests against an isolated local database, and creates a local dry-run deployment bundle. It does not create or change Cloudflare resources.

To run the Worker with a local D1 database:

```bash
pnpm run db:migrate:local
pnpm run dev
```

## Manual dev and production deployment

The top-level D1 binding in `wrangler.jsonc` is only for local development. Remote development and production use separate Wrangler environments, Workers, and D1 databases:

| Environment | Worker | D1 database |
| --- | --- | --- |
| Local | Local Wrangler process | `codex-run-leaderboard-local` |
| Dev | `codex-run-leaderboard-dev` | `codex-run-leaderboard-dev` |
| Prod | `codex-run-leaderboard-prod` | `codex-run-leaderboard-prod` |

First authenticate Wrangler and create each database. These commands change Cloudflare account resources and require the repository owner's approval:

```bash
pnpm exec wrangler login
pnpm run db:create:dev
pnpm run db:create:prod
```

The create scripts ask Wrangler to write each returned D1 UUID into the matching environment in `wrangler.jsonc`. Review that diff before continuing. If the config is not updated automatically, paste the returned IDs over the all-zero placeholders.

Apply migrations and deploy development first:

```bash
pnpm run db:migrate:dev
pnpm run deploy:dev
pnpm run smoke -- https://codex-run-leaderboard-dev.<account-subdomain>.workers.dev
```

After testing the development Worker, deploy production explicitly:

```bash
pnpm run db:migrate:prod
pnpm run deploy:prod
pnpm run smoke -- https://codex-run-leaderboard-prod.<account-subdomain>.workers.dev
```

The migration and deployment scripts fail while the selected D1 ID is still a placeholder. There is intentionally no unqualified remote deployment script; always select `dev` or `prod`. The read-only smoke script checks the leaderboard response and CORS preflight without inserting a run.

Wrangler names the deployed Workers from the base name and environment, so their default origins are:

- `https://codex-run-leaderboard-dev.<account-subdomain>.workers.dev`
- `https://codex-run-leaderboard-prod.<account-subdomain>.workers.dev`

The plugin build profiles contain the exact deployed origins. Use `pnpm run build:dev` for a local plugin connected only to dev. Use `pnpm run verify` before committing or releasing so the committed plugin output contains only the production origin and production-only `connectDomains` value.

No Cloudflare credential belongs in this repository or in the plugin. GitHub Actions verifies the source but does not deploy it.
