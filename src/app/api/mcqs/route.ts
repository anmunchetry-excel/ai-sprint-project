import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createMcqSchema } from "@/lib/schemas/mcq";
import {
	McqUserNotFoundError,
	createMcq,
	listMcqs,
} from "@/lib/services/mcq-service";

export async function GET() {
	const { env } = await getCloudflareContext({ async: true });

	try {
		const mcqs = await listMcqs(env.DB);
		return Response.json({ mcqs });
	} catch {
		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
	}

	const parsed = createMcqSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: { message: "Invalid input", issues: parsed.error.issues } },
			{ status: 400 }
		);
	}

	const { env } = await getCloudflareContext({ async: true });

	try {
		const mcq = await createMcq(env.DB, parsed.data);
		return Response.json({ mcq }, { status: 201 });
	} catch (error) {
		if (error instanceof McqUserNotFoundError) {
			return Response.json({ error: { message: error.message } }, { status: 404 });
		}

		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}
