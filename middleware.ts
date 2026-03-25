import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware to protect routes that require authentication
// Runs on the edge — cannot use Node.js APIs

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/check",
  "/api/auth/logout",
  "/api/health",
  "/login",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon-") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = request.cookies.get("hub_session")?.value;
  if (!token) {
    // API routes get 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Token exists — let the API routes verify it properly
  // (Middleware can't do full JWT verification without Node.js crypto)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
