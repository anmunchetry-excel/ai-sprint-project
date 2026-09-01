import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

const PBKDF2_FORMAT = /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/;

describe("password hashing", () => {
	it("hashPassword returns a string in the pbkdf2$iterations$salt$hash format", async () => {
		const hash = await hashPassword("correct-horse-battery-staple");

		expect(hash).toMatch(PBKDF2_FORMAT);
	});

	it("verifyPassword resolves true for the correct password against its own hash", async () => {
		const hash = await hashPassword("correct-horse-battery-staple");

		await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
	});

	it("verifyPassword resolves false for an incorrect password", async () => {
		const hash = await hashPassword("correct-horse-battery-staple");

		await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
	});

	it("two hashes of the same password differ (random salt per call)", async () => {
		const hash1 = await hashPassword("same-password");
		const hash2 = await hashPassword("same-password");

		expect(hash1).not.toBe(hash2);
	});

	it("verifyPassword resolves false for a malformed or unrecognized stored value, rather than throwing", async () => {
		await expect(verifyPassword("password", "")).resolves.toBe(false);
		await expect(verifyPassword("password", "bcrypt$not-supported")).resolves.toBe(false);
		await expect(verifyPassword("password", "pbkdf2$not-a-number$deadbeef$deadbeef")).resolves.toBe(false);
		await expect(verifyPassword("password", "pbkdf2$100000$tooshort$deadbeef")).resolves.toBe(false);
		await expect(verifyPassword("password", "not-enough-parts")).resolves.toBe(false);
	});
});
