const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await derive(password, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4) return false;

	const [algo, iterationsStr, saltHex, hashHex] = parts;
	if (algo !== "pbkdf2") return false;

	const iterations = Number(iterationsStr);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;

	const salt = fromHex(saltHex);
	const expectedHash = fromHex(hashHex);
	if (salt === null || expectedHash === null) return false;

	const derived = await derive(password, salt, iterations);
	return timingSafeEqual(derived, expectedHash);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"]
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" },
		keyMaterial,
		HASH_BITS
	);
	return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array | null {
	if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}
