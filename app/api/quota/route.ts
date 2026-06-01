import { NextResponse } from "next/server";
import { getStatus, hasApiKey, ApiFootballError, httpStatusForCode } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasApiKey()) {
    return NextResponse.json({ error: "NO_KEY", message: "Clé API non configurée." }, { status: 503 });
  }
  try {
    const status = await getStatus();
    return NextResponse.json(status, {
      // Petit cache pour ne pas re-frapper /status à chaque navigation.
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    const err = e as ApiFootballError;
    const code = err.code ?? "HTTP";
    return NextResponse.json({ error: code, message: err.message }, { status: httpStatusForCode(code) });
  }
}
