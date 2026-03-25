// ---------------------------------------------------------------------------
// GET /api/health — Server health check (no auth required)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { memoryUsage } from "node:process";

export async function GET() {
  try {
    const mem = memoryUsage();

    return NextResponse.json(
      {
        status: "ok",
        uptime: process.uptime(),
        memoryMb: {
          node: Math.round(mem.heapUsed / 1024 / 1024),
          total: Math.round(mem.rss / 1024 / 1024),
          limit: Math.round(mem.heapTotal / 1024 / 1024),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[health] Unexpected error:", err);
    return NextResponse.json(
      { status: "error", error: "Health check failed" },
      { status: 500 },
    );
  }
}
