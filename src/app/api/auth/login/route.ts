import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loginSchema } from "@/lib/schemas/auth";
import { verifyCredentials } from "@/lib/services/user-service";

export async function POST(req: Request) {
	const parsed = loginSchema.safeParse(await req.json());
	if (!parsed.success) {
		return Response.json(
			{ error: { message: "Invalid input", issues: parsed.error.issues } },
			{ status: 400 }
		);
	}

	const { env } = await getCloudflareContext({ async: true });
	const user = await verifyCredentials(env.DB, parsed.data.email, parsed.data.password);

	if (!user) {
		return Response.json({ error: { message: "Invalid email or password" } }, { status: 401 });
	}

	return Response.json({ user }, { status: 200 });
}
