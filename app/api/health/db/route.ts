// ---------------------------------------------------------------------------
// GET /api/health/db — Database health check for debugging persistence issues
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(-30) || "NOT SET",
    serviceKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  try {
    // Check 1: Can we query the instances table?
    const { data: instances, error: instError } = await supabase
      .from("instances")
      .select("id")
      .limit(1);

    checks.instancesTable = instError
      ? { error: instError.message }
      : { ok: true, count: instances?.length ?? 0 };

    // Check 2: Can we query the chat_messages table?
    const { data: messages, error: msgError } = await supabase
      .from("chat_messages")
      .select("id, instance_id, role, content, status, created_at")
      .limit(5);

    checks.chatMessagesTable = msgError
      ? { error: msgError.message }
      : { ok: true, count: messages?.length ?? 0 };

    // Check 3: Get total message count
    const { count, error: countError } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact", head: true });

    checks.totalMessages = countError
      ? { error: countError.message }
      : { count };

    // Check 4: Test insert (then delete)
    const testId = `health-check-${Date.now()}`;
    const { data: inserted, error: insertError } = await supabase
      .from("chat_messages")
      .insert({
        id: testId,
        instance_id: "health-check-instance",
        role: "system",
        content: "Health check test message",
        status: "done",
      })
      .select()
      .single();

    if (insertError) {
      // Check if it's a foreign key violation (instance doesn't exist)
      if (insertError.message.includes("foreign key") || insertError.message.includes("violates")) {
        checks.insertTest = {
          error: "Foreign key constraint - need valid instance_id",
          details: insertError.message
        };
      } else {
        checks.insertTest = { error: insertError.message };
      }
    } else {
      checks.insertTest = { ok: true, insertedId: inserted?.id };

      // Clean up test message
      await supabase.from("chat_messages").delete().eq("id", testId);
    }

    // Check 5: List recent messages with their instance IDs
    const { data: recent, error: recentError } = await supabase
      .from("chat_messages")
      .select("id, instance_id, role, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    checks.recentMessages = recentError
      ? { error: recentError.message }
      : recent?.map(m => ({
          id: m.id.slice(0, 8),
          instance: m.instance_id.slice(0, 8),
          role: m.role,
          age: Math.round((Date.now() - new Date(m.created_at).getTime()) / 1000) + "s ago"
        }));

    return NextResponse.json(checks, { status: 200 });
  } catch (err) {
    checks.unexpectedError = err instanceof Error ? err.message : String(err);
    return NextResponse.json(checks, { status: 500 });
  }
}
