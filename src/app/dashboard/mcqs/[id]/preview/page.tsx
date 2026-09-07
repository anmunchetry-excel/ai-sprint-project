"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { Mcq, McqAttempt } from "@/lib/services/mcq-service";
import { getCurrentUser } from "@/lib/current-user";
import { getMcq, submitAttempt } from "@/lib/mcq-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type PageState =
	| { status: "loading" }
	| { status: "ready"; mcq: Mcq }
	| { status: "error"; message: string };

export default function PreviewMcqPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const [state, setState] = useState<PageState>({ status: "loading" });
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | undefined>();
	const [attempt, setAttempt] = useState<McqAttempt | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!getCurrentUser()) {
			router.replace("/login");
			return;
		}

		let cancelled = false;

		async function load() {
			const result = await getMcq(id);
			if (cancelled) return;

			if (result.ok) {
				setState({ status: "ready", mcq: result.mcq });
			} else {
				setState({ status: "error", message: result.message });
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [id, router]);

	async function handleSubmit() {
		if (!selectedChoiceId || state.status !== "ready") return;

		const currentUser = getCurrentUser();
		if (!currentUser) {
			router.replace("/login");
			return;
		}

		setIsSubmitting(true);
		setSubmitError(null);
		const result = await submitAttempt(id, {
			userId: currentUser.id,
			choiceId: selectedChoiceId,
		});
		setIsSubmitting(false);

		if (result.ok) {
			setAttempt(result.attempt);
		} else {
			setSubmitError(result.message ?? "Please select an answer and try again.");
		}
	}

	function tryAgain() {
		setSelectedChoiceId(undefined);
		setAttempt(null);
		setSubmitError(null);
	}

	return (
		<main className="min-h-svh bg-muted/20">
			<div className="mx-auto max-w-3xl p-6 md:p-10">
				<Button
					variant="ghost"
					nativeButton={false}
					render={<Link href="/dashboard" />}
					className="mb-4"
				>
					<ArrowLeft data-icon="inline-start" />
					Back to questions
				</Button>

				{state.status === "loading" ? (
					<p className="py-16 text-center text-sm text-muted-foreground">
						Loading question…
					</p>
				) : null}

				{state.status === "error" ? (
					<div className="rounded-xl border border-dashed p-10 text-center">
						<p role="alert" className="text-sm text-destructive">
							{state.message}
						</p>
					</div>
				) : null}

				{state.status === "ready" ? (
					<section className="rounded-xl border bg-card p-6 shadow-sm md:p-8">
						<header className="mb-8">
							<p className="text-sm font-medium text-muted-foreground">{state.mcq.name}</p>
							<h1 className="mt-2 text-2xl font-semibold tracking-tight">
								{state.mcq.question}
							</h1>
						</header>

						<RadioGroup
							value={selectedChoiceId}
							onValueChange={setSelectedChoiceId}
							disabled={attempt !== null || isSubmitting}
							aria-label="Answer choices"
							className="gap-3"
						>
							{state.mcq.choices.map((choice) => {
								const isSelected = selectedChoiceId === choice.id;
								const showCorrect = attempt !== null && choice.isCorrect;
								const showIncorrectSelection =
									attempt !== null && isSelected && !choice.isCorrect;

								return (
									<Label
										key={choice.id}
										className={cn(
											"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
											isSelected && !attempt && "border-primary bg-primary/5",
											showCorrect &&
												"border-green-600 bg-green-50 text-green-950 dark:bg-green-950/30 dark:text-green-100",
											showIncorrectSelection &&
												"border-destructive bg-destructive/5 text-destructive",
											attempt && "cursor-default"
										)}
									>
										<RadioGroupItem value={choice.id} />
										<span className="flex-1">{choice.text}</span>
										{showCorrect ? (
											<span className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-300">
												<CheckCircle2 className="size-4" />
												Correct answer
											</span>
										) : null}
										{showIncorrectSelection ? (
											<span className="flex items-center gap-1 text-sm font-medium">
												<XCircle className="size-4" />
												Your answer
											</span>
										) : null}
									</Label>
								);
							})}
						</RadioGroup>

						{attempt ? (
							<div
								role="status"
								className={cn(
									"mt-6 flex items-start gap-3 rounded-lg border p-4",
									attempt.isCorrect
										? "border-green-600 bg-green-50 text-green-950 dark:bg-green-950/30 dark:text-green-100"
										: "border-destructive bg-destructive/5 text-destructive"
								)}
							>
								{attempt.isCorrect ? (
									<CheckCircle2 className="mt-0.5 size-5 shrink-0" />
								) : (
									<XCircle className="mt-0.5 size-5 shrink-0" />
								)}
								<div>
									<p className="font-medium">
										{attempt.isCorrect ? "Correct!" : "Incorrect"}
									</p>
									<p className="mt-1 text-sm">
										{attempt.isCorrect
											? "You selected the correct answer."
											: "The correct answer is highlighted above."}
									</p>
								</div>
							</div>
						) : null}

						{submitError ? (
							<p role="alert" className="mt-4 text-sm text-destructive">
								{submitError}
							</p>
						) : null}

						<div className="mt-8 flex justify-end gap-2">
							{attempt ? (
								<Button type="button" variant="outline" onClick={tryAgain}>
									<RotateCcw data-icon="inline-start" />
									Try again
								</Button>
							) : null}
							<Button
								type="button"
								onClick={handleSubmit}
								disabled={!selectedChoiceId || isSubmitting || attempt !== null}
							>
								{isSubmitting ? "Submitting…" : "Submit answer"}
							</Button>
						</div>
					</section>
				) : null}
			</div>
		</main>
	);
}
