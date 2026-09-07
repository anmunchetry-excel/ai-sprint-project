import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createMcq, getMcqById } from "@/lib/services/mcq-service";
import { DELETE, GET, PUT } from "./route";

async function createTestUser(): Promise<string> {
	const suffix = crypto.randomUUID();
	const email = `mcq-id-route-${suffix}@example.com`;

	await env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(
			email,
			`mcq-id-route-${suffix}`,
			"Route",
			"Tester",
			"pbkdf2$100000$deadbeef$deadbeef"
		)
		.run();

	const result = await env.DB.prepare("SELECT id FROM users WHERE email = ?1")
		.bind(email)
		.all<{ id: string }>();

	return result.results[0].id;
}

async function createQuestion() {
	const userId = await createTestUser();

	return createMcq(env.DB, {
		name: "Photosynthesis basics",
		question: "Which gas do plants absorb?",
		userId,
		choices: [
			{ text: "Carbon dioxide", isCorrect: true },
			{ text: "Oxygen", isCorrect: false },
		],
	});
}

function context(id: string) {
	return { params: Promise.resolve({ id }) };
}

function updateBody() {
	return {
		name: "Updated photosynthesis",
		question: "Which gas is absorbed by plants?",
		choices: [
			{ text: "Carbon dioxide", isCorrect: true },
			{ text: "Oxygen", isCorrect: false },
			{ text: "Nitrogen", isCorrect: false },
		],
	};
}

function jsonRequest(id: string, body: unknown): Request {
	return new Request(`http://localhost/api/mcqs/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
});

describe("GET /api/mcqs/[id]", () => {
	it("returns the question with choices in position order", async () => {
		const created = await createQuestion();

		const response = await GET(
			new Request(`http://localhost/api/mcqs/${created.id}`),
			context(created.id)
		);
		const json = (await response.json()) as {
			mcq: { id: string; choices: Array<{ position: number }> };
		};

		expect(response.status).toBe(200);
		expect(json.mcq.id).toBe(created.id);
		expect(json.mcq.choices.map((choice) => choice.position)).toEqual([0, 1]);
	});

	it("returns 404 for an unknown question", async () => {
		const response = await GET(
			new Request("http://localhost/api/mcqs/missing"),
			context("missing")
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "Question not found" },
		});
	});
});

describe("PUT /api/mcqs/[id]", () => {
	it("returns the updated question", async () => {
		const created = await createQuestion();

		const response = await PUT(jsonRequest(created.id, updateBody()), context(created.id));
		const json = (await response.json()) as {
			mcq: { name: string; question: string; choices: unknown[] };
		};

		expect(response.status).toBe(200);
		expect(json.mcq).toMatchObject({
			name: "Updated photosynthesis",
			question: "Which gas is absorbed by plants?",
		});
		expect(json.mcq.choices).toHaveLength(3);
	});

	it("returns 400 for invalid input", async () => {
		const created = await createQuestion();
		const invalid = updateBody();
		invalid.choices = invalid.choices.slice(0, 1);

		const response = await PUT(jsonRequest(created.id, invalid), context(created.id));
		const json = (await response.json()) as { error: { issues: unknown[] } };

		expect(response.status).toBe(400);
		expect(json.error.issues.length).toBeGreaterThan(0);
	});

	it("returns 404 for an unknown question", async () => {
		const response = await PUT(jsonRequest("missing", updateBody()), context("missing"));

		expect(response.status).toBe(404);
	});
});

describe("DELETE /api/mcqs/[id]", () => {
	it("deletes the question and returns success", async () => {
		const created = await createQuestion();

		const response = await DELETE(
			new Request(`http://localhost/api/mcqs/${created.id}`, { method: "DELETE" }),
			context(created.id)
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
		await expect(getMcqById(env.DB, created.id)).resolves.toBeNull();
	});

	it("returns 404 for an unknown question", async () => {
		const response = await DELETE(
			new Request("http://localhost/api/mcqs/missing", { method: "DELETE" }),
			context("missing")
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "Question not found" },
		});
	});
});
