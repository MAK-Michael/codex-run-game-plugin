import { readFile } from "node:fs/promises";

const environment = process.argv[2];
const supportedEnvironments = new Set(["dev", "prod"]);

if (!supportedEnvironments.has(environment)) {
  console.error("Usage: node scripts/check-deployment-config.mjs <dev|prod>");
  process.exit(1);
}

const configUrl = new URL("../wrangler.jsonc", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));
const environmentConfig = config.env?.[environment];
const database = environmentConfig?.d1_databases?.find(
  (candidate) => candidate.binding === "DB",
);
const expectedDatabaseName = `codex-run-leaderboard-${environment}`;
const placeholderDatabaseId = "00000000-0000-0000-0000-000000000000";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (config.workers_dev !== false) {
  console.error("Top-level workers_dev must stay false to prevent an unintended root deployment.");
  process.exit(1);
}

if (!environmentConfig) {
  console.error(`Missing env.${environment} in wrangler.jsonc.`);
  process.exit(1);
}

if (environmentConfig.workers_dev !== true) {
  console.error(`env.${environment}.workers_dev must be true.`);
  process.exit(1);
}

if (!database || database.database_name !== expectedDatabaseName) {
  console.error(
    `env.${environment} must bind DB to ${expectedDatabaseName}.`,
  );
  process.exit(1);
}

if (
  database.database_id === placeholderDatabaseId ||
  !uuidPattern.test(database.database_id)
) {
  console.error(
    `env.${environment}.d1_databases[0].database_id is still a placeholder. ` +
      `Run pnpm run db:create:${environment} or paste the D1 database ID into wrangler.jsonc.`,
  );
  process.exit(1);
}

console.log(
  `Deployment configuration for ${environment} is ready (${database.database_name}).`,
);
