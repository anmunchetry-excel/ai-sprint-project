import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { POST as registerPost } from "../register/route";
import { POST } from "./route";

let counter = 0;

function createCredentials() {
	counter += 1;

	return {
		email: `login-${counter}@example.com`,
		username: `loginuser${counter}`,
		firstName: "Ada",
		lastName: "Lovelace",
		password: "at-least-8-characters",
	};
}

function jsonRequest(body: unknown): Request {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
});

describe("POST /api/auth/login", () => {
	it("returns 200 and the public user on correct credentials", async () => {
		const credentials = createCredentials();
		await registerPost(
			new Request("http://localhost/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			})
		);

		const response = await POST(
			jsonRequest({ email: credentials.email, password: credentials.password })
		);

		expect(response.status).toBe(200);
		const json = (await response.json()) as { user: Record<string, unknown> };
		expect(json.user).toMatchObject({
			email: credentials.email,
			username: credentials.username,
			firstName: "Ada",
			lastName: "Lovelace",
		});
		expect(json.user).not.toHaveProperty("password_hash");
	});

	it("returns 401 on a wrong password", async () => {
		const credentials = createCredentials();
		await registerPost(
			new Request("http://localhost/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			})
		);

		const response = await POST(
			jsonRequest({ email: credentials.email, password: "wrong-password" })
		);

		expect(response.status).toBe(401);
		const json = (await response.json()) as { error: { message: string } };
		expect(json.error.message).toBe("Invalid email or password");
	});

	it("returns 401 on an unknown email", async () => {
		const response = await POST(
			jsonRequest({ email: "nobody@example.com", password: "at-least-8-characters" })
		);

		expect(response.status).toBe(401);
		const json = (await response.json()) as { error: { message: string } };
		expect(json.error.message).toBe("Invalid email or password");
	});

	it("returns 400 on missing fields", async () => {
		const response = await POST(jsonRequest({}));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: { issues: unknown[] } };
		expect(json.error.issues).toBeDefined();
	});
});
