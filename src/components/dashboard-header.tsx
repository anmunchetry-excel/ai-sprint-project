"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getCurrentUser } from "@/lib/current-user";
import { LogoutButton } from "@/components/logout-button";

function subscribeToStorage(onStoreChange: () => void) {
	window.addEventListener("storage", onStoreChange);
	return () => window.removeEventListener("storage", onStoreChange);
}

function getUsernameSnapshot() {
	return getCurrentUser()?.username ?? null;
}

export function DashboardHeader() {
	const router = useRouter();
	const username = useSyncExternalStore(subscribeToStorage, getUsernameSnapshot, () => null);

	useEffect(() => {
		if (!username) {
			router.replace("/login");
		}
	}, [router, username]);

	if (!username) {
		return (
			<header className="border-b" aria-hidden>
				<div className="mx-auto grid max-w-6xl gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center md:px-10">
					<div className="h-9 w-64 animate-pulse rounded bg-muted sm:col-start-1 sm:row-start-1" />
					<div className="h-7 w-40 animate-pulse rounded bg-muted justify-self-center sm:col-start-2 sm:row-start-1" />
				</div>
			</header>
		);
	}

	return (
		<header className="border-b">
			<div className="mx-auto grid max-w-6xl gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center md:px-10">
				<h1 className="text-center text-2xl font-semibold tracking-tight sm:col-start-2 sm:row-start-1">
					MCQ Test Bank
				</h1>
				<p className="text-left text-3xl font-semibold tracking-tight text-foreground sm:col-start-1 sm:row-start-1">
					Welcome, {username}
				</p>
				<div className="flex items-center justify-center gap-2 sm:col-start-3 sm:row-start-1 sm:justify-self-end">
					<LogoutButton />
				</div>
			</div>
		</header>
	);
}
