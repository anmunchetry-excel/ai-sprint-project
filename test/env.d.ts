// Augments the Cloudflare.Env type (declared in the generated cloudflare-env.d.ts)
// with bindings that exist only inside the Workers-pool test runtime, not in the
// real app. Picked up by tsconfig.vitest.json only, so it never affects the app build.
import type { D1Migration } from "cloudflare:test";

declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}

export {};
