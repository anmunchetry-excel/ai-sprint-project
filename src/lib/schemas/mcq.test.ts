import { describe, expect, it } from "vitest";
import { attemptSchema, createMcqSchema, updateMcqSchema } from "./mcq";

function validQuestion() {
	return {
		name: "  Photosynthesis basics  ",
		question: "  Which gas do plants absorb?  ",
		userId: "user-123",
		choices: [
			{ text: "  Carbon dioxide  ", isCorrect: true },
			{ text: "Oxygen", isCorrect: false },
		],
	};
}

function correctnessIssue(input: ReturnType<typeof validQuestion>) {
	const result = createMcqSchema.safeParse(input);

	expect(result.success).toBe(false);
	if (result.success) throw new Error("Expected validation to fail");

	return result.error.issues.find(
		(issue) => issue.message === "Exactly one choice must be marked correct"
	);
}

describe("MCQ validation schemas", () => {
	it("parses and trims a valid question with two choices", () => {
		const result = createMcqSchema.parse(validQuestion());

		expect(result.name).toBe("Photosynthesis basics");
		expect(result.question).toBe("Which gas do plants absorb?");
		expect(result.choices[0].text).toBe("Carbon dioxide");
	});

	it("accepts six choices", () => {
		const input = validQuestion();
		input.choices = Array.from({ length: 6 }, (_, index) => ({
			text: `Choice ${index + 1}`,
			isCorrect: index === 0,
		}));

		expect(createMcqSchema.safeParse(input).success).toBe(true);
	});

	it.each([
		{ count: 1, label: "one" },
		{ count: 7, label: "seven" },
	])("rejects a question with $label choice(s)", ({ count }) => {
		const input = validQuestion();
		input.choices = Array.from({ length: count }, (_, index) => ({
			text: `Choice ${index + 1}`,
			isCorrect: index === 0,
		}));

		expect(createMcqSchema.safeParse(input).success).toBe(false);
	});

	it("rejects zero correct choices with an identifiable choices error", () => {
		const input = validQuestion();
		input.choices = input.choices.map((choice) => ({ ...choice, isCorrect: false }));

		expect(correctnessIssue(input)?.path).toEqual(["choices"]);
	});

	it("rejects multiple correct choices with an identifiable choices error", () => {
		const input = validQuestion();
		input.choices = input.choices.map((choice) => ({ ...choice, isCorrect: true }));

		expect(correctnessIssue(input)?.path).toEqual(["choices"]);
	});

	it.each([
		{
			label: "name",
			change: (input: ReturnType<typeof validQuestion>) => {
				input.name = "   ";
			},
		},
		{
			label: "question",
			change: (input: ReturnType<typeof validQuestion>) => {
				input.question = "   ";
			},
		},
		{
			label: "choice text",
			change: (input: ReturnType<typeof validQuestion>) => {
				input.choices[0].text = "   ";
			},
		},
	])("rejects whitespace-only $label", ({ change }) => {
		const input = validQuestion();
		change(input);

		expect(createMcqSchema.safeParse(input).success).toBe(false);
	});

	it("rejects a name longer than 200 characters", () => {
		const input = validQuestion();
		input.name = "n".repeat(201);

		expect(createMcqSchema.safeParse(input).success).toBe(false);
	});

	it("rejects a question longer than 2000 characters", () => {
		const input = validQuestion();
		input.question = "q".repeat(2001);

		expect(createMcqSchema.safeParse(input).success).toBe(false);
	});

	it("requires a non-empty user id when creating a question", () => {
		const input = validQuestion();
		input.userId = "   ";

		expect(createMcqSchema.safeParse(input).success).toBe(false);
	});

	it("accepts an update without a user id", () => {
		const question = validQuestion();
		const input = {
			name: question.name,
			question: question.question,
			choices: question.choices,
		};

		expect(updateMcqSchema.safeParse(input).success).toBe(true);
	});

	it.each([
		{ input: { choiceId: "choice-123" }, missing: "userId" },
		{ input: { userId: "user-123" }, missing: "choiceId" },
		{ input: { userId: "   ", choiceId: "choice-123" }, missing: "userId" },
		{ input: { userId: "user-123", choiceId: "   " }, missing: "choiceId" },
	])("rejects an attempt with an invalid or missing $missing", ({ input }) => {
		expect(attemptSchema.safeParse(input).success).toBe(false);
	});
});
