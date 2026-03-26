// ---------------------------------------------------------------------------
// E2E Auth Helper — generates a valid JWT cookie for authenticated tests
// ---------------------------------------------------------------------------

import { SignJWT } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "claude-hub-jwt-secret-3d25b0945b895796c9801fc48dee075c";

export async function createAuthCookie(): Promise<{
  name: string;
  value: string;
  domain: string;
  path: string;
}> {
  const secret = new TextEncoder().encode(JWT_SECRET);

  const token = await new SignJWT({
    sub: "test-user",
    username: "testuser@test.com",
    gen: 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  return {
    name: "hub_session",
    value: token,
    domain: "localhost",
    path: "/",
  };
}
