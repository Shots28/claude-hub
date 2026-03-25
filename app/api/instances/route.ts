// ---------------------------------------------------------------------------
// GET  /api/instances — List all instances
// POST /api/instances — Create a new instance
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import type { PermissionMode } from "@/lib/types";

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return null;
  }
  return session;
}

// ---- GET: List all instances ----

export async function GET(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Single-user app — no user_id filter needed
    const { data, error } = await supabase
      .from("instances")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[instances/GET] DB error:", error);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ instances: data }, { status: 200 });
  } catch (err) {
    console.error("[instances/GET] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---- POST: Create a new instance ----

export async function POST(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, repoPath, permissionMode, allowedTools } = body as {
      name?: string;
      repoPath?: string;
      permissionMode?: PermissionMode;
      allowedTools?: string[];
    };

    if (!name || !repoPath) {
      return NextResponse.json(
        { error: "name and repoPath are required" },
        { status: 400 },
      );
    }

    const id = randomUUID();

    // Single-user app — no user_id needed
    const { data, error } = await (supabase
      .from("instances") as any)
      .insert({
        id,
        name,
        repo_path: repoPath,
        permission_mode: permissionMode ?? "auto",
        allowed_tools: JSON.stringify(allowedTools ?? []),
        status: "stopped",
      })
      .select()
      .single();

    if (error) {
      console.error("[instances/POST] DB insert error:", error);
      return NextResponse.json(
        { error: "Failed to create instance" },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: data }, { status: 201 });
  } catch (err) {
    console.error("[instances/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
