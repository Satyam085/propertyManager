import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";

// Single-owner auth: one password (Worker secret) + an HMAC-signed, expiring session cookie.
const COOKIE = "pm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, so the installed PWA stays signed in
const enc = new TextEncoder();

function secret() {
  // fail closed if secrets are missing or weak
  if (!env.APP_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error("APP_PASSWORD and SESSION_SECRET (>= 32 chars) must be set");
  }
  return crypto.subtle.importKey(
    "raw",
    enc.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function checkPassword(input: string) {
  await secret();
  const [a, b] = await Promise.all(
    [input, env.APP_PASSWORD].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))),
  );
  // constant-time compare of fixed-length digests
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function sessionCookie() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  const sig = b64url(await crypto.subtle.sign("HMAC", await secret(), enc.encode(exp)));
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function isAuthed(request: Request) {
  const m = request.headers.get("cookie")?.match(/(?:^|;\s*)pm_session=(\d+)\.([\w-]+)/);
  if (!m || Number(m[1]) < Date.now()) return false;
  try {
    return await crypto.subtle.verify("HMAC", await secret(), unb64url(m[2]), enc.encode(m[1]));
  } catch {
    return false;
  }
}

/** Per-IP login throttle (Workers Rate Limiting binding: 5 tries / minute). */
export async function loginAllowed(request: Request) {
  const key = request.headers.get("cf-connecting-ip") ?? "local";
  return (await env.LOGIN_LIMIT.limit({ key })).success;
}
