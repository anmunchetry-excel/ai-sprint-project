import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCurrentUser, getCurrentUser, setCurrentUser } from "./current-user";

const values = new Map<string, string>();
const localStorage = {
	getItem: vi.fn((key: string) => values.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => {
		values.set(key, value);
	}),
	removeItem: vi.fn((key: string) => {
		values.delete(key);
	}),
};

const user = {
	id: "user-123",
	email: "teacher@example.com",
	username: "adalovelace",
	firstName: "Ada",
	lastName: "Lovelace",
};

beforeEach(() => {
	values.clear();
	vi.clearAllMocks();
	vi.stubGlobal("window", { localStorage });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("current user storage", () => {
	it("round-trips a user through localStorage", () => {
		setCurrentUser(user);

		expect(getCurrentUser()).toEqual(user);
		expect(localStorage.setItem).toHaveBeenCalledOnce();
	});

	it("returns null when no user is stored", () => {
		expect(getCurrentUser()).toBeNull();
	});

	it("returns null without throwing for malformed JSON", () => {
		values.set("ai-sprint:current-user", "{not-json");

		expect(() => getCurrentUser()).not.toThrow();
		expect(getCurrentUser()).toBeNull();
	});

	it("returns null when stored JSON is not a valid user shape", () => {
		values.set("ai-sprint:current-user", JSON.stringify({ username: "missing-fields" }));

		expect(getCurrentUser()).toBeNull();
	});

	it("removes the current user", () => {
		setCurrentUser(user);

		clearCurrentUser();

		expect(getCurrentUser()).toBeNull();
		expect(localStorage.removeItem).toHaveBeenCalledOnce();
	});
});
