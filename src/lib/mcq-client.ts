import type { ZodIssue } from "zod";
import {
	attemptSchema,
	createMcqSchema,
	updateMcqSchema,
	type AttemptInput,
	type CreateMcqInput,
	type UpdateMcqInput,
} from "@/lib/schemas/mcq";
import type { Mcq, McqAttempt, McqSummary } from "@/lib/services/mcq-service";

type ValidationFailure = {
	ok: false;
	kind: "validation";
	issues: ZodIssue[];
	message?: string;
};

type NotFoundFailure = {
	ok: false;
	kind: "notFound";
	message: string;
};

type ApiFailure = {
	ok: false;
	kind: "api";
	message: string;
	issues?: ZodIssue[];
};

type ServerFailure = {
	ok: false;
	kind: "server";
	message: string;
};

type ApiErrorBody = {
	error?: {
		message?: string;
		issues?: ZodIssue[];
	};
};

type ApiBody = ApiErrorBody & {
	mcqs?: McqSummary[];
	mcq?: Mcq;
	attempt?: McqAttempt;
};

export type ListMcqsResult =
	| { ok: true; mcqs: McqSummary[] }
	| ServerFailure;

export type GetMcqResult =
	| { ok: true; mcq: Mcq }
	| NotFoundFailure
	| ServerFailure;

export type CreateMcqResult =
	| { ok: true; mcq: Mcq }
	| ValidationFailure
	| NotFoundFailure
	| ServerFailure;

export type UpdateMcqResult =
	| { ok: true; mcq: Mcq }
	| ValidationFailure
	| NotFoundFailure
	| ServerFailure;

export type DeleteMcqResult =
	| { ok: true }
	| NotFoundFailure
	| ServerFailure;

export type SubmitAttemptResult =
	| { ok: true; attempt: McqAttempt }
	| ValidationFailure
	| ApiFailure
	| NotFoundFailure
	| ServerFailure;

const serverFailure: ServerFailure = {
	ok: false,
	kind: "server",
	message: "Something went wrong",
};

async function request(url: string, init: RequestInit): Promise<{
	response: Response;
	body: ApiBody;
} | null> {
	try {
		const response = await fetch(url, init);
		let body: ApiBody = {};

		try {
			body = (await response.json()) as ApiBody;
		} catch {
			// An unreadable response is handled as a generic server failure.
		}

		return { response, body };
	} catch {
		return null;
	}
}

function notFound(body: ApiBody, fallback: string): NotFoundFailure {
	return {
		ok: false,
		kind: "notFound",
		message: body.error?.message ?? fallback,
	};
}

export async function listMcqs(): Promise<ListMcqsResult> {
	const result = await request("/api/mcqs", { method: "GET" });
	if (!result || !result.response.ok || !result.body.mcqs) return serverFailure;

	return { ok: true, mcqs: result.body.mcqs };
}

export async function getMcq(id: string): Promise<GetMcqResult> {
	const result = await request(`/api/mcqs/${encodeURIComponent(id)}`, { method: "GET" });
	if (!result) return serverFailure;
	if (result.response.status === 404) return notFound(result.body, "Question not found");
	if (!result.response.ok || !result.body.mcq) return serverFailure;

	return { ok: true, mcq: result.body.mcq };
}

export async function createMcq(input: CreateMcqInput): Promise<CreateMcqResult> {
	const parsed = createMcqSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, kind: "validation", issues: parsed.error.issues };
	}

	const result = await request("/api/mcqs", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
	});
	if (!result) return serverFailure;

	if (result.response.status === 400) {
		return {
			ok: false,
			kind: "validation",
			message: result.body.error?.message ?? "Invalid input",
			issues: result.body.error?.issues ?? [],
		};
	}
	if (result.response.status === 404) return notFound(result.body, "User not found");
	if (!result.response.ok || !result.body.mcq) return serverFailure;

	return { ok: true, mcq: result.body.mcq };
}

export async function updateMcq(
	id: string,
	input: UpdateMcqInput
): Promise<UpdateMcqResult> {
	const parsed = updateMcqSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, kind: "validation", issues: parsed.error.issues };
	}

	const result = await request(`/api/mcqs/${encodeURIComponent(id)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
	});
	if (!result) return serverFailure;

	if (result.response.status === 400) {
		return {
			ok: false,
			kind: "validation",
			message: result.body.error?.message ?? "Invalid input",
			issues: result.body.error?.issues ?? [],
		};
	}
	if (result.response.status === 404) return notFound(result.body, "Question not found");
	if (!result.response.ok || !result.body.mcq) return serverFailure;

	return { ok: true, mcq: result.body.mcq };
}

export async function deleteMcq(id: string): Promise<DeleteMcqResult> {
	const result = await request(`/api/mcqs/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	if (!result) return serverFailure;
	if (result.response.status === 404) return notFound(result.body, "Question not found");
	if (!result.response.ok) return serverFailure;

	return { ok: true };
}

export async function submitAttempt(
	id: string,
	input: AttemptInput
): Promise<SubmitAttemptResult> {
	const parsed = attemptSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, kind: "validation", issues: parsed.error.issues };
	}

	const result = await request(`/api/mcqs/${encodeURIComponent(id)}/attempts`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(parsed.data),
	});
	if (!result) return serverFailure;

	if (result.response.status === 400) {
		return {
			ok: false,
			kind: "api",
			message: result.body.error?.message ?? "Invalid input",
			issues: result.body.error?.issues,
		};
	}
	if (result.response.status === 404) return notFound(result.body, "Question not found");
	if (!result.response.ok || !result.body.attempt) return serverFailure;

	return { ok: true, attempt: result.body.attempt };
}
