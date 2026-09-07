import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createMcq,
	deleteMcq,
	getMcq,
	listMcqs,
	submitAttempt,
	updateMcq,
} from "./mcq-client";

const choices = [
	{
		id: "choice-1",
		text: "Carbon dioxide",
		isCorrect: true,
		position: 0,
		createdAt: "2026-09-08 00:00:00",
		updatedAt: "2026-09-08 00:00:00",
	},
	{
		id: "choice-2",
		text: "Oxygen",
		isCorrect: false,
		position: 1,
		createdAt: "2026-09-08 00:00:00",
		updatedAt: "2026-09-08 00:00:00",
	},
];

const mcq = {
	id: "mcq-1",
	name: "Photosynthesis basics",
	question: "Which gas do plants absorb?",
	createdByUserId: "user-1",
	createdAt: "2026-09-08 00:00:00",
	updatedAt: "2026-09-08 00:00:00",
	choices,
};

const summary = {
	id: mcq.id,
	name: mcq.name,
	question: mcq.question,
	createdByUserId: mcq.createdByUserId,
	choiceCount: 2,
	createdAt: mcq.createdAt,
	updatedAt: mcq.updatedAt,
};

const createInput = {
	name: mcq.name,
	question: mcq.question,
	userId: "user-1",
	choices: choices.map(({ text, isCorrect }) => ({ text, isCorrect })),
};

const updateInput = {
	name: "Updated photosynthesis",
	question: mcq.question,
	choices: createInput.choices,
};

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("MCQ browser client", () => {
	it("listMcqs returns the parsed questions on 200", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ mcqs: [summary] }), { status: 200 })
		);

		const result = await listMcqs();

		expect(result).toEqual({ ok: true, mcqs: [summary] });
		expect(fetch).toHaveBeenCalledWith("/api/mcqs", { method: "GET" });
	});

	it("createMcq returns the created question on 201", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ mcq }), { status: 201 })
		);

		const result = await createMcq(createInput);

		expect(result).toEqual({ ok: true, mcq });
		expect(fetch).toHaveBeenCalledOnce();
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe("/api/mcqs");
		expect(init).toMatchObject({
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(JSON.parse(String(init?.body))).toEqual(createInput);
	});

	it("createMcq validates before calling fetch", async () => {
		const result = await createMcq({
			...createInput,
			choices: createInput.choices.slice(0, 1),
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.kind).toBe("validation");
			expect(result).toHaveProperty("issues");
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it("createMcq maps a 400 response to validation issues", async () => {
		const issues = [{ code: "custom", path: ["choices"], message: "Exactly one is required" }];
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Invalid input", issues } }), {
				status: 400,
			})
		);

		const result = await createMcq(createInput);

		expect(result).toEqual({
			ok: false,
			kind: "validation",
			message: "Invalid input",
			issues,
		});
	});

	it("getMcq maps a 404 response to not found", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Question not found" } }), {
				status: 404,
			})
		);

		const result = await getMcq("missing");

		expect(result).toEqual({
			ok: false,
			kind: "notFound",
			message: "Question not found",
		});
	});

	it("updateMcq returns the updated question on 200", async () => {
		const updated = { ...mcq, name: updateInput.name };
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ mcq: updated }), { status: 200 })
		);

		const result = await updateMcq(mcq.id, updateInput);

		expect(result).toEqual({ ok: true, mcq: updated });
		expect(fetch).toHaveBeenCalledWith(`/api/mcqs/${mcq.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updateInput),
		});
	});

	it("deleteMcq returns success on 200", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ success: true }), { status: 200 })
		);

		await expect(deleteMcq(mcq.id)).resolves.toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledWith(`/api/mcqs/${mcq.id}`, { method: "DELETE" });
	});

	it("deleteMcq maps a 404 response to not found", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "Question not found" } }), {
				status: 404,
			})
		);

		await expect(deleteMcq("missing")).resolves.toEqual({
			ok: false,
			kind: "notFound",
			message: "Question not found",
		});
	});

	it("submitAttempt returns the recorded attempt on 201", async () => {
		const attempt = {
			id: "attempt-1",
			mcqId: mcq.id,
			choiceId: choices[0].id,
			userId: "user-1",
			isCorrect: true,
			createdAt: "2026-09-08 00:00:00",
		};
		const input = { userId: "user-1", choiceId: choices[0].id };
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ attempt }), { status: 201 })
		);

		const result = await submitAttempt(mcq.id, input);

		expect(result).toEqual({ ok: true, attempt });
		expect(fetch).toHaveBeenCalledWith(`/api/mcqs/${mcq.id}/attempts`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
	});

	it.each([
		{ label: "listMcqs", call: () => listMcqs() },
		{ label: "getMcq", call: () => getMcq(mcq.id) },
		{ label: "createMcq", call: () => createMcq(createInput) },
		{ label: "updateMcq", call: () => updateMcq(mcq.id, updateInput) },
		{ label: "deleteMcq", call: () => deleteMcq(mcq.id) },
		{
			label: "submitAttempt",
			call: () => submitAttempt(mcq.id, { userId: "user-1", choiceId: choices[0].id }),
		},
	])("$label hides server details on 500", async ({ call }) => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({ error: { message: "sensitive database implementation detail" } }),
				{ status: 500 }
			)
		);

		await expect(call()).resolves.toEqual({
			ok: false,
			kind: "server",
			message: "Something went wrong",
		});
	});
});
