import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createMcq } from "@/lib/services/mcq-service";
import { POST } from "./route";

async function createTestUser(): Promise<string> {
	const suffix = crypto.randomUUID();
	const email = `attempt-route-${suffix}@example.com`;

	await env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(
			email,
			`attempt-route-${suffix}`,
			"Attempt",
			"Tester",
			"pbkdf2$100000$deadbeef$deadbeef"
		)
		.run();

	const result = await env.DB.prepare("SELECT id FROM users WHERE email = ?1")
		.bind(email)
		.all<{ id: string }>();

	return result.results[0].id;
}

async function createQuestion(userId: string, name = "Photosynthesis basics") {
	return createMcq(env.DB, {
		name,
		question: "Which gas do plants absorb?",
		userId,
		choices: [
			{ text: "Carbon dioxide", isCorrect: true },
			{ text: "Oxygen", isCorrect: false },
		],
	});
}

function request(mcqId: string, body: unknown): Request {
	return new Request(`http://localhost/api/mcqs/${mcqId}/attempts`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function context(id: string) {
	return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
	vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
});

describe("POST /api/mcqs/[id]/attempts", () => {
	it("returns 201 with isCorrect true for the correct choice", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);

		const response = await POST(
			request(mcq.id, { userId, choiceId: mcq.choices[0].id }),
			context(mcq.id)
		);
		const json = (await response.json()) as { attempt: { isCorrect: boolean } };

		expect(response.status).toBe(201);
		expect(json.attempt.isCorrect).toBe(true);
	});

	it("returns 201 with isCorrect false for an incorrect choice", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);

		const response = await POST(
			request(mcq.id, { userId, choiceId: mcq.choices[1].id }),
			context(mcq.id)
		);
		const json = (await response.json()) as { attempt: { isCorrect: boolean } };

		expect(response.status).toBe(201);
		expect(json.attempt.isCorrect).toBe(false);
	});

	it("ignores a client-supplied isCorrect value", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);

		const response = await POST(
			request(mcq.id, {
				userId,
				choiceId: mcq.choices[0].id,
				isCorrect: false,
			}),
			context(mcq.id)
		);
		const json = (await response.json()) as {
			attempt: { id: string; isCorrect: boolean };
		};
		const stored = await env.DB.prepare(
			"SELECT is_correct FROM mcq_attempts WHERE id = ?1"
		)
			.bind(json.attempt.id)
			.all<{ is_correct: number }>();

		expect(json.attempt.isCorrect).toBe(true);
		expect(stored.results[0].is_correct).toBe(1);
	});

	it("returns 400 when the choice belongs to a different question", async () => {
		const userId = await createTestUser();
		const first = await createQuestion(userId, "First question");
		const second = await createQuestion(userId, "Second question");

		const response = await POST(
			request(first.id, { userId, choiceId: second.choices[0].id }),
			context(first.id)
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: { message: "Choice does not belong to this question" },
		});
	});

	it.each([
		{ body: { choiceId: "choice-123" }, missing: "userId" },
		{ body: { userId: "user-123" }, missing: "choiceId" },
	])("returns 400 when $missing is missing", async ({ body }) => {
		const response = await POST(request("mcq-123", body), context("mcq-123"));
		const json = (await response.json()) as { error: { issues: unknown[] } };

		expect(response.status).toBe(400);
		expect(json.error.issues.length).toBeGreaterThan(0);
	});

	it("returns 404 for an unknown question", async () => {
		const userId = await createTestUser();

		const response = await POST(
			request("missing-mcq", { userId, choiceId: "missing-choice" }),
			context("missing-mcq")
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "Question not found" },
		});
	});

	it("returns 404 for an unknown user", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);

		const response = await POST(
			request(mcq.id, {
				userId: "missing-user",
				choiceId: mcq.choices[0].id,
			}),
			context(mcq.id)
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "User not found" },
		});
	});

	it("returns 404 for an unknown choice", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);

		const response = await POST(
			request(mcq.id, { userId, choiceId: "missing-choice" }),
			context(mcq.id)
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "Choice not found" },
		});
	});

	it("creates a new row for every submission", async () => {
		const userId = await createTestUser();
		const mcq = await createQuestion(userId);
		const body = { userId, choiceId: mcq.choices[0].id };

		const first = await POST(request(mcq.id, body), context(mcq.id));
		const second = await POST(request(mcq.id, body), context(mcq.id));
		const firstJson = (await first.json()) as { attempt: { id: string } };
		const secondJson = (await second.json()) as { attempt: { id: string } };
		const stored = await env.DB.prepare(
			"SELECT COUNT(*) AS count FROM mcq_attempts WHERE mcq_id = ?1"
		)
			.bind(mcq.id)
			.all<{ count: number }>();

		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(firstJson.attempt.id).not.toBe(secondJson.attempt.id);
		expect(stored.results[0].count).toBe(2);
	});
});
