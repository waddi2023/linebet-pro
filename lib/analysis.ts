// Orchestration de l'analyse complète d'un match (les 8 étapes de l'agent).
import {
  getFixtureById,
  getPrediction,
  getOdds,
  getTopScorers,
  ApiFootballError,
  type RawFixture,
  type RawPrediction,
  type RawOdds,
} from "./apiFootball";
import { simulate, valueOf, rateValue, blendTriples, normalizeTriple } from "./poisson";
import type {
  AnalysisResult,
  FixtureLite,
  MarketRow,
  ProbTriple,
  ScorerRow,
  ConfidenceBreakdown,
} from "./types";

function parsePercent(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace("%", "").trim());
  return isNaN(n) ? 0 : n / 100;
}

function num(s: string | number | null | undefined, fallback = 0): number {
  if (s === null || s === undefined) return fallback;
  const n = typeof s === "number" ? s : parseFloat(String(s));
  return isNaN(n) ? fallback : n;
}

function toFixtureLite(r: RawFixture): FixtureLite {
  return {
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
  };
}

// Expected goals à partir des moyennes saison (attaque domicile vs défense extérieure, etc.).
function expectedGoals(pred: RawPrediction): { home: number; away: number } {
  const h = pred.teams.home.league.goals;
  const a = pred.teams.away.league.goals;
  const homeAttHome = num(h.for.average.home, NaN);
  const awayDefAway = num(a.against.average.away, NaN);
  const awayAttAway = num(a.for.average.away, NaN);
  const homeDefHome = num(h.against.average.home, NaN);

  // Moyenne attaque/défense croisée, avec repli sur les moyennes 5 derniers matchs.
  let lh = avg([homeAttHome, awayDefAway]);
  let la = avg([awayAttAway, homeDefHome]);

  if (!isFinite(lh) || lh <= 0) lh = num(pred.teams.home.last_5.goals.for.average, 1.35);
  if (!isFinite(la) || la <= 0) la = num(pred.teams.away.last_5.goals.for.average, 1.1);

  // Léger avantage du terrain si données trop plates.
  lh = clamp(lh, 0.2, 4.5);
  la = clamp(la, 0.15, 4.0);
  return { home: round2(lh), away: round2(la) };
}

function avg(arr: number[]): number {
  const v = arr.filter((x) => isFinite(x));
  if (!v.length) return NaN;
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}

// --- Extraction des cotes ---
interface OddsBundle {
  home: number | null;
  draw: number | null;
  away: number | null;
  over25: number | null;
  under25: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
  bookmaker: string | null;
}

function bestOdds(odds: RawOdds | null): OddsBundle {
  const out: OddsBundle = {
    home: null, draw: null, away: null,
    over25: null, under25: null, bttsYes: null, bttsNo: null, bookmaker: null,
  };
  if (!odds?.bookmakers?.length) return out;
  // On garde la meilleure cote (la plus élevée) trouvée parmi tous les bookmakers.
  for (const bk of odds.bookmakers) {
    for (const bet of bk.bets) {
      const name = bet.name.toLowerCase();
      for (const v of bet.values) {
        const odd = num(v.odd, NaN);
        if (!isFinite(odd)) continue;
        const val = v.value.toLowerCase();
        if (name === "match winner") {
          if (val === "home") out.home = max(out.home, odd);
          else if (val === "draw") out.draw = max(out.draw, odd);
          else if (val === "away") out.away = max(out.away, odd);
        } else if (name.includes("goals over/under")) {
          if (val === "over 2.5") out.over25 = max(out.over25, odd);
          else if (val === "under 2.5") out.under25 = max(out.under25, odd);
        } else if (name.includes("both teams")) {
          if (val === "yes") out.bttsYes = max(out.bttsYes, odd);
          else if (val === "no") out.bttsNo = max(out.bttsNo, odd);
        }
      }
    }
    if (out.bookmaker === null) out.bookmaker = bk.name;
  }
  return out;
}
function max(a: number | null, b: number) {
  return a === null ? b : Math.max(a, b);
}

function mkRow(market: string, pick: string, prob: number, odd: number | null): MarketRow {
  const value = valueOf(prob, odd);
  return { market, pick, prob, odd: odd ?? null, value, rating: rateValue(value) };
}

