"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { Mcq } from "@/lib/services/mcq-service";
import { getMcq } from "@/lib/mcq-client";
import { McqForm } from "@/components/mcq-form";
import { Button } from "@/components/ui/button";

type PageState =
	| { status: "loading" }
	| { status: "ready"; mcq: Mcq }
	| { status: "error"; message: string };

export default function EditMcqPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const [state, setState] = useState<PageState>({ status: "loading" });

	useEffect(() => {
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
	}, [id]);

	return (
		<main className="min-h-svh bg-muted/20">
			<div className="mx-auto max-w-3xl p-6 md:p-10">
				<header className="mb-6">
					<h1 className="text-2xl font-semibold tracking-tight">Edit question</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Update this question and its available choices.
					</p>
				</header>

				{state.status === "loading" ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						Loading question…
					</p>
				) : null}

				{state.status === "error" ? (
					<div className="rounded-xl border border-dashed p-10 text-center">
						<p role="alert" className="text-sm text-destructive">
							{state.message}
						</p>
						<Button
							className="mt-4"
							variant="outline"
							render={<Link href="/dashboard" />}
						>
							Back to questions
						</Button>
					</div>
				) : null}

				{state.status === "ready" ? <McqForm initialMcq={state.mcq} /> : null}
			</div>
		</main>
	);
}
