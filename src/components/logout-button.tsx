"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutUser } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleLogout() {
		setError(null);
		setIsSubmitting(true);

		const result = await logoutUser();

		setIsSubmitting(false);

		if (result.ok) {
			router.push("/login");
			return;
		}

		setError(result.message);
	}

	return (
		<div className="flex flex-col items-end gap-2">
			<Button
				type="button"
				variant="outline"
				onClick={handleLogout}
				disabled={isSubmitting}
			>
				{isSubmitting ? "Logging out…" : "Log out"}
			</Button>
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
		</div>
	);
}