// --- Score de confiance (barème de l'agent) ---
function confidence(
  pred: RawPrediction | null,
  model: ProbTriple,
  hasOdds: boolean,
  edge: number
): ConfidenceBreakdown {
  // Chaque critère est noté sur son poids max selon les signaux disponibles.
  const topProb = Math.max(model.home, model.draw, model.away); // 0.33..1

  const formeHome = pred ? parsePercent(pred.comparison?.form?.home) : 0.5;
  const formeGap = Math.abs((formeHome ?? 0.5) - 0.5) * 2; // 0..1
  const forme = 20 * (0.5 + 0.5 * formeGap);

  const attGap = pred ? Math.abs(parsePercent(pred.comparison?.att?.home) - 0.5) * 2 : 0.4;
  const statsAvancees = 20 * (0.4 + 0.6 * clamp(attGap, 0, 1));

  const effectif = 15 * 0.7; // pas d'info blessures fiable via cet endpoint -> base prudente
  const motivation = 10 * 0.7;

  const h2hHome = pred ? parsePercent(pred.comparison?.h2h?.home) : 0;
  const historique = 10 * (h2hHome > 0 ? 0.5 + 0.5 * Math.abs(h2hHome - 0.5) * 2 : 0.5);

  const domicileExterieur = 10 * clamp(0.4 + (topProb - 0.4), 0.3, 1);

  const tactiqueGap = pred ? Math.abs(parsePercent(pred.comparison?.def?.home) - 0.5) * 2 : 0.4;
  const tactique = 10 * (0.4 + 0.6 * clamp(tactiqueGap, 0, 1));

  const marche = hasOdds ? 5 * clamp(0.4 + edge * 2, 0.2, 1) : 5 * 0.4;

  const round1 = (x: number) => Math.round(x * 10) / 10;
  const parts = {
    forme: round1(forme),
    statsAvancees: round1(statsAvancees),
    effectif: round1(effectif),
    motivation: round1(motivation),
    historique: round1(historique),
    domicileExterieur: round1(domicileExterieur),
    tactique: round1(tactique),
    marche: round1(marche),
  };
  const total = Math.round(
    parts.forme + parts.statsAvancees + parts.effectif + parts.motivation +
    parts.historique + parts.domicileExterieur + parts.tactique + parts.marche
  );
  return { ...parts, total };
}

function miseFromConfidence(total: number): string {
  if (total >= 75) return "5% bankroll max (forte confiance)";
  if (total >= 60) return "3% à 4% bankroll (confiance moyenne)";
  return "1% à 2% bankroll (faible confiance)";
}

