import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
		},
	},
	plugins: [
		cloudflareTest(async () => {
			const migrationsPath = path.join(import.meta.dirname, "migrations");
			const migrations = await readD1Migrations(migrationsPath);

			return {
				miniflare: {
					compatibilityDate: "2026-07-01",
					compatibilityFlags: ["nodejs_compat"],
					d1Databases: { DB: "ai-sprint-project-test-db" },
					bindings: { TEST_MIGRATIONS: migrations },
				},
			};
		}),
	],
	test: {
		include: ["test/**/*.test.ts", "src/lib/services/**/*.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
