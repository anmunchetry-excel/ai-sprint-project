import { LogoutButton } from "@/components/logout-button";

export default function DashboardPage() {
	return (
		<main className="flex min-h-svh flex-col">
			<header className="flex justify-end p-6 md:p-10">
				<LogoutButton />
			</header>
			<div className="flex flex-1 flex-col items-center justify-center p-6 pt-0 md:p-10 md:pt-0">
				<div className="max-w-lg text-center">
					<h1 className="text-3xl font-semibold tracking-tight">MCQ Test Bank</h1>
					<p className="mt-4 text-muted-foreground">Coming soon.</p>
				</div>
			</div>
		</main>
	);
}