export async function buildAnalysis(fixtureId: number): Promise<AnalysisResult> {
  const fixtures = await getFixtureById(fixtureId);
  if (!fixtures.length) {
    throw new ApiFootballError("Match introuvable pour cet identifiant.", "EMPTY");
  }
  const fixture = toFixtureLite(fixtures[0]);
  const notes: string[] = [];

  // Predictions (cœur des données).
  let pred: RawPrediction | null = null;
  try {
    pred = await getPrediction(fixtureId);
    if (!pred) notes.push("Aucune prédiction API-Football pour ce match (souvent indisponible hors top championnats).");
  } catch (e) {
    notes.push(`Prédictions indisponibles : ${(e as Error).message}`);
  }

  // Odds (peut être vide pour les matchs lointains).
  let odds: RawOdds | null = null;
  try {
    odds = await getOdds(fixtureId);
    if (!odds) notes.push("Cotes non disponibles (souvent publiées 1 à 7 jours avant le match) — value bets non calculés.");
  } catch (e) {
    notes.push(`Cotes indisponibles : ${(e as Error).message}`);
  }
  const ob = bestOdds(odds);

  // Expected goals + simulation.
  const eg = pred ? expectedGoals(pred) : { home: 1.35, away: 1.15 };
  if (!pred) notes.push("xG estimés par défaut (données équipes indisponibles).");
  const sim = simulate(eg.home, eg.away, 10000);

  // Probas 1X2.
  const prob1x2Model = sim.prob1x2;
  const prob1x2Api: ProbTriple | null = pred
    ? normalizeTriple({
        home: parsePercent(pred.predictions.percent.home),
        draw: parsePercent(pred.predictions.percent.draw),
        away: parsePercent(pred.predictions.percent.away),
      })
    : null;
  const prob1x2 = blendTriples(prob1x2Model, prob1x2Api, prob1x2Api ? 0.5 : 0);

  // Marchés.
  const dc = {
    "1X": prob1x2.home + prob1x2.draw,
    "12": prob1x2.home + prob1x2.away,
    X2: prob1x2.draw + prob1x2.away,
  };
  const ou25 = sim.overUnder.find((o) => o.line === 2.5)!;
  const markets: MarketRow[] = [];

  // 1X2 : on garde le meilleur des 3.
  const tri: { pick: string; prob: number; odd: number | null }[] = [
    { pick: "1 (domicile)", prob: prob1x2.home, odd: ob.home },
    { pick: "N (nul)", prob: prob1x2.draw, odd: ob.draw },
    { pick: "2 (extérieur)", prob: prob1x2.away, odd: ob.away },
  ];
  const best1x2 = tri.slice().sort((a, b) => b.prob - a.prob)[0];
  markets.push(mkRow("1X2", best1x2.pick, best1x2.prob, best1x2.odd));

  // Double chance la plus probable.
  const bestDc = Object.entries(dc).sort((a, b) => b[1] - a[1])[0];
  markets.push(mkRow("Double chance", bestDc[0], bestDc[1], null));

  // Over/Under 2.5.
  if (ou25.over >= ou25.under) markets.push(mkRow("Over/Under", "Over 2.5", ou25.over, ob.over25));
  else markets.push(mkRow("Over/Under", "Under 2.5", ou25.under, ob.under25));

  // BTTS.
  if (sim.btts >= 0.5) markets.push(mkRow("BTTS", "Oui", sim.btts, ob.bttsYes));
  else markets.push(mkRow("BTTS", "Non", 1 - sim.btts, ob.bttsNo));

  // Handicap européen simple : favori -1.
  const favHome = prob1x2.home >= prob1x2.away;
  const handProb = favHome
    ? sim.topScores.filter((s) => diff(s.score) >= 2).reduce((a, b) => a + b.prob, 0)
    : sim.topScores.filter((s) => diff(s.score) <= -2).reduce((a, b) => a + b.prob, 0);
  markets.push(
    mkRow("Handicap", favHome ? "Domicile -1" : "Extérieur -1", clamp(handProb, 0.05, 0.95), null)
  );

  // Buteurs probables (top scorers du championnat, filtrés sur les 2 équipes).
  const scorers: ScorerRow[] = [];
  let scorersOk = false;
  if (pred) {
    try {
      const ts = await getTopScorers(pred.league.id, pred.league.season);
      const ids = new Set([fixture.home.id, fixture.away.id]);
      for (const t of ts) {
        const st = t.statistics.find((s) => ids.has(s.team.id));
        if (st) {
          scorers.push({
            name: t.player.name,
            team: st.team.name,
            goalsSeason: st.goals.total,
            note: "Top buteur du championnat (hors compo officielle)",
          });
        }
        if (scorers.length >= 5) break;
      }
      scorersOk = scorers.length > 0;
    } catch (e) {
      notes.push(`Buteurs indisponibles : ${(e as Error).message}`);
    }
  }
  if (!scorersOk) {
    notes.push("Buteurs probables : nécessite les compositions officielles (publiées ~1h avant le coup d'envoi).");
  }

  // Confiance + verdict.
  const edge = Math.max(0, ...markets.map((m) => m.value ?? 0));
  const conf = confidence(pred, prob1x2, !!ob.bookmaker, edge);

  const valueRows = markets.filter((m) => m.value !== null && (m.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const safest = markets.slice().sort((a, b) => b.prob - a.prob)[0];

  const verdict = {
    meilleurPari: `${best1x2.pick} — ${(best1x2.prob * 100).toFixed(0)}%`,
    pariSur: `${safest.market} : ${safest.pick} — ${(safest.prob * 100).toFixed(0)}%`,
    valueBet: valueRows.length
      ? `${valueRows[0].market} : ${valueRows[0].pick} (value +${((valueRows[0].value ?? 0) * 100).toFixed(1)}%)`
      : "Aucun value bet détecté avec les cotes disponibles",
    risquePrincipal:
      prob1x2.draw > 0.3
        ? "Probabilité de nul élevée — privilégier la double chance"
        : "Volatilité offensive : un seul but peut renverser le pronostic",
    confianceGlobale: conf.total,
    miseRecommandee: miseFromConfidence(conf.total),
  };

  return {
    fixture,
    dataAvailability: {
      predictions: !!pred,
      odds: !!ob.bookmaker,
      scorers: scorersOk,
      notes,
    },
    expectedGoals: eg,
    prob1x2,
    prob1x2Model,
    prob1x2Api,
    simulation: {
      samples: sim.samples,
      avgScore: { home: round2(sim.avgScore.home), away: round2(sim.avgScore.away) },
      topScores: sim.topScores,
      btts: sim.btts,
      overUnder: sim.overUnder,
    },
    markets,
    scorers,
    confidence: conf,
    verdict,
    apiAdvice: pred?.predictions.advice ?? null,
    recentForm: {
      home: {
        form: pred?.teams.home.league.form ?? null,
        lastForGoals: pred?.teams.home.last_5.goals.for.total ?? null,
        lastAgainstGoals: pred?.teams.home.last_5.goals.against.total ?? null,
      },
      away: {
        form: pred?.teams.away.league.form ?? null,
        lastForGoals: pred?.teams.away.last_5.goals.for.total ?? null,
        lastAgainstGoals: pred?.teams.away.last_5.goals.against.total ?? null,
      },
    },
  };
}

function diff(score: string): number {
  const [h, a] = score.split("-").map((x) => parseInt(x, 10));
  return h - a;
}
