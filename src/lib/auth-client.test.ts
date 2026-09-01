import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginUser, registerUser } from "./auth-client";

const validRegisterInput = {
	email: "teacher@example.com",
	username: "adalovelace",
	firstName: "Ada",
	lastName: "Lovelace",
	password: "secure-password",
};

const validLoginInput = {
	email: "teacher@example.com",
	password: "secure-password",
};

const mockUser = {
	id: "abc123",
	email: "teacher@example.com",
	username: "adalovelace",
	firstName: "Ada",
	lastName: "Lovelace",
	createdAt: "2026-01-01T00:00:00.000Z",
};

describe("registerUser", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns the parsed user on a 201 response", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ user: mockUser }), { status: 201 })
		);

		const result = await registerUser(validRegisterInput);

		expect(result).toEqual({ ok: true, user: mockUser });
		expect(fetch).toHaveBeenCalledWith("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(validRegisterInput),
		});
	});

	it("returns validation issues without calling fetch for invalid input", async () => {
		const result = await registerUser({
			...validRegisterInput,
			email: "not-an-email",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.kind).toBe("validation");
			expect(result.issues.length).toBeGreaterThan(0);
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns a 400 api error with issues from the server", async () => {
		const issues = [{ code: "too_small", message: "Too short", path: ["password"] }];
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Invalid input", issues } }), {
				status: 400,
			})
		);

		const result = await registerUser(validRegisterInput);

		expect(result).toEqual({ ok: false, kind: "api", message: "Invalid input", issues });
	});

	it("returns a conflict error with field on 409", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({
					error: { message: "Email already registered", field: "email" },
				}),
				{ status: 409 }
			)
		);

		const result = await registerUser(validRegisterInput);

		expect(result).toEqual({
			ok: false,
			kind: "conflict",
			field: "email",
			message: "Email already registered",
		});
	});

	it("returns a server error on 500", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Something went wrong" } }), {
				status: 500,
			})
		);

		const result = await registerUser(validRegisterInput);

		expect(result).toEqual({
			ok: false,
			kind: "server",
			message: "Something went wrong",
		});
	});
});

describe("loginUser", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns the parsed user on a 200 response", async () => {
		const loginUserPayload = {
			id: mockUser.id,
			email: mockUser.email,
			username: mockUser.username,
			firstName: mockUser.firstName,
			lastName: mockUser.lastName,
		};
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ user: loginUserPayload }), { status: 200 })
		);

		const result = await loginUser(validLoginInput);

		expect(result).toEqual({ ok: true, user: loginUserPayload });
		expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(validLoginInput),
		});
	});

	it("returns validation issues without calling fetch for invalid input", async () => {
		const result = await loginUser({ email: "", password: "" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.kind).toBe("validation");
			expect(result.issues.length).toBeGreaterThan(0);
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it("returns a generic unauthorized error on 401", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Invalid email or password" } }), {
				status: 401,
			})
		);

		const result = await loginUser(validLoginInput);

		expect(result).toEqual({
			ok: false,
			kind: "unauthorized",
			message: "Invalid email or password",
		});
	});

	it("returns a server error on 500", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Something went wrong" } }), {
				status: 500,
			})
		);

		const result = await loginUser(validLoginInput);

		expect(result).toEqual({
			ok: false,
			kind: "server",
			message: "Something went wrong",
		});
	});
});
