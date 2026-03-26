// ---------------------------------------------------------------------------
// POST /api/push/subscribe — Store a push subscription
// ---------------------------------------------------------------------------
// Called from the browser after the user grants notification permission.
// Requires cookie auth (standard hub_session).
// Upserts into push_subscriptions table by endpoint.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  // Verify auth via session cookie
  const session = await getSessionFromCookies(
    request.headers.get("cookie")
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing endpoint or keys (p256dh, auth)" },
      { status: 400 }
    );
  }

  // Upsert by endpoint (UNIQUE constraint)
  const { error } = await supabase
    .from("push_subscriptions" as any)
    .upsert(
      {
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("[push/subscribe] Upsert failed:", error);
    return NextResponse.json(
      { error: "Failed to store subscription" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
