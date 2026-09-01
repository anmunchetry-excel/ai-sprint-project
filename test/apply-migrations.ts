// Applies this project's D1 migrations to the local test database before tests run.
// Runs outside per-test-file storage isolation and may run more than once;
// applyD1Migrations() only applies migrations that have not already been applied,
// so repeat calls are safe.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
