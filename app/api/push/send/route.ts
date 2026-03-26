// ---------------------------------------------------------------------------
// POST /api/push/send — Send push notifications to all subscribers
// ---------------------------------------------------------------------------
// Called by the bridge (server.ts) with Bearer token auth.
// This endpoint is in PUBLIC_PATHS in middleware.ts — auth is handled
// internally via PUSH_API_SECRET, not the hub_session cookie.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPushNotification, type PushPayload } from "@/lib/push-server";
import { timingSafeEqual } from "node:crypto";

function verifyBearerToken(request: NextRequest): boolean {
  const secret = process.env.PUSH_API_SECRET;
  if (!secret) {
    console.warn("[push/send] PUSH_API_SECRET not configured");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);

  // timingSafeEqual requires equal-length buffers — check lengths first
  const expected = Buffer.from(secret, "utf-8");
  const received = Buffer.from(token, "utf-8");

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export async function POST(request: NextRequest) {
  // Auth check FIRST — return 401 immediately before any work
  if (!verifyBearerToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, body: notifBody, instanceId, tag } = body;
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  // Fetch all push subscriptions
  const { data: subscriptions, error: fetchErr } = await supabase
    .from("push_subscriptions" as any)
    .select("endpoint, keys_p256dh, keys_auth");

  if (fetchErr) {
    console.error("[push/send] Failed to fetch subscriptions:", fetchErr);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }

  if (!subscriptions?.length) {
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  const payload: PushPayload = {
    title,
    body: notifBody || "",
    instanceId: instanceId || undefined,
    tag: tag || undefined,
  };

  let sent = 0;
  let failed = 0;
  const staleEndpoints: string[] = [];

  // Send to all subscribers in parallel
  await Promise.all(
    subscriptions.map(async (sub: any) => {
      const result = await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        payload
      );

      if (result.success) {
        sent++;
      } else {
        failed++;
        if (result.gone) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up stale subscriptions (410 Gone)
  if (staleEndpoints.length > 0) {
    const { error: deleteErr } = await supabase
      .from("push_subscriptions" as any)
      .delete()
      .in("endpoint", staleEndpoints);

    if (deleteErr) {
      console.error("[push/send] Failed to delete stale subs:", deleteErr);
    } else {
      console.log(`[push/send] Deleted ${staleEndpoints.length} stale subscriptions`);
    }
  }

  return NextResponse.json({ sent, failed });
}
