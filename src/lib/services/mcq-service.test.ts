import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CreateMcqInput, McqChoiceInput, UpdateMcqInput } from "@/lib/schemas/mcq";
import {
	ChoiceNotForMcqError,
	McqUserNotFoundError,
	createMcq,
	deleteMcq,
	getMcqById,
	listAttemptsForMcq,
	listMcqs,
	recordAttempt,
	updateMcq,
} from "./mcq-service";

async function createTestUser(): Promise<string> {
	const suffix = crypto.randomUUID();
	const email = `mcq-service-${suffix}@example.com`;

	await env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(
			email,
			`mcq-service-${suffix}`,
			"Service",
			"Tester",
			"pbkdf2$100000$deadbeef$deadbeef"
		)
		.run();

	const result = await env.DB.prepare("SELECT id FROM users WHERE email = ?1")
		.bind(email)
		.all<{ id: string }>();

	return result.results[0].id;
}

function twoChoices(): McqChoiceInput[] {
	return [
		{ text: "Carbon dioxide", isCorrect: true },
		{ text: "Oxygen", isCorrect: false },
	];
}

function fourChoices(): McqChoiceInput[] {
	return [
		...twoChoices(),
		{ text: "Nitrogen", isCorrect: false },
		{ text: "Hydrogen", isCorrect: false },
	];
}

function createInput(userId: string, choices = twoChoices()): CreateMcqInput {
	return {
		name: "  Photosynthesis basics  ",
		question: "  Which gas do plants absorb?  ",
		userId,
		choices,
	};
}

function updateInput(choices = twoChoices()): UpdateMcqInput {
	return {
		name: "Updated photosynthesis",
		question: "Which gas is absorbed by plants?",
		choices,
	};
}

