import type { AuthUser } from "@/lib/auth-client";

const STORAGE_KEY = "ai-sprint:current-user";

function isAuthUser(value: unknown): value is AuthUser {
	if (!value || typeof value !== "object") return false;

	const user = value as Record<string, unknown>;
	return (
		typeof user.id === "string" &&
		typeof user.email === "string" &&
		typeof user.username === "string" &&
		typeof user.firstName === "string" &&
		typeof user.lastName === "string" &&
		(user.createdAt === undefined || typeof user.createdAt === "string")
	);
}

export function getCurrentUser(): AuthUser | null {
	if (typeof window === "undefined") return null;

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const parsed: unknown = JSON.parse(stored);
		return isAuthUser(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function setCurrentUser(user: AuthUser): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
	} catch {
		// Storage may be unavailable or full. Authentication still succeeded.
	}
}

export function clearCurrentUser(): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Treat unavailable storage as already cleared.
	}
}
