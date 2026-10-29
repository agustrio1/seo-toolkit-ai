import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const AUTH_HOST = "https://accounts.google.com";
const TOKEN_HOST = "https://oauth2.googleapis.com";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const STATE_COOKIE = "gsc_oauth_state";
const VERIFIER_COOKIE = "gsc_oauth_pkce";

export class GscOAuthError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function gscConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function requireConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !secret || !redirect) throw new GscOAuthError("GSC_NOT_CONFIGURED");
  return { clientId, secret, redirect };
}

function signState(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new GscOAuthError("AUTH_SECRET_MISSING");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyState(signed: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

/** Mulai flow: state terikat userId + nonce, PKCE S256. Cookie 10 menit. */
export async function startGscOAuth(userId: string): Promise<string> {
  const { clientId, redirect } = requireConfig();
  const nonce = randomBytes(16).toString("base64url");
  const state = signState(`${userId}.${nonce}`);
  const verifier = randomBytes(48).toString("base64url");
  const challenge = await sha256base64url(verifier);
  const store = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set(STATE_COOKIE, state, opts);
  store.set(VERIFIER_COOKIE, verifier, opts);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: GSC_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_HOST}/o/oauth2/v2/auth?${params.toString()}`;
}

async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64url");
}

export async function readOauthCookies(): Promise<{ state: string | null; verifier: string | null }> {
  const store = await cookies();
  return {
    state: store.get(STATE_COOKIE)?.value ?? null,
    verifier: store.get(VERIFIER_COOKIE)?.value ?? null,
  };
}

export async function clearOauthCookies() {
  const store = await cookies();
  store.delete(STATE_COOKIE);
  store.delete(VERIFIER_COOKIE);
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Tukar authorization code di server (kode & secret tidak pernah ke client). */
export async function exchangeCode(code: string, verifier: string | null): Promise<GoogleTokens> {
  const { clientId, secret, redirect } = requireConfig();
  const res = await fetch(`${TOKEN_HOST}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: secret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      ...(verifier ? { code_verifier: verifier } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GscOAuthError("TOKEN_EXCHANGE_FAILED");
  return (await res.json()) as GoogleTokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, secret } = requireConfig();
  const res = await fetch(`${TOKEN_HOST}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GscOAuthError("TOKEN_REFRESH_FAILED");
  return (await res.json()) as GoogleTokens;
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  const res = await fetch(`${TOKEN_HOST}/revoke?token=${encodeURIComponent(accessToken)}`, {
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) {
    // Pencabutan di sisi Google gagal — tetap tandai terputus di DB, informasikan ke user.
    throw new GscOAuthError("REVOKE_FAILED");
  }
}
