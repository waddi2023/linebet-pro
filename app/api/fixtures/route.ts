import { NextResponse } from "next/server";
import { getFixturesByDate, hasApiKey, ApiFootballError, httpStatusForCode } from "@/lib/apiFootball";
import type { FixtureLite } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

  if (!hasApiKey()) {
    return NextResponse.json(
      { error: "NO_KEY", message: "Clé API-Football non configurée (API_FOOTBALL_KEY)." },
      { status: 503 }
    );
  }

  try {
    const raw = await getFixturesByDate(date);
    const fixtures: FixtureLite[] = raw.map((r) => ({
      id: r.fixture.id,
      date: r.fixture.date,
      timestamp: r.fixture.timestamp,
      statusShort: r.fixture.status.short,
      league: {
        id: r.league.id,
        name: r.league.name,
        country: r.league.country,
        logo: r.league.logo,
        flag: r.league.flag,
        round: r.league.round,
      },
      home: r.teams.home,
      away: r.teams.away,
      goalsHome: r.goals.home,
      goalsAway: r.goals.away,
    }));
    // Trie par championnat puis par heure.
    fixtures.sort((a, b) =>
      a.league.country === b.league.country
        ? a.timestamp - b.timestamp
        : a.league.country.localeCompare(b.league.country)
    );
    return NextResponse.json({ date, count: fixtures.length, fixtures });
  } catch (e) {
    const err = e as ApiFootballError;
    const code = err.code ?? "HTTP";
    return NextResponse.json({ error: code, message: err.message }, { status: httpStatusForCode(code) });
  }
}
