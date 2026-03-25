// ---------------------------------------------------------------------------
// POST /api/transcribe — Transcribe audio using OpenAI Whisper API
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured for transcription" },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append("file", audio, "recording.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "text");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: whisperForm,
      },
    );

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("[transcribe] Whisper error:", errText);
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 500 },
      );
    }

    const text = await whisperRes.text();
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error("[transcribe] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
