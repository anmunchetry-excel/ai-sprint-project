import type { AttemptInput, CreateMcqInput, UpdateMcqInput } from "@/lib/schemas/mcq";

export interface McqChoice {
	id: string;
	text: string;
	isCorrect: boolean;
	position: number;
	createdAt: string;
	updatedAt: string;
}

export interface Mcq {
	id: string;
	name: string;
	question: string;
	createdByUserId: string;
	createdAt: string;
	updatedAt: string;
	choices: McqChoice[];
}

export interface McqSummary {
	id: string;
	name: string;
	question: string;
	createdByUserId: string;
	choiceCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface McqAttempt {
	id: string;
	mcqId: string;
	choiceId: string;
	userId: string;
	isCorrect: boolean;
	createdAt: string;
}

export class McqUserNotFoundError extends Error {
	constructor() {
		super("User not found");
		this.name = "McqUserNotFoundError";
	}
}

export class McqNotFoundError extends Error {
	constructor() {
		super("Question not found");
		this.name = "McqNotFoundError";
	}
}

export class McqChoiceNotFoundError extends Error {
	constructor() {
		super("Choice not found");
		this.name = "McqChoiceNotFoundError";
	}
}

export class ChoiceNotForMcqError extends Error {
	constructor() {
		super("Choice does not belong to this question");
		this.name = "ChoiceNotForMcqError";
	}
}

interface McqRow {
	id: string;
	name: string;
	question: string;
	created_by_user_id: string;
	created_at: string;
	updated_at: string;
}

interface McqSummaryRow extends McqRow {
	choice_count: number;
}

interface ChoiceRow {
	id: string;
	mcq_id: string;
	choice_text: string;
	is_correct: number;
	position: number;
	created_at: string;
	updated_at: string;
}

interface AttemptRow {
	id: string;
	mcq_id: string;
	choice_id: string;
	user_id: string;
	is_correct: number;
	created_at: string;
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		text: row.choice_text,
		isCorrect: row.is_correct === 1,
		position: row.position,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSummary(row: McqSummaryRow): McqSummary {
	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdByUserId: row.created_by_user_id,
		choiceCount: row.choice_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toAttempt(row: AttemptRow): McqAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		choiceId: row.choice_id,
		userId: row.user_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

function isForeignKeyConstraintError(error: unknown): boolean {
	return error instanceof Error && /foreign key/i.test(error.message);
}

async function getMcqRowById(db: D1Database, id: string): Promise<McqRow | null> {
	const result = await db.prepare("SELECT * FROM mcqs WHERE id = ?1").bind(id).all<McqRow>();
	return result.results[0] ?? null;
}

async function getChoiceRows(db: D1Database, mcqId: string): Promise<ChoiceRow[]> {
	const result = await db
		.prepare("SELECT * FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC")
		.bind(mcqId)
		.all<ChoiceRow>();

	return result.results;
}

export async function createMcq(db: D1Database, input: CreateMcqInput): Promise<Mcq> {
	const mcqId = crypto.randomUUID();
	const statements: D1PreparedStatement[] = [
		db
			.prepare(
				"INSERT INTO mcqs (id, name, question, created_by_user_id) VALUES (?1, ?2, ?3, ?4)"
			)
			.bind(mcqId, input.name.trim(), input.question.trim(), input.userId),
		...input.choices.map((choice, position) =>
			db
				.prepare(
					"INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)"
				)
				.bind(
					crypto.randomUUID(),
					mcqId,
					choice.text.trim(),
					choice.isCorrect ? 1 : 0,
					position
				)
		),
	];

	try {
		await db.batch(statements);
	} catch (error) {
		if (isForeignKeyConstraintError(error)) {
			throw new McqUserNotFoundError();
		}
		throw error;
	}

	const created = await getMcqById(db, mcqId);
	if (!created) throw new Error("Failed to create question");
	return created;
}

export async function getMcqById(db: D1Database, id: string): Promise<Mcq | null> {
	const row = await getMcqRowById(db, id);
	if (!row) return null;

	const choices = await getChoiceRows(db, id);

	return {
		id: row.id,
		name: row.name,
		question: row.question,
		createdByUserId: row.created_by_user_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		choices: choices.map(toChoice),
	};
}

export async function listMcqs(db: D1Database): Promise<McqSummary[]> {
	const result = await db
		.prepare(
			`SELECT m.*, COUNT(c.id) AS choice_count
			 FROM mcqs AS m
			 LEFT JOIN mcq_choices AS c ON c.mcq_id = m.id
			 GROUP BY m.id
			 ORDER BY m.created_at DESC, m.id DESC`
		)
		.all<McqSummaryRow>();

	return result.results.map(toSummary);
}

export async function updateMcq(
	db: D1Database,
	id: string,
	input: UpdateMcqInput
): Promise<Mcq | null> {
	const existing = await getMcqById(db, id);
	if (!existing) return null;

	const statements: D1PreparedStatement[] = [
		db
			.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1 AND position >= ?2")
			.bind(id, input.choices.length),
		...input.choices.map((choice, position) => {
			const existingChoice = existing.choices[position];

			if (existingChoice) {
				return db
					.prepare(
						"UPDATE mcq_choices SET choice_text = ?1, is_correct = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3"
					)
					.bind(choice.text.trim(), choice.isCorrect ? 1 : 0, existingChoice.id);
			}

			return db
				.prepare(
					"INSERT INTO mcq_choices (id, mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)"
				)
				.bind(
					crypto.randomUUID(),
					id,
					choice.text.trim(),
					choice.isCorrect ? 1 : 0,
					position
				);
		}),
		db
			.prepare(
				"UPDATE mcqs SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3"
			)
			.bind(input.name.trim(), input.question.trim(), id),
	];

	await db.batch(statements);
	return getMcqById(db, id);
}

export async function deleteMcq(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
	return result.meta.changes > 0;
}

export async function recordAttempt(
	db: D1Database,
	mcqId: string,
	input: AttemptInput
): Promise<McqAttempt> {
	const mcq = await getMcqRowById(db, mcqId);
	if (!mcq) throw new McqNotFoundError();

	const choiceResult = await db
		.prepare("SELECT * FROM mcq_choices WHERE id = ?1")
		.bind(input.choiceId)
		.all<ChoiceRow>();
	const choice = choiceResult.results[0];

	if (!choice) throw new McqChoiceNotFoundError();
	if (choice.mcq_id !== mcqId) throw new ChoiceNotForMcqError();

	const userResult = await db
		.prepare("SELECT id FROM users WHERE id = ?1")
		.bind(input.userId)
		.all<{ id: string }>();
	if (!userResult.results[0]) throw new McqUserNotFoundError();

	const attemptId = crypto.randomUUID();
	await db
		.prepare(
			"INSERT INTO mcq_attempts (id, mcq_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)"
		)
		.bind(attemptId, mcqId, choice.id, input.userId, choice.is_correct === 1 ? 1 : 0)
		.run();

	const attemptResult = await db
		.prepare("SELECT * FROM mcq_attempts WHERE id = ?1")
		.bind(attemptId)
		.all<AttemptRow>();
	const attempt = attemptResult.results[0];
	if (!attempt) throw new Error("Failed to record attempt");

	return toAttempt(attempt);
}

export async function listAttemptsForMcq(
	db: D1Database,
	mcqId: string
): Promise<McqAttempt[]> {
	const result = await db
		.prepare(
			"SELECT * FROM mcq_attempts WHERE mcq_id = ?1 ORDER BY created_at DESC, id DESC"
		)
		.bind(mcqId)
		.all<AttemptRow>();

	return result.results.map(toAttempt);
}
