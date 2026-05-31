import { NextResponse } from "next/server";
import { buildLiveInsight, listLiveFixtures } from "@/lib/live";
import { hasApiKey, ApiFootballError } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture");

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "NO_KEY", message: "Clé API-Football non configurée (API_FOOTBALL_KEY)." },
      { status: 503 }
    );
  }

  try {
    if (fixture) {
      const id = Number(fixture);
      if (!id || isNaN(id)) {
        return NextResponse.json({ error: "BAD_REQUEST", message: "Paramètre 'fixture' invalide." }, { status: 400 });
      }
      const insight = await buildLiveInsight(id);
      return NextResponse.json(insight);
    }
    // Sinon : liste des matchs en direct.
    const list = await listLiveFixtures();
    return NextResponse.json({ count: list.length, fixtures: list });
  } catch (e) {
    const err = e as ApiFootballError;
    return NextResponse.json({ error: err.code ?? "HTTP", message: err.message }, { status: 502 });
  }
}
