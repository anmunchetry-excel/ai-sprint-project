import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function insertUser(overrides: Partial<Record<"email" | "username" | "firstName" | "lastName", string>> = {}) {
	const email = overrides.email ?? "ada@example.com";
	const username = overrides.username ?? "ada";
	const firstName = overrides.firstName ?? "Ada";
	const lastName = overrides.lastName ?? "Lovelace";

	return env.DB.prepare(
		"INSERT INTO users (email, username, first_name, last_name, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
	)
		.bind(email, username, firstName, lastName, "pbkdf2$100000$deadbeef$deadbeef")
		.run();
}

describe("users table schema", () => {
	it("has the expected columns", async () => {
		const result = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
		const columns = result.results.map((row) => row.name);

		expect(columns).toEqual([
			"id",
			"email",
			"username",
			"first_name",
			"last_name",
			"password_hash",
			"created_at",
			"updated_at",
		]);
	});

	it("inserts a valid row and defaults id, created_at, and updated_at", async () => {
		await insertUser();

		const result = await env.DB.prepare("SELECT * FROM users WHERE email = ?1")
			.bind("ada@example.com")
			.all<{ id: string; created_at: string; updated_at: string }>();
		const row = result.results[0];

		expect(row).toBeDefined();
		expect(row.id).toBeTruthy();
		expect(row.created_at).toBeTruthy();
		expect(row.updated_at).toBeTruthy();
	});

	it("rejects a second row with a duplicate email", async () => {
		await insertUser({ email: "dup@example.com", username: "user-one" });

		await expect(insertUser({ email: "dup@example.com", username: "user-two" })).rejects.toThrow(/unique/i);
	});

	it("rejects a second row with a duplicate username", async () => {
		await insertUser({ email: "user-three@example.com", username: "dup-username" });

		await expect(
			insertUser({ email: "user-four@example.com", username: "dup-username" })
		).rejects.toThrow(/unique/i);
	});
});
