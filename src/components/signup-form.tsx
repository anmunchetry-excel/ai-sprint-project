"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerUser } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		setFieldErrors({});

		const formData = new FormData(event.currentTarget);
		const password = String(formData.get("password") ?? "");
		const confirmPassword = String(formData.get("confirm-password") ?? "");

		if (password !== confirmPassword) {
			setFieldErrors({ "confirm-password": "Passwords do not match" });
			return;
		}

		setIsSubmitting(true);

		const result = await registerUser({
			email: String(formData.get("email") ?? ""),
			username: String(formData.get("username") ?? ""),
			firstName: String(formData.get("first-name") ?? ""),
			lastName: String(formData.get("last-name") ?? ""),
			password,
		});

		setIsSubmitting(false);

		if (result.ok) {
			router.push("/dashboard");
			return;
		}

		if (result.kind === "validation" || result.kind === "api") {
			const issues = result.issues ?? [];
			const nextErrors: Record<string, string> = {};
			for (const issue of issues) {
				const key = String(issue.path[0] ?? "");
				if (key && !nextErrors[key]) {
					nextErrors[key] = issue.message;
				}
			}
			setFieldErrors(nextErrors);
			if (result.kind === "api" && issues.length === 0) {
				setFormError(result.message);
			}
			return;
		}

		if (result.kind === "conflict") {
			setFieldErrors({ [result.field]: result.message });
			return;
		}

		setFormError(result.message);
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit}>
					<FieldGroup>
						<Field data-invalid={!!fieldErrors.firstName || !!fieldErrors.lastName}>
							<FieldLabel htmlFor="first-name">First Name</FieldLabel>
							<Input
								id="first-name"
								name="first-name"
								type="text"
								placeholder="Ada"
								required
								aria-invalid={!!fieldErrors.firstName}
							/>
							<FieldError>{fieldErrors.firstName}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors.lastName}>
							<FieldLabel htmlFor="last-name">Last Name</FieldLabel>
							<Input
								id="last-name"
								name="last-name"
								type="text"
								placeholder="Lovelace"
								required
								aria-invalid={!!fieldErrors.lastName}
							/>
							<FieldError>{fieldErrors.lastName}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors.username}>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								name="username"
								type="text"
								placeholder="adalovelace"
								required
								aria-invalid={!!fieldErrors.username}
							/>
							<FieldDescription>
								3–30 characters; letters, numbers, underscores, and hyphens only.
							</FieldDescription>
							<FieldError>{fieldErrors.username}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors.email}>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="m@example.com"
								required
								aria-invalid={!!fieldErrors.email}
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email
								with anyone else.
							</FieldDescription>
							<FieldError>{fieldErrors.email}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors.password}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								required
								aria-invalid={!!fieldErrors.password}
							/>
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
							<FieldError>{fieldErrors.password}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors["confirm-password"]}>
							<FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirm-password"
								type="password"
								required
								aria-invalid={!!fieldErrors["confirm-password"]}
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
							<FieldError>{fieldErrors["confirm-password"]}</FieldError>
						</Field>
						{formError ? <FieldError>{formError}</FieldError> : null}
						<FieldGroup>
							<Field>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Creating account…" : "Create Account"}
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account?{" "}
									<Link href="/login" className="underline underline-offset-4">
										Sign in
									</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
