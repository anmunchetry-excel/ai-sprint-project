import { getCloudflareContext } from "@opennextjs/cloudflare";
import { attemptSchema } from "@/lib/schemas/mcq";
import {
	ChoiceNotForMcqError,
	McqChoiceNotFoundError,
	McqNotFoundError,
	McqUserNotFoundError,
	recordAttempt,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: RouteContext) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: { message: "Invalid JSON" } }, { status: 400 });
	}

	const parsed = attemptSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: { message: "Invalid input", issues: parsed.error.issues } },
			{ status: 400 }
		);
	}

	const { id } = await params;
	const { env } = await getCloudflareContext({ async: true });

	try {
		const attempt = await recordAttempt(env.DB, id, parsed.data);
		return Response.json({ attempt }, { status: 201 });
	} catch (error) {
		if (error instanceof ChoiceNotForMcqError) {
			return Response.json({ error: { message: error.message } }, { status: 400 });
		}

		if (
			error instanceof McqNotFoundError ||
			error instanceof McqChoiceNotFoundError ||
			error instanceof McqUserNotFoundError
		) {
			return Response.json({ error: { message: error.message } }, { status: 404 });
		}

		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}
