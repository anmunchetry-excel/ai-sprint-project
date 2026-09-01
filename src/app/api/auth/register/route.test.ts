import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { POST } from "./route";

let counter = 0;

function createRegisterBody(
	overrides: Partial<{
		email: string;
		username: string;
		firstName: string;
		lastName: string;
		password: string;
	}> = {}
) {
	counter += 1;

	return {
		email: `teacher-${counter}@example.com`,
		username: `user${counter}`,
		firstName: "Ada",
		lastName: "Lovelace",
		password: "at-least-8-characters",
		...overrides,
	};
}

function jsonRequest(body: unknown): Request {
	return new Request("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
});

describe("POST /api/auth/register", () => {
	it("returns 201 and the public user on valid input", async () => {
		const body = createRegisterBody();
		const response = await POST(jsonRequest(body));

		expect(response.status).toBe(201);
		const json = (await response.json()) as { user: Record<string, unknown> };
		expect(json.user).toMatchObject({
			email: body.email,
			username: body.username,
			firstName: "Ada",
			lastName: "Lovelace",
		});
		expect(json.user).toHaveProperty("id");
		expect(json.user).toHaveProperty("createdAt");
		expect(json.user).not.toHaveProperty("password");
		expect(json.user).not.toHaveProperty("password_hash");
	});

	it("returns 400 on invalid email", async () => {
		const response = await POST(jsonRequest(createRegisterBody({ email: "not-an-email" })));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: { issues: unknown[] } };
		expect(json.error.issues).toBeDefined();
	});

	it("returns 400 on invalid username format", async () => {
		const response = await POST(jsonRequest(createRegisterBody({ username: "bad username!" })));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: { issues: unknown[] } };
		expect(json.error.issues).toBeDefined();
	});

	it("returns 400 when password is under 8 characters", async () => {
		const response = await POST(jsonRequest(createRegisterBody({ password: "short" })));

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: { issues: unknown[] } };
		expect(json.error.issues).toBeDefined();
	});

	it("returns 409 on a duplicate email", async () => {
		const body = createRegisterBody();
		await POST(jsonRequest(body));

		const response = await POST(jsonRequest({ ...body, username: "other-user" }));

		expect(response.status).toBe(409);
		const json = (await response.json()) as { error: { message: string; field: string } };
		expect(json.error).toEqual({ message: "Email already registered", field: "email" });
	});

	it("returns 409 on a duplicate username", async () => {
		const body = createRegisterBody();
		await POST(jsonRequest(body));

		const response = await POST(jsonRequest({ ...body, email: "other@example.com" }));

		expect(response.status).toBe(409);
		const json = (await response.json()) as { error: { message: string; field: string } };
		expect(json.error).toEqual({ message: "Username already registered", field: "username" });
	});
});
