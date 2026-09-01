import { hashPassword, verifyPassword } from "@/lib/password";

export interface CreateUserInput {
	email: string;
	username: string;
	firstName: string;
	lastName: string;
	password: string;
}

export interface UpdateUserInput {
	email?: string;
	username?: string;
	firstName?: string;
	lastName?: string;
	password?: string;
}

export interface PublicUser {
	id: string;
	email: string;
	username: string;
	firstName: string;
	lastName: string;
	createdAt: string;
	updatedAt: string;
}

type UserField = "email" | "username";

export class UserAlreadyExistsError extends Error {
	readonly field: UserField;

	constructor(field: UserField) {
		super(`${field} already registered`);
		this.name = "UserAlreadyExistsError";
		this.field = field;
	}
}

interface UserRow {
	id: string;
	email: string;
	username: string;
	first_name: string;
	last_name: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		email: row.email,
		username: row.username,
		firstName: row.first_name,
		lastName: row.last_name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Error && /unique/i.test(error.message);
}

function conflictFieldFromError(error: unknown): UserField | null {
	if (!(error instanceof Error)) return null;

	const message = error.message.toLowerCase();
	if (message.includes("username")) return "username";
	if (message.includes("email")) return "email";
	return null;
}

function rethrowAsUserAlreadyExistsError(error: unknown): never {
	if (isUniqueConstraintError(error)) {
		const field = conflictFieldFromError(error);
		if (field) throw new UserAlreadyExistsError(field);
	}

	throw error;
}

async function getUserRowByEmail(db: D1Database, email: string): Promise<UserRow | null> {
	const result = await db
		.prepare("SELECT * FROM users WHERE email = ?1")
		.bind(normalizeEmail(email))
		.all<UserRow>();

	return result.results[0] ?? null;
}

async function getUserRowByUsername(db: D1Database, username: string): Promise<UserRow | null> {
	const result = await db
		.prepare("SELECT * FROM users WHERE username = ?1")
		.bind(normalizeUsername(username))
		.all<UserRow>();

	return result.results[0] ?? null;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<PublicUser> {
	const email = normalizeEmail(input.email);
	const username = normalizeUsername(input.username);
	const passwordHash = await hashPassword(input.password);

	try {
		await db
			.prepare(
				"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
			)
			.bind(email, username, input.firstName.trim(), input.lastName.trim(), passwordHash)
			.run();
	} catch (error) {
		rethrowAsUserAlreadyExistsError(error);
	}

	const row = await getUserRowByEmail(db, email);
	if (!row) throw new Error("Failed to create user");

	return toPublicUser(row);
}

export async function getUserById(db: D1Database, id: string): Promise<PublicUser | null> {
	const result = await db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).all<UserRow>();
	const row = result.results[0];

	return row ? toPublicUser(row) : null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<PublicUser | null> {
	const row = await getUserRowByEmail(db, email);
	return row ? toPublicUser(row) : null;
}

export async function getUserByUsername(
	db: D1Database,
	username: string
): Promise<PublicUser | null> {
	const row = await getUserRowByUsername(db, username);
	return row ? toPublicUser(row) : null;
}

export async function updateUser(
	db: D1Database,
	id: string,
	input: UpdateUserInput
): Promise<PublicUser | null> {
	const existing = await db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).all<UserRow>();
	const row = existing.results[0];
	if (!row) return null;

	const email = input.email !== undefined ? normalizeEmail(input.email) : row.email;
	const username =
		input.username !== undefined ? normalizeUsername(input.username) : row.username;
	const firstName = input.firstName !== undefined ? input.firstName.trim() : row.first_name;
	const lastName = input.lastName !== undefined ? input.lastName.trim() : row.last_name;
	const passwordHash =
		input.password !== undefined ? await hashPassword(input.password) : row.password_hash;

	try {
		await db
			.prepare(
				"UPDATE users SET email = ?1, username = ?2, first_name = ?3, last_name = ?4, password_hash = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6"
			)
			.bind(email, username, firstName, lastName, passwordHash, id)
			.run();
	} catch (error) {
		rethrowAsUserAlreadyExistsError(error);
	}

	return getUserById(db, id);
}

export async function deleteUser(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
	return result.meta.changes > 0;
}

export async function listUsers(db: D1Database): Promise<PublicUser[]> {
	const result = await db
		.prepare("SELECT * FROM users ORDER BY created_at ASC")
		.all<UserRow>();

	return result.results.map(toPublicUser);
}

export async function verifyCredentials(
	db: D1Database,
	email: string,
	password: string
): Promise<PublicUser | null> {
	const row = await getUserRowByEmail(db, email);
	if (!row) return null;

	const valid = await verifyPassword(password, row.password_hash);
	if (!valid) return null;

	return toPublicUser(row);
}
