import { NextResponse } from "next/server";
import { buildAnalysis } from "@/lib/analysis";
import { hasApiKey, ApiFootballError, httpStatusForCode } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("fixture"));

  if (!id || isNaN(id)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Paramètre 'fixture' manquant ou invalide." }, { status: 400 });
  }
  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "NO_KEY", message: "Clé API-Football non configurée (API_FOOTBALL_KEY)." },
      { status: 503 }
    );
  }

  try {
    const analysis = await buildAnalysis(id);
    return NextResponse.json(analysis);
  } catch (e) {
    const err = e as ApiFootballError;
    const code = err.code ?? "HTTP";
    return NextResponse.json({ error: code, message: err.message }, { status: httpStatusForCode(code) });
  }
}
