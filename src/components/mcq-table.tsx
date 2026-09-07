"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EllipsisVertical, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import type { McqSummary } from "@/lib/services/mcq-service";
import { getCurrentUser } from "@/lib/current-user";
import { deleteMcq, listMcqs } from "@/lib/mcq-client";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

function formatDate(value: string): string {
	const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
	const date = new Date(normalized);

	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function McqTable() {
	const router = useRouter();
	const [mcqs, setMcqs] = useState<McqSummary[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<McqSummary | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		if (!getCurrentUser()) {
			router.replace("/login");
			return;
		}

		let cancelled = false;

		async function load() {
			const result = await listMcqs();
			if (cancelled) return;

			if (result.ok) {
				setMcqs(result.mcqs);
			} else {
				setLoadError(result.message);
			}
			setIsLoading(false);
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [router]);

	async function handleDelete() {
		if (!deleteTarget) return;

		setIsDeleting(true);
		setDeleteError(null);
		const result = await deleteMcq(deleteTarget.id);
		setIsDeleting(false);

		if (!result.ok) {
			setDeleteError(result.message);
			return;
		}

		setMcqs((current) => current.filter((mcq) => mcq.id !== deleteTarget.id));
		setDeleteTarget(null);
	}

	if (isLoading) {
		return <p className="py-12 text-center text-sm text-muted-foreground">Loading questions…</p>;
	}

	if (loadError) {
		return (
			<p role="alert" className="py-12 text-center text-sm text-destructive">
				{loadError}
			</p>
		);
	}

	if (mcqs.length === 0) {
		return (
			<div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-12 text-center">
				<div>
					<h2 className="font-medium">No questions yet</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Create your first multiple-choice question to start the test bank.
					</p>
				</div>
				<Button
					nativeButton={false}
					render={<Link href="/dashboard/mcqs/new" />}
				>
					<Plus data-icon="inline-start" />
					New question
				</Button>
			</div>
		);
	}

	return (
		<>
			<div className="rounded-xl border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Question</TableHead>
							<TableHead className="w-24">Choices</TableHead>
							<TableHead className="w-36">Created</TableHead>
							<TableHead className="w-16 text-right">
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="max-w-56 font-medium">{mcq.name}</TableCell>
								<TableCell className="max-w-md">
									<p className="truncate">{mcq.question}</p>
								</TableCell>
								<TableCell>{mcq.choiceCount}</TableCell>
								<TableCell>{formatDate(mcq.createdAt)}</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Actions for ${mcq.name}`}
												>
													<EllipsisVertical />
												</Button>
											}
										/>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() => router.push(`/dashboard/mcqs/${mcq.id}/edit`)}
											>
												<Pencil />
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => router.push(`/dashboard/mcqs/${mcq.id}/preview`)}
											>
												<Eye />
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													setDeleteError(null);
													setDeleteTarget(mcq);
												}}
											>
												<Trash2 />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open && !isDeleting) {
						setDeleteTarget(null);
						setDeleteError(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this question?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget
								? `“${deleteTarget.name}” and all of its attempts will be permanently deleted.`
								: "This question and all of its attempts will be permanently deleted."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError ? (
						<p role="alert" className="text-sm text-destructive">
							{deleteError}
						</p>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isDeleting}
							onClick={handleDelete}
						>
							{isDeleting ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
