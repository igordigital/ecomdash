/**
 * Minimal, dependency-free auth: PBKDF2 password hashing and an
 * HMAC-signed session cookie, both via Web Crypto so the same code runs
 * unmodified in middleware (Edge runtime) and Server Actions (Node) without
 * a runtime split or extra dependency.
 *
 * This is a real login gate, not a mock: passwords are hashed, sessions are
 * signed and unforgeable without the secret, and middleware enforces it on
 * every request. It is not full production auth (no refresh tokens, no
 * Supabase Auth, no per-device revocation) - that lands with the real
 * pipeline. Set SESSION_SECRET in any shared/production environment; the
 * fallback below is fine for local dev only.
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): ArrayBuffer {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out.buffer;
}

const PBKDF2_ITERATIONS = 120_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `${toHex(salt)}:${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits) === hashHex;
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-in-production";
export const SESSION_COOKIE = "ecomdash_session";

export type SessionRole = "admin" | "analyst" | "client";

export interface SessionPayload {
  userId: string;
  name: string;
  role: SessionRole;
  clientId: string | null;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = btoa(JSON.stringify(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${toHex(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sigHex] = token.split(".");
  if (!body || !sigHex) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify("HMAC", key, fromHex(sigHex), encoder.encode(body));
    if (!valid) return null;
    return JSON.parse(atob(body)) as SessionPayload;
  } catch {
    return null;
  }
}