describe("MCQ service", () => {
	it("createMcq stores the question and choices with sequential positions", async () => {
		const userId = await createTestUser();

		const created = await createMcq(env.DB, createInput(userId));

		expect(created).toMatchObject({
			name: "Photosynthesis basics",
			question: "Which gas do plants absorb?",
			createdByUserId: userId,
		});
		expect(created.choices.map((choice) => choice.position)).toEqual([0, 1]);
		expect(created.choices.map((choice) => choice.isCorrect)).toEqual([true, false]);
		expect(created.choices.every((choice) => Boolean(choice.id))).toBe(true);
	});

	it("createMcq rejects a nonexistent creator with a typed error", async () => {
		await expect(createMcq(env.DB, createInput("missing-user"))).rejects.toBeInstanceOf(
			McqUserNotFoundError
		);
	});

	it("getMcqById returns choices ordered by position", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));
		const [first, second] = created.choices;

		await env.DB.batch([
			env.DB.prepare("UPDATE mcq_choices SET position = ?1 WHERE id = ?2").bind(99, first.id),
			env.DB.prepare("UPDATE mcq_choices SET position = ?1 WHERE id = ?2").bind(0, second.id),
			env.DB.prepare("UPDATE mcq_choices SET position = ?1 WHERE id = ?2").bind(1, first.id),
		]);

		const found = await getMcqById(env.DB, created.id);

		expect(found?.choices.map((choice) => choice.id)).toEqual([second.id, first.id]);
		expect(found?.choices.map((choice) => choice.position)).toEqual([0, 1]);
	});

	it("getMcqById returns null for an unknown id", async () => {
		await expect(getMcqById(env.DB, "missing-mcq")).resolves.toBeNull();
	});

	it("listMcqs returns an empty array when no questions exist", async () => {
		await env.DB.prepare("DELETE FROM mcqs").run();

		await expect(listMcqs(env.DB)).resolves.toEqual([]);
	});

	it("listMcqs returns every question with an accurate choice count", async () => {
		await env.DB.prepare("DELETE FROM mcqs").run();
		const userId = await createTestUser();
		const first = await createMcq(env.DB, createInput(userId));
		const second = await createMcq(env.DB, {
			...createInput(userId, fourChoices()),
			name: "Four-choice question",
		});

		const listed = await listMcqs(env.DB);

		expect(listed).toHaveLength(2);
		expect(listed.find((mcq) => mcq.id === first.id)?.choiceCount).toBe(2);
		expect(listed.find((mcq) => mcq.id === second.id)?.choiceCount).toBe(4);
		expect(listed[0]).not.toHaveProperty("choices");
	});

	it("updateMcq changes content and advances updated_at", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));
		const oldTimestamp = "2000-01-01 00:00:00";
		await env.DB.prepare("UPDATE mcqs SET updated_at = ?1 WHERE id = ?2")
			.bind(oldTimestamp, created.id)
			.run();

		const updated = await updateMcq(env.DB, created.id, {
			...updateInput(),
			choices: [
				{ text: "Updated correct choice", isCorrect: true },
				{ text: "Updated incorrect choice", isCorrect: false },
			],
		});

		expect(updated).toMatchObject({
			name: "Updated photosynthesis",
			question: "Which gas is absorbed by plants?",
		});
		expect(updated?.choices.map((choice) => choice.text)).toEqual([
			"Updated correct choice",
			"Updated incorrect choice",
		]);
		expect(updated?.updatedAt).not.toBe(oldTimestamp);
	});

	it("updateMcq grows a question from two choices to four", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));

		const updated = await updateMcq(env.DB, created.id, updateInput(fourChoices()));

		expect(updated?.choices).toHaveLength(4);
		expect(updated?.choices.map((choice) => choice.position)).toEqual([0, 1, 2, 3]);
	});

	it("updateMcq shrinks a question from four choices to two", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId, fourChoices()));

		const updated = await updateMcq(env.DB, created.id, updateInput());

		expect(updated?.choices).toHaveLength(2);
		expect(updated?.choices.map((choice) => choice.position)).toEqual([0, 1]);
	});

	it("updateMcq preserves retained choice ids and their attempt history", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));
		const originalChoiceIds = created.choices.map((choice) => choice.id);

		await env.DB.prepare(
			"INSERT INTO mcq_attempts (mcq_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4)"
		)
			.bind(created.id, originalChoiceIds[0], userId, 1)
			.run();

		const updated = await updateMcq(env.DB, created.id, {
			...updateInput(),
			choices: [
				{ text: "Reworded correct choice", isCorrect: true },
				{ text: "Reworded incorrect choice", isCorrect: false },
			],
		});
		const attempts = await listAttemptsForMcq(env.DB, created.id);

		expect(updated?.choices.map((choice) => choice.id)).toEqual(originalChoiceIds);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].choiceId).toBe(originalChoiceIds[0]);
	});

	it("updateMcq returns null for an unknown id", async () => {
		await expect(updateMcq(env.DB, "missing-mcq", updateInput())).resolves.toBeNull();
	});

	it("deleteMcq removes the question, choices, and attempts and reports missing ids", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));
		await env.DB.prepare(
			"INSERT INTO mcq_attempts (mcq_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4)"
		)
			.bind(created.id, created.choices[0].id, userId, 1)
			.run();

		await expect(deleteMcq(env.DB, created.id)).resolves.toBe(true);
		await expect(getMcqById(env.DB, created.id)).resolves.toBeNull();
		await expect(listAttemptsForMcq(env.DB, created.id)).resolves.toEqual([]);
		await expect(deleteMcq(env.DB, "missing-mcq")).resolves.toBe(false);
	});

	it("recordAttempt derives and stores correctness from the selected choice", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));

		const correct = await recordAttempt(env.DB, created.id, {
			userId,
			choiceId: created.choices[0].id,
		});
		const incorrect = await recordAttempt(env.DB, created.id, {
			userId,
			choiceId: created.choices[1].id,
		});
		const stored = await env.DB.prepare(
			"SELECT is_correct FROM mcq_attempts WHERE id IN (?1, ?2) ORDER BY is_correct DESC"
		)
			.bind(correct.id, incorrect.id)
			.all<{ is_correct: number }>();

		expect(correct.isCorrect).toBe(true);
		expect(incorrect.isCorrect).toBe(false);
		expect(stored.results.map((row) => row.is_correct)).toEqual([1, 0]);
	});

	it("recordAttempt rejects a choice belonging to a different question", async () => {
		const userId = await createTestUser();
		const first = await createMcq(env.DB, createInput(userId));
		const second = await createMcq(env.DB, {
			...createInput(userId),
			name: "Second question",
		});

		await expect(
			recordAttempt(env.DB, first.id, {
				userId,
				choiceId: second.choices[0].id,
			})
		).rejects.toBeInstanceOf(ChoiceNotForMcqError);
	});

	it("listAttemptsForMcq returns attempts newest-first", async () => {
		const userId = await createTestUser();
		const created = await createMcq(env.DB, createInput(userId));
		const older = await recordAttempt(env.DB, created.id, {
			userId,
			choiceId: created.choices[0].id,
		});
		const newer = await recordAttempt(env.DB, created.id, {
			userId,
			choiceId: created.choices[1].id,
		});

		await env.DB.batch([
			env.DB.prepare("UPDATE mcq_attempts SET created_at = ?1 WHERE id = ?2").bind(
				"2000-01-01 00:00:00",
				older.id
			),
			env.DB.prepare("UPDATE mcq_attempts SET created_at = ?1 WHERE id = ?2").bind(
				"2001-01-01 00:00:00",
				newer.id
			),
		]);

		const attempts = await listAttemptsForMcq(env.DB, created.id);

		expect(attempts.map((attempt) => attempt.id)).toEqual([newer.id, older.id]);
	});
});
