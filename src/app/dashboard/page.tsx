import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard-header";
import { McqTable } from "@/components/mcq-table";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
	return (
		<main className="min-h-svh">
			<DashboardHeader />
			<section className="mx-auto max-w-6xl p-6 md:p-10">
				<div className="mb-6 flex justify-end">
					<Button
						nativeButton={false}
						render={<Link href="/dashboard/mcqs/new" />}
					>
						<Plus data-icon="inline-start" />
						New question
					</Button>
				</div>
				<McqTable />
			</section>
		</main>
	);
}
