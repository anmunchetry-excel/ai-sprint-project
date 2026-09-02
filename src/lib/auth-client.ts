import type { ZodIssue } from "zod";
import {
	loginSchema,
	registerSchema,
	type LoginInput,
	type RegisterInput,
} from "@/lib/schemas/auth";

export type AuthUser = {
	id: string;
	email: string;
	username: string;
	firstName: string;
	lastName: string;
	createdAt?: string;
};

type ApiErrorBody = {
	error?: {
		message?: string;
		field?: "email" | "username";
		issues?: ZodIssue[];
	};
};

export type RegisterResult =
	| { ok: true; user: AuthUser }
	| { ok: false; kind: "validation"; issues: ZodIssue[] }
	| { ok: false; kind: "api"; message: string; issues?: ZodIssue[] }
	| { ok: false; kind: "conflict"; field: "email" | "username"; message: string }
	| { ok: false; kind: "server"; message: string };

export type LoginResult =
	| { ok: true; user: AuthUser }
	| { ok: false; kind: "validation"; issues: ZodIssue[] }
	| { ok: false; kind: "unauthorized"; message: string }
	| { ok: false; kind: "server"; message: string };

export type LogoutResult = { ok: true } | { ok: false; kind: "server"; message: string };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
	const parsed = registerSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, kind: "validation", issues: parsed.error.issues };
	}

	const response = await fetch("/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
	});

	const body = (await response.json()) as { user?: AuthUser } & ApiErrorBody;

	if (response.ok) {
		return { ok: true, user: body.user! };
	}

	if (response.status === 400) {
		return {
			ok: false,
			kind: "api",
			message: body.error?.message ?? "Invalid input",
			issues: body.error?.issues,
		};
	}

	if (response.status === 409 && body.error?.field) {
		return {
			ok: false,
			kind: "conflict",
			field: body.error.field,
			message: body.error.message ?? "Already registered",
		};
	}

	return {
		ok: false,
		kind: "server",
		message: body.error?.message ?? "Something went wrong",
	};
}

export async function loginUser(input: LoginInput): Promise<LoginResult> {
	const parsed = loginSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, kind: "validation", issues: parsed.error.issues };
	}

	const response = await fetch("/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
	});

	const body = (await response.json()) as { user?: AuthUser } & ApiErrorBody;

	if (response.ok) {
		return { ok: true, user: body.user! };
	}

	if (response.status === 401) {
		return {
			ok: false,
			kind: "unauthorized",
			message: body.error?.message ?? "Invalid email or password",
		};
	}

	return {
		ok: false,
		kind: "server",
		message: body.error?.message ?? "Something went wrong",
	};
}

export async function logoutUser(): Promise<LogoutResult> {
	const response = await fetch("/api/auth/logout", { method: "POST" });
	const body = (await response.json()) as ApiErrorBody;

	if (response.ok) {
		return { ok: true };
	}

	return {
		ok: false,
		kind: "server",
		message: body.error?.message ?? "Something went wrong",
	};
}
