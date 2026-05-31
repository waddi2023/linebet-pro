import { NextResponse } from "next/server";
import { buildLiveInsight, listLiveFixtures, scanHotMatches } from "@/lib/live";
import { hasApiKey, ApiFootballError, httpStatusForCode } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fixture = searchParams.get("fixture");
  const mode = searchParams.get("mode");

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "NO_KEY", message: "Clé API-Football non configurée (API_FOOTBALL_KEY)." },
      { status: 503 }
    );
  }

  try {
    if (mode === "hot") {
      const limit = Number(searchParams.get("limit") || 12);
      const scan = await scanHotMatches(limit);
      return NextResponse.json(scan);
    }
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
    const code = err.code ?? "HTTP";
    return NextResponse.json({ error: code, message: err.message }, { status: httpStatusForCode(code) });
  }
}
