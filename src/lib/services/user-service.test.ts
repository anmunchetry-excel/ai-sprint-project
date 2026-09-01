import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	UserAlreadyExistsError,
	createUser,
	getUserByEmail,
	getUserByUsername,
	verifyCredentials,
} from "./user-service";

let counter = 0;

function createTestInput(
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

describe("user service", () => {
	it("createUser stores a hashed password — the raw password never appears in the stored row", async () => {
		const input = createTestInput();
		await createUser(env.DB, input);

		const result = await env.DB.prepare("SELECT password_hash FROM users WHERE email = ?1")
			.bind(input.email)
			.all<{ password_hash: string }>();
		const stored = result.results[0]?.password_hash;

		expect(stored).toBeDefined();
		expect(stored).toMatch(/^pbkdf2\$100000\$/);
		expect(stored).not.toContain(input.password);
	});

	it("createUser rejects a duplicate email with a typed, identifiable error", async () => {
		const input = createTestInput();
		await createUser(env.DB, input);

		await expect(
			createUser(env.DB, { ...input, username: "other-user" })
		).rejects.toMatchObject({ field: "email", name: "UserAlreadyExistsError" });
	});

	it("createUser rejects a duplicate username with a typed, identifiable error", async () => {
		const input = createTestInput();
		await createUser(env.DB, input);

		await expect(
			createUser(env.DB, { ...input, email: "other@example.com" })
		).rejects.toMatchObject({ field: "username", name: "UserAlreadyExistsError" });

		await expect(
			createUser(env.DB, { ...input, email: "other@example.com" })
		).rejects.toBeInstanceOf(UserAlreadyExistsError);
	});

	it("getUserByEmail and getUserByUsername find the row createUser just made, case-insensitively", async () => {
		const input = createTestInput({
			email: "Teacher@Example.com",
			username: "AdaLovelace",
		});
		await createUser(env.DB, input);

		const byEmail = await getUserByEmail(env.DB, "TEACHER@example.com");
		const byUsername = await getUserByUsername(env.DB, "ADALOVELACE");

		expect(byEmail).toMatchObject({
			email: "teacher@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
		});
		expect(byUsername).toMatchObject({
			username: "adalovelace",
			email: "teacher@example.com",
		});
	});

	it("verifyCredentials returns the user for correct credentials", async () => {
		const input = createTestInput();
		await createUser(env.DB, input);

		const user = await verifyCredentials(env.DB, input.email, input.password);

		expect(user).toMatchObject({
			email: input.email,
			username: input.username,
			firstName: "Ada",
			lastName: "Lovelace",
		});
	});

	it("verifyCredentials returns null for a wrong password, and for an unknown email", async () => {
		const input = createTestInput();
		await createUser(env.DB, input);

		await expect(verifyCredentials(env.DB, input.email, "wrong-password")).resolves.toBeNull();
		await expect(verifyCredentials(env.DB, "nobody@example.com", input.password)).resolves.toBeNull();
	});

	it("no method that returns a public user shape includes password_hash", async () => {
		const input = createTestInput();
		const created = await createUser(env.DB, input);
		const byEmail = await getUserByEmail(env.DB, input.email);
		const verified = await verifyCredentials(env.DB, input.email, input.password);

		for (const user of [created, byEmail, verified]) {
			expect(user).toBeDefined();
			expect(user).not.toHaveProperty("password_hash");
			expect(user).not.toHaveProperty("passwordHash");
		}
	});
});
