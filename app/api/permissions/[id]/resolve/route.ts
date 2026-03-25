// ---------------------------------------------------------------------------
// POST /api/permissions/[id]/resolve — Approve or deny a pending permission
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: permissionId } = await context.params;

  try {
    const body = await req.json();
    const { action } = body as { action?: "approve" | "deny" };

    if (action !== "approve" && action !== "deny") {
      return NextResponse.json(
        { error: 'action must be "approve" or "deny"' },
        { status: 400 },
      );
    }

    // Fetch the permission request (single-user: no ownership check needed)
    const { data: permission, error: fetchError } = await supabase
      .from("permission_requests")
      .select("*")
      .eq("id", permissionId)
      .maybeSingle() as { data: any; error: any };

    if (fetchError) {
      console.error("[permissions/resolve] DB fetch error:", fetchError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!permission) {
      return NextResponse.json(
        { error: "Permission not found" },
        { status: 404 },
      );
    }

    if (permission.status !== "pending") {
      return NextResponse.json(
        { error: "Permission already resolved" },
        { status: 409 },
      );
    }

    // Update the permission status
    const newStatus = action === "approve" ? "approved" : "denied";

    const { error: updateError } = await supabase
      .from("permission_requests")
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", permissionId);

    if (updateError) {
      console.error("[permissions/resolve] DB update error:", updateError);
      return NextResponse.json(
        { error: "Failed to resolve permission" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, status: newStatus },
      { status: 200 },
    );
  } catch (err) {
    console.error("[permissions/resolve] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
