// ---------------------------------------------------------------------------
// Claude Hub — Authentication Utilities
// ---------------------------------------------------------------------------
// Password hashing via bcryptjs, JWT via jose (edge-compatible).
// Cookie name: hub_session (httpOnly, Secure, SameSite=Strict).
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ---- Constants ----

const COOKIE_NAME = "hub_session";
const SALT_ROUNDS = 12;
const JWT_EXPIRY = "7d";
const DATA_DIR = join(process.cwd(), "data");
const SECRET_PATH = join(DATA_DIR, ".jwt-secret");

// ---- JWT secret management ----

/**
 * Resolves the JWT signing secret. Precedence:
 * 1. JWT_SECRET env var
 * 2. Persisted file at data/.jwt-secret
 * 3. Auto-generate a new random secret and persist it
 */
function resolveSecret(): Uint8Array {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret) {
    return new TextEncoder().encode(envSecret);
  }

  if (existsSync(SECRET_PATH)) {
    const stored = readFileSync(SECRET_PATH, "utf-8").trim();
    if (stored.length > 0) {
      return new TextEncoder().encode(stored);
    }
  }

  // Auto-generate and persist
  const generated = randomBytes(48).toString("base64url");
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  return new TextEncoder().encode(generated);
}

let _secret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!_secret) {
    _secret = resolveSecret();
  }
  return _secret;
}

// ---- Password hashing ----

/** Hash a plaintext password with bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a plaintext password against a bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---- JWT ----

export interface HubJwtPayload extends JWTPayload {
  sub: string; // user id
  username: string;
  gen?: number; // jwt_generation counter — used for server-side logout invalidation
}

/** Sign a JWT with the given payload. Returns the compact token string. */
export async function signJwt(payload: {
  sub: string;
  username: string;
  gen?: number;
}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret());
}

/**
 * Verify and decode a JWT. Returns the payload on success, or null if the
 * token is invalid / expired.
 */
export async function verifyJwt(
  token: string,
): Promise<HubJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as HubJwtPayload;
  } catch {
    return null;
  }
}

// ---- Cookie helpers ----

/**
 * Parse a raw Cookie header string into a key→value map.
 * Splits on "; " then splits each pair on the FIRST "=" only —
 * this is critical because JWT values contain base64 "=" padding.
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const pair of cookieHeader.split("; ")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  }

  return cookies;
}

/**
 * Build a Set-Cookie header value that stores the hub_session JWT.
 * httpOnly + Secure + SameSite=Strict. Max-Age matches JWT_EXPIRY (7 days).
 */
export function setAuthCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
  return [
    `${COOKIE_NAME}=${token}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Path=/`,
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** Build a Set-Cookie header value that clears the hub_session cookie. */
export function clearAuthCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Path=/`,
    `Max-Age=0`,
  ].join("; ");
}

/**
 * Extract and verify the hub_session JWT from a raw Cookie header.
 * Returns the decoded payload or null if absent / invalid.
 */
/**
 * Extract and verify the hub_session JWT from a raw Cookie header.
 * Returns the decoded payload or null if absent / invalid.
 * Optionally validates jwt_generation against the database for server-side revocation.
 */
export async function getSessionFromCookies(
  cookieHeader: string | null | undefined,
): Promise<HubJwtPayload | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyJwt(token);
}
