import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function insertUser(): Promise<string> {
	const suffix = crypto.randomUUID();
	const email = `mcq-schema-${suffix}@example.com`;

	await env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(
			email,
			`mcq-schema-${suffix}`,
			"Schema",
			"Tester",
			"pbkdf2$100000$deadbeef$deadbeef"
		)
		.run();

	const result = await env.DB.prepare("SELECT id FROM users WHERE email = ?1")
		.bind(email)
		.all<{ id: string }>();

	return result.results[0].id;
}

async function insertMcq(userId: string): Promise<string> {
	const name = `Schema question ${crypto.randomUUID()}`;

	await env.DB.prepare(
		"INSERT INTO mcqs (name, question, created_by_user_id) VALUES (?1, ?2, ?3)"
	)
		.bind(name, "Which answer is correct?", userId)
		.run();

	const result = await env.DB.prepare("SELECT id FROM mcqs WHERE name = ?1")
		.bind(name)
		.all<{ id: string }>();

	return result.results[0].id;
}

describe("MCQ table schema", () => {
	it("creates all three tables with the expected columns", async () => {
		const expectedColumns = {
			mcqs: [
				"id",
				"name",
				"question",
				"created_by_user_id",
				"created_at",
				"updated_at",
			],
			mcq_choices: [
				"id",
				"mcq_id",
				"choice_text",
				"is_correct",
				"position",
				"created_at",
				"updated_at",
			],
			mcq_attempts: [
				"id",
				"mcq_id",
				"choice_id",
				"user_id",
				"is_correct",
				"created_at",
			],
		};

		for (const [table, expected] of Object.entries(expectedColumns)) {
			const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
				name: string;
			}>();

			expect(result.results.map((row) => row.name)).toEqual(expected);
		}

		const indexes = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = ?1 AND name LIKE ?2 ORDER BY name"
		)
			.bind("index", "idx_mcq%")
			.all<{ name: string }>();

		expect(indexes.results.map((row) => row.name)).toEqual([
			"idx_mcq_attempts_mcq_id",
			"idx_mcq_attempts_user_id",
			"idx_mcq_choices_mcq_id",
			"idx_mcqs_created_by_user_id",
		]);
	});

	it("defaults id, created_at, and updated_at when inserting an MCQ", async () => {
		const userId = await insertUser();
		const mcqId = await insertMcq(userId);

		const result = await env.DB.prepare(
			"SELECT id, created_at, updated_at FROM mcqs WHERE id = ?1"
		)
			.bind(mcqId)
			.all<{ id: string; created_at: string; updated_at: string }>();
		const row = result.results[0];

		expect(row.id).toBeTruthy();
		expect(row.created_at).toBeTruthy();
		expect(row.updated_at).toBeTruthy();
	});

	it("rejects an MCQ whose creator does not exist", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO mcqs (name, question, created_by_user_id) VALUES (?1, ?2, ?3)"
			)
				.bind("Invalid creator", "This insert must fail.", "missing-user")
				.run()
		).rejects.toThrow(/foreign key/i);
	});

	it("rejects a choice whose MCQ does not exist", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
			)
				.bind("missing-mcq", "Choice", 1, 0)
				.run()
		).rejects.toThrow(/foreign key/i);
	});

	it("rejects duplicate choice positions within one MCQ", async () => {
		const userId = await insertUser();
		const mcqId = await insertMcq(userId);

		await env.DB.prepare(
			"INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
		)
			.bind(mcqId, "First choice", 1, 0)
			.run();

		await expect(
			env.DB.prepare(
				"INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
			)
				.bind(mcqId, "Conflicting choice", 0, 0)
				.run()
		).rejects.toThrow(/unique/i);
	});

	it("rejects is_correct values other than zero or one", async () => {
		const userId = await insertUser();
		const mcqId = await insertMcq(userId);

		await expect(
			env.DB.prepare(
				"INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
			)
				.bind(mcqId, "Invalid correctness", 2, 0)
				.run()
		).rejects.toThrow(/check/i);
	});

	it("cascades an MCQ deletion to its choices and attempts", async () => {
		const userId = await insertUser();
		const mcqId = await insertMcq(userId);

		await env.DB.prepare(
			"INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
		)
			.bind(mcqId, "Correct choice", 1, 0)
			.run();

		const choiceResult = await env.DB.prepare(
			"SELECT id FROM mcq_choices WHERE mcq_id = ?1"
		)
			.bind(mcqId)
			.all<{ id: string }>();
		const choiceId = choiceResult.results[0].id;

		await env.DB.prepare(
			"INSERT INTO mcq_attempts (mcq_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4)"
		)
			.bind(mcqId, choiceId, userId, 1)
			.run();

		await env.DB.prepare("DELETE FROM mcqs WHERE id = ?1").bind(mcqId).run();

		const choices = await env.DB.prepare(
			"SELECT COUNT(*) AS count FROM mcq_choices WHERE mcq_id = ?1"
		)
			.bind(mcqId)
			.all<{ count: number }>();
		const attempts = await env.DB.prepare(
			"SELECT COUNT(*) AS count FROM mcq_attempts WHERE mcq_id = ?1"
		)
			.bind(mcqId)
			.all<{ count: number }>();

		expect(choices.results[0].count).toBe(0);
		expect(attempts.results[0].count).toBe(0);
	});
});
