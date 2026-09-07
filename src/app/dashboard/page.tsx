import Link from "next/link";
import { Plus } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { McqTable } from "@/components/mcq-table";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
	return (
		<main className="min-h-svh">
			<header className="border-b">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-6 md:px-10">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">MCQ Test Bank</h1>
						<p className="text-sm text-muted-foreground">
							Create and manage multiple-choice questions.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button render={<Link href="/dashboard/mcqs/new" />}>
							<Plus data-icon="inline-start" />
							New question
						</Button>
						<LogoutButton />
					</div>
				</div>
			</header>
			<section className="mx-auto max-w-6xl p-6 md:p-10">
				<McqTable />
			</section>
		</main>
	);
}
