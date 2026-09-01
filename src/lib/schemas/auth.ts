import { z } from "zod";

export const registerSchema = z.object({
	email: z.string().trim().toLowerCase().email(),
	username: z
		.string()
		.trim()
		.toLowerCase()
		.min(3)
		.max(30)
		.regex(/^[a-z0-9_-]+$/),
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
	email: z.string().trim().toLowerCase().email(),
	password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
