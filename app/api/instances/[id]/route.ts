// ---------------------------------------------------------------------------
// GET    /api/instances/[id] — Fetch a single instance
// PATCH  /api/instances/[id] — Update an instance
// DELETE /api/instances/[id] — Delete an instance (cascades sessions, messages)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import type { PermissionMode } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return null;
  }
  return session;
}

// ---- GET: Fetch single instance ----

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const { data, error } = await supabase
      .from("instances")
      .select("*")
      .eq("id", id)
      /* single-user: no user_id filter */
      .maybeSingle();

    if (error) {
      console.error("[instances/GET/:id] DB error:", error);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ instance: data }, { status: 200 });
  } catch (err) {
    console.error("[instances/GET/:id] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---- PATCH: Update instance fields ----

export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = await req.json();
    const { name, permissionMode, allowedTools, sortOrder } = body as {
      name?: string;
      permissionMode?: PermissionMode;
      allowedTools?: string[];
      sortOrder?: number;
    };

    // Build update payload — only include provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (permissionMode !== undefined) updates.permission_mode = permissionMode;
    if (allowedTools !== undefined) updates.allowed_tools = allowedTools;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("instances")
      .update(updates)
      .eq("id", id)
      /* single-user: no user_id filter */
      .select()
      .single();

    if (error) {
      console.error("[instances/PATCH/:id] DB error:", error);
      // If no rows matched, single() returns an error
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Instance not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: data }, { status: 200 });
  } catch (err) {
    console.error("[instances/PATCH/:id] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---- DELETE: Remove instance (cascades sessions, messages) ----

export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify ownership first
    const { data: existing, error: fetchError } = await supabase
      .from("instances")
      .select("id")
      .eq("id", id)
      /* single-user: no user_id filter */
      .maybeSingle();

    if (fetchError) {
      console.error("[instances/DELETE/:id] DB fetch error:", fetchError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 },
      );
    }

    const { error: deleteError } = await supabase
      .from("instances")
      .delete()
      .eq("id", id)
      /* single-user: no user_id filter */;

    if (deleteError) {
      console.error("[instances/DELETE/:id] DB delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete instance" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[instances/DELETE/:id] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
