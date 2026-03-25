// ---------------------------------------------------------------------------
// POST /api/auth/reset — Password reset via token
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, newPassword } = body as {
      token?: string;
      newPassword?: string;
    };

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "token and newPassword are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Verify the reset token exists and is not expired
    const { data: resetToken, error: tokenError } = await supabase
      .from("auth_reset_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle() as { data: { id: string; token: string; expires_at: string; user_id: string } | null; error: any };

    if (tokenError) {
      console.error("[auth/reset] DB token lookup error:", tokenError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    // Check expiration
    const expiresAt = new Date(resetToken.expires_at);
    if (expiresAt < new Date()) {
      // Clean up the expired token
      await supabase
        .from("auth_reset_tokens")
        .delete()
        .eq("token", token);

      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    // Hash the new password and update the user row
    const passwordHash = await hashPassword(newPassword);

    const { error: updateError } = await supabase
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", resetToken.user_id);

    if (updateError) {
      console.error("[auth/reset] DB update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update password" },
        { status: 500 },
      );
    }

    // Delete the used token
    await supabase
      .from("auth_reset_tokens")
      .delete()
      .eq("token", token);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[auth/reset] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
