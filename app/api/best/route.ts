import { NextResponse } from "next/server";
import { scanBestBets } from "@/lib/bestBets";
import { hasApiKey, ApiFootballError } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const scanLimit = Number(searchParams.get("scan") || 12);
  const returnN = Number(searchParams.get("top") || 8);
  const leagueId = searchParams.get("league") ? Number(searchParams.get("league")) : undefined;

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "NO_KEY", message: "Clé API-Football non configurée (API_FOOTBALL_KEY)." },
      { status: 503 }
    );
  }

  try {
    const result = await scanBestBets(date, { scanLimit, returnN, leagueId });
    return NextResponse.json(result);
  } catch (e) {
    const err = e as ApiFootballError;
    return NextResponse.json({ error: err.code ?? "HTTP", message: err.message }, { status: 502 });
  }
}
