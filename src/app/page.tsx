import Link from "next/link";
import { BookOpenCheck, CheckCircle2, Eye, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Home() {
	return (
		<main className="min-h-svh bg-[radial-gradient(circle_at_top_left,var(--color-muted),transparent_42%)]">
			<header className="border-b bg-background/80 backdrop-blur">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 md:px-10">
					<Link href="/" className="flex items-center gap-2 font-semibold">
						<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<BookOpenCheck className="size-5" />
						</span>
						MCQ Test Bank
					</Link>
					<nav className="flex items-center gap-2" aria-label="Account">
						<Button variant="ghost" render={<Link href="/login" />}>
							Login
						</Button>
						<Button render={<Link href="/register" />}>Register</Button>
					</nav>
				</div>
			</header>

			<section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:px-10 md:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
				<div>
					<div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground shadow-sm">
						<CheckCircle2 className="size-4 text-primary" />
						Simple question authoring and review
					</div>
					<h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
						Build better multiple-choice questions.
					</h1>
					<p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
						Create a reusable question bank, manage answer choices, and preview each
						question exactly as a learner will see it.
					</p>
					<div className="mt-8 flex flex-col gap-3 sm:flex-row">
						<Button size="lg" render={<Link href="/register" />}>
							Create an account
						</Button>
						<Button size="lg" variant="outline" render={<Link href="/login" />}>
							Login to your test bank
						</Button>
					</div>
				</div>

				<div className="grid gap-4">
					<Card>
						<CardHeader>
							<ListPlus className="mb-2 size-6" />
							<CardTitle>Create and organize</CardTitle>
							<CardDescription>
								Write questions with two to six choices and mark one correct answer.
							</CardDescription>
						</CardHeader>
					</Card>
					<Card>
						<CardHeader>
							<Eye className="mb-2 size-6" />
							<CardTitle>Preview like a learner</CardTitle>
							<CardDescription>
								Check the complete answering experience before sharing a question.
							</CardDescription>
						</CardHeader>
					</Card>
					<Card>
						<CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
							<CheckCircle2 className="size-5 shrink-0 text-primary" />
							Correctness is calculated securely from the stored answer choice.
						</CardContent>
					</Card>
				</div>
			</section>
		</main>
	);
}
