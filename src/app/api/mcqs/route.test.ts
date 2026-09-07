import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { GET, POST } from "./route";

async function createTestUser(): Promise<string> {
	const suffix = crypto.randomUUID();
	const email = `mcq-route-${suffix}@example.com`;

	await env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(
			email,
			`mcq-route-${suffix}`,
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

function validBody(userId: string) {
	return {
		name: "Photosynthesis basics",
		question: "Which gas do plants absorb?",
		userId,
		choices: [
			{ text: "Carbon dioxide", isCorrect: true },
			{ text: "Oxygen", isCorrect: false },
		],
	};
}

function jsonRequest(body: unknown): Request {
	return new Request("http://localhost/api/mcqs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

beforeEach(async () => {
	vi.mocked(getCloudflareContext).mockResolvedValue({ env } as never);
	await env.DB.prepare("DELETE FROM mcqs").run();
});

describe("GET /api/mcqs", () => {
	it("returns an empty array when no questions exist", async () => {
		const response = await GET();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ mcqs: [] });
	});

	it("returns all questions with their choice counts", async () => {
		const userId = await createTestUser();
		await POST(jsonRequest(validBody(userId)));
		await POST(
			jsonRequest({
				...validBody(userId),
				name: "Four-choice question",
				choices: [
					...validBody(userId).choices,
					{ text: "Nitrogen", isCorrect: false },
					{ text: "Hydrogen", isCorrect: false },
				],
			})
		);

		const response = await GET();
		const json = (await response.json()) as {
			mcqs: Array<{ name: string; choiceCount: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.mcqs).toHaveLength(2);
		expect(json.mcqs.find((mcq) => mcq.name === "Photosynthesis basics")?.choiceCount).toBe(2);
		expect(json.mcqs.find((mcq) => mcq.name === "Four-choice question")?.choiceCount).toBe(4);
	});
});

describe("POST /api/mcqs", () => {
	it("returns 201 with the created question and its choices", async () => {
		const userId = await createTestUser();

		const response = await POST(jsonRequest(validBody(userId)));
		const json = (await response.json()) as {
			mcq: { id: string; name: string; choices: Array<{ position: number }> };
		};

		expect(response.status).toBe(201);
		expect(json.mcq.name).toBe("Photosynthesis basics");
		expect(json.mcq.id).toBeTruthy();
		expect(json.mcq.choices.map((choice) => choice.position)).toEqual([0, 1]);
	});

	it.each([
		{
			label: "one choice",
			change: (body: ReturnType<typeof validBody>) => {
				body.choices = body.choices.slice(0, 1);
			},
		},
		{
			label: "seven choices",
			change: (body: ReturnType<typeof validBody>) => {
				body.choices = Array.from({ length: 7 }, (_, index) => ({
					text: `Choice ${index + 1}`,
					isCorrect: index === 0,
				}));
			},
		},
		{
			label: "no correct choice",
			change: (body: ReturnType<typeof validBody>) => {
				body.choices = body.choices.map((choice) => ({ ...choice, isCorrect: false }));
			},
		},
		{
			label: "multiple correct choices",
			change: (body: ReturnType<typeof validBody>) => {
				body.choices = body.choices.map((choice) => ({ ...choice, isCorrect: true }));
			},
		},
		{
			label: "an empty name",
			change: (body: ReturnType<typeof validBody>) => {
				body.name = "   ";
			},
		},
	])("returns 400 for $label", async ({ change }) => {
		const userId = await createTestUser();
		const body = validBody(userId);
		change(body);

		const response = await POST(jsonRequest(body));
		const json = (await response.json()) as { error: { issues: unknown[] } };

		expect(response.status).toBe(400);
		expect(json.error.issues.length).toBeGreaterThan(0);
	});

	it("returns 404 when the creator does not exist", async () => {
		const response = await POST(jsonRequest(validBody("missing-user")));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: { message: "User not found" },
		});
	});
});
