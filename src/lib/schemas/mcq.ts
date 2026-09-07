import { z } from "zod";

export const mcqChoiceSchema = z.object({
	text: z
		.string()
		.trim()
		.min(1, "Choice text is required")
		.max(500, "Choice text must be 500 characters or fewer"),
	isCorrect: z.boolean(),
});

export const mcqChoicesSchema = z
	.array(mcqChoiceSchema)
	.min(2, "A question needs at least 2 choices")
	.max(6, "A question can have at most 6 choices")
	.refine((choices) => choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be marked correct",
	});

const mcqFields = {
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(200, "Name must be 200 characters or fewer"),
	question: z
		.string()
		.trim()
		.min(1, "Question is required")
		.max(2000, "Question must be 2000 characters or fewer"),
	choices: mcqChoicesSchema,
};

export const createMcqSchema = z.object({
	...mcqFields,
	userId: z.string().trim().min(1, "User id is required"),
});

export const updateMcqSchema = z.object(mcqFields);

export const attemptSchema = z.object({
	userId: z.string().trim().min(1, "User id is required"),
	choiceId: z.string().trim().min(1, "Choice id is required"),
});

export type McqChoiceInput = z.infer<typeof mcqChoiceSchema>;
export type CreateMcqInput = z.infer<typeof createMcqSchema>;
export type UpdateMcqInput = z.infer<typeof updateMcqSchema>;
export type AttemptInput = z.infer<typeof attemptSchema>;
