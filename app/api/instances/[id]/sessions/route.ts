// ---------------------------------------------------------------------------
// GET /api/instances/[id]/sessions — List sessions for an instance
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return null;
  }
  return session;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify the instance belongs to this user
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("id")
      .eq("id", id)
      
      .maybeSingle();

    if (instanceError) {
      console.error("[sessions/GET] DB instance lookup error:", instanceError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!instance) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 },
      );
    }

    // Fetch sessions for this instance
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .eq("instance_id", id)
      .order("last_message_at", { ascending: false });

    if (sessionsError) {
      console.error("[sessions/GET] DB sessions error:", sessionsError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ sessions: sessions ?? [] }, { status: 200 });
  } catch (err) {
    console.error("[sessions/GET] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
