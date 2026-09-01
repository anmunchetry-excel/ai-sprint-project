import { getCloudflareContext } from "@opennextjs/cloudflare";
import { registerSchema } from "@/lib/schemas/auth";
import { UserAlreadyExistsError, createUser } from "@/lib/services/user-service";

function conflictMessage(field: "email" | "username"): string {
	return field === "email" ? "Email already registered" : "Username already registered";
}

export async function POST(req: Request) {
	const parsed = registerSchema.safeParse(await req.json());
	if (!parsed.success) {
		return Response.json(
			{ error: { message: "Invalid input", issues: parsed.error.issues } },
			{ status: 400 }
		);
	}

	const { env } = await getCloudflareContext({ async: true });

	try {
		const user = await createUser(env.DB, parsed.data);
		return Response.json({ user }, { status: 201 });
	} catch (error) {
		if (error instanceof UserAlreadyExistsError) {
			return Response.json(
				{
					error: {
						message: conflictMessage(error.field),
						field: error.field,
					},
				},
				{ status: 409 }
			);
		}

		return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
	}
}
