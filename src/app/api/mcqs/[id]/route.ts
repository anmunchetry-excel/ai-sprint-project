import { getCloudflareContext } from "@opennextjs/cloudflare";
import { updateMcqSchema } from "@/lib/schemas/mcq";
import {
	deleteMcq,
	getMcqById,
	updateMcq,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: RouteContext) {
	const { id } = await params;
	const { env } = await getCloudflareContext({ async: true });

	try {
		const mcq = await getMcqById(env.DB, id);
		if (!mcq) {
			return Response.json({ error: { message: "Question not found" } }, { status: 404 });
		}

		return Response.json({ mcq });
	} catch {
		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}

export async function PUT(req: Request, { params }: RouteContext) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
	}

	const parsed = updateMcqSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: { message: "Invalid input", issues: parsed.error.issues } },
			{ status: 400 }
		);
	}

	const { id } = await params;
	const { env } = await getCloudflareContext({ async: true });

	try {
		const mcq = await updateMcq(env.DB, id, parsed.data);
		if (!mcq) {
			return Response.json({ error: { message: "Question not found" } }, { status: 404 });
		}

		return Response.json({ mcq });
	} catch {
		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}

export async function DELETE(_req: Request, { params }: RouteContext) {
	const { id } = await params;
	const { env } = await getCloudflareContext({ async: true });

	try {
		const deleted = await deleteMcq(env.DB, id);
		if (!deleted) {
			return Response.json({ error: { message: "Question not found" } }, { status: 404 });
		}

		return Response.json({ success: true });
	} catch {
		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}
