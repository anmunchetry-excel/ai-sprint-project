import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
	it('returns 200 and { "success": true } on any call', async () => {
		const response = await POST();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
	});
});
