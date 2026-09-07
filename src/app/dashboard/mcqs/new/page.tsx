import { McqForm } from "@/components/mcq-form";

export default function NewMcqPage() {
	return (
		<main className="min-h-svh bg-muted/20">
			<div className="mx-auto max-w-3xl p-6 md:p-10">
				<header className="mb-6">
					<h1 className="text-2xl font-semibold tracking-tight">Create question</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Add a multiple-choice question to the test bank.
					</p>
				</header>
				<McqForm />
			</div>
		</main>
	);
}
