"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ZodIssue } from "zod";
import type { Mcq } from "@/lib/services/mcq-service";
import { createMcq, updateMcq } from "@/lib/mcq-client";
import { getCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type ChoiceDraft = {
	key: string;
	text: string;
};

type FieldErrors = {
	name?: string;
	question?: string;
	choices?: string;
	choiceText: Record<number, string>;
};

const emptyErrors: FieldErrors = { choiceText: {} };

function createChoiceDrafts(mcq?: Mcq): ChoiceDraft[] {
	if (mcq) {
		return mcq.choices.map((choice) => ({ key: choice.id, text: choice.text }));
	}

	return [
		{ key: "choice-0", text: "" },
		{ key: "choice-1", text: "" },
	];
}

function mapIssues(issues: ZodIssue[]): FieldErrors {
	const errors: FieldErrors = { choiceText: {} };

	for (const issue of issues) {
		const field = issue.path[0];
		if (field === "name" && !errors.name) errors.name = issue.message;
		if (field === "question" && !errors.question) errors.question = issue.message;

		if (field === "choices") {
			const choiceIndex = issue.path[1];
			if (typeof choiceIndex === "number") {
				if (!errors.choiceText[choiceIndex]) {
					errors.choiceText[choiceIndex] = issue.message;
				}
			} else if (!errors.choices) {
				errors.choices = issue.message;
			}
		}
	}

	return errors;
}

export function McqForm({ initialMcq }: { initialMcq?: Mcq }) {
	const router = useRouter();
	const [name, setName] = useState(initialMcq?.name ?? "");
	const [question, setQuestion] = useState(initialMcq?.question ?? "");
	const [choices, setChoices] = useState<ChoiceDraft[]>(() => createChoiceDrafts(initialMcq));
	const [correctChoiceKey, setCorrectChoiceKey] = useState<string | undefined>(
		() => initialMcq?.choices.find((choice) => choice.isCorrect)?.id
	);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);
	const [formError, setFormError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const nextChoiceNumber = useRef(choices.length);

	useEffect(() => {
		if (!getCurrentUser()) {
			router.replace("/login");
		}
	}, [router]);

	function updateChoice(index: number, text: string) {
		setChoices((current) =>
			current.map((choice, choiceIndex) =>
				choiceIndex === index ? { ...choice, text } : choice
			)
		);
	}

	function addChoice() {
		if (choices.length >= 6) return;

		const key = `choice-${nextChoiceNumber.current}`;
		nextChoiceNumber.current += 1;
		setChoices((current) => [...current, { key, text: "" }]);
	}

	function removeChoice(index: number) {
		if (choices.length <= 2) return;

		const removed = choices[index];
		setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index));
		if (removed.key === correctChoiceKey) setCorrectChoiceKey(undefined);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFieldErrors(emptyErrors);
		setFormError(null);

		const currentUser = getCurrentUser();
		if (!currentUser) {
			router.replace("/login");
			return;
		}

		const choiceInputs = choices.map((choice) => ({
			text: choice.text,
			isCorrect: choice.key === correctChoiceKey,
		}));

		setIsSubmitting(true);
		const result = initialMcq
			? await updateMcq(initialMcq.id, { name, question, choices: choiceInputs })
			: await createMcq({
					name,
					question,
					userId: currentUser.id,
					choices: choiceInputs,
				});
		setIsSubmitting(false);

		if (result.ok) {
			router.push("/dashboard");
			router.refresh();
			return;
		}

		if (result.kind === "validation") {
			setFieldErrors(mapIssues(result.issues));
			return;
		}

		setFormError(result.message);
	}

	return (
		<form
			noValidate
			onSubmit={handleSubmit}
			className="space-y-8 rounded-xl border bg-card p-6 shadow-sm"
		>
			<FieldGroup>
				<Field data-invalid={!!fieldErrors.name}>
					<FieldLabel htmlFor="mcq-name">Name</FieldLabel>
					<Input
						id="mcq-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Photosynthesis basics"
						maxLength={200}
						aria-invalid={!!fieldErrors.name}
					/>
					<FieldDescription>A short internal name for this question.</FieldDescription>
					<FieldError>{fieldErrors.name}</FieldError>
				</Field>

				<Field data-invalid={!!fieldErrors.question}>
					<FieldLabel htmlFor="mcq-question">Question</FieldLabel>
					<Textarea
						id="mcq-question"
						value={question}
						onChange={(event) => setQuestion(event.target.value)}
						placeholder="Which gas do plants absorb during photosynthesis?"
						maxLength={2000}
						rows={4}
						aria-invalid={!!fieldErrors.question}
					/>
					<FieldError>{fieldErrors.question}</FieldError>
				</Field>
			</FieldGroup>

			<FieldSet>
				<div className="flex items-start justify-between gap-4">
					<div>
						<FieldLegend>Choices</FieldLegend>
						<FieldDescription>
							Add 2–6 choices and select exactly one correct answer.
						</FieldDescription>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={addChoice}
						disabled={choices.length >= 6 || isSubmitting}
					>
						<Plus data-icon="inline-start" />
						Add choice
					</Button>
				</div>

				<RadioGroup
					value={correctChoiceKey}
					onValueChange={setCorrectChoiceKey}
					aria-label="Correct answer"
					className="gap-3"
				>
					{choices.map((choice, index) => {
						const choiceError = fieldErrors.choiceText[index];
						const inputId = `choice-${index}-text`;

						return (
							<div
								key={choice.key}
								className="flex items-start gap-3 rounded-lg border p-3"
							>
								<RadioGroupItem
									value={choice.key}
									aria-label={`Mark choice ${index + 1} as correct`}
									className="mt-7"
								/>
								<Field className="flex-1" data-invalid={!!choiceError}>
									<Label htmlFor={inputId}>Choice {index + 1}</Label>
									<Input
										id={inputId}
										value={choice.text}
										onChange={(event) => updateChoice(index, event.target.value)}
										placeholder={`Enter choice ${index + 1}`}
										maxLength={500}
										aria-invalid={!!choiceError}
										disabled={isSubmitting}
									/>
									<FieldError>{choiceError}</FieldError>
								</Field>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="mt-5"
									onClick={() => removeChoice(index)}
									disabled={choices.length <= 2 || isSubmitting}
									aria-label={`Remove choice ${index + 1}`}
								>
									<Trash2 />
								</Button>
							</div>
						);
					})}
				</RadioGroup>
				<FieldError>{fieldErrors.choices}</FieldError>
			</FieldSet>

			{formError ? (
				<p role="alert" className="text-sm text-destructive">
					{formError}
				</p>
			) : null}

			<div className="flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => router.push("/dashboard")}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Saving…" : initialMcq ? "Save changes" : "Create question"}
				</Button>
			</div>
		</form>
	);
}
