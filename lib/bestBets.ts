// Scanner « meilleurs paris du jour » : analyse légère (1 requête /predictions par match)
// pour classer les matchs par meilleure probabilité + confiance.
import { getFixturesByDate, getPrediction, type RawFixture } from "./apiFootball";
import { parsePercent, expectedGoals, confidence, toFixtureLite } from "./analysis";
import { simulate, normalizeTriple, blendTriples } from "./poisson";
import type { FixtureLite, ProbTriple } from "./types";

// Grands championnats prioritaires (IDs API-Football). Le scan les privilégie,
// puis complète avec d'autres matchs si nécessaire.
const TOP_LEAGUES = new Set<number>([
  2, 3, 848, // Champions League, Europa League, Conference League
  39, 140, 135, 78, 61, // Premier League, LaLiga, Serie A, Bundesliga, Ligue 1
  88, 94, 144, 203, 197, 179, // Eredivisie, Primeira, Belgique, Turquie, Grèce, Écosse
  71, 128, 253, 262, // Brésil, Argentine, MLS, Liga MX
  98, 188, 307, 233, // J-League, A-League, Saudi, Égypte
  40, 141, 136, 79, 62, // 2e divisions Angleterre/Espagne/Italie/Allemagne/France
]);

export interface PickChoice {
  market: string;
  selection: string;
  prob: number;
}

export interface BestPick {
  fixture: FixtureLite;
  expectedGoals: { home: number; away: number };
  prob1x2: ProbTriple;
  safest: PickChoice; // marché le plus probable (le plus sûr)
  result1x2: PickChoice; // issue 1X2 la plus probable
  goals: PickChoice; // Over/Under conseillé
  btts: PickChoice;
  confidence: number;
  advice: string | null;
  score: number; // score de classement interne
}

export interface BestBetsResult {
  date: string;
  scanned: number; // matchs effectivement analysés (≈ requêtes consommées + 1)
  totalFixtures: number;
  picks: BestPick[];
  coupon: {
    legs: { label: string; prob: number; fixtureId: number }[];
    combinedProb: number;
  } | null;
  notes: string[];
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

function buildPick(fx: FixtureLite, pred: NonNullable<Awaited<ReturnType<typeof getPrediction>>>): BestPick {
  const eg = expectedGoals(pred);
  const sim = simulate(eg.home, eg.away, 8000);

  const apiTriple: ProbTriple = normalizeTriple({
    home: parsePercent(pred.predictions.percent.home),
    draw: parsePercent(pred.predictions.percent.draw),
    away: parsePercent(pred.predictions.percent.away),
  });
  const prob1x2 = blendTriples(sim.prob1x2, apiTriple, 0.5);

  // Issue 1X2 la plus probable.
  const tri: PickChoice[] = [
    { market: "1X2", selection: `1 · ${fx.home.name}`, prob: prob1x2.home },
    { market: "1X2", selection: "N · Nul", prob: prob1x2.draw },
    { market: "1X2", selection: `2 · ${fx.away.name}`, prob: prob1x2.away },
  ].sort((a, b) => b.prob - a.prob);
  const result1x2 = tri[0];

  // Double chance la plus probable.
  const dc: PickChoice[] = [
    { market: "Double chance", selection: `1X · ${fx.home.name} ou Nul`, prob: prob1x2.home + prob1x2.draw },
    { market: "Double chance", selection: "12 · Pas de nul", prob: prob1x2.home + prob1x2.away },
    { market: "Double chance", selection: `X2 · Nul ou ${fx.away.name}`, prob: prob1x2.draw + prob1x2.away },
  ].sort((a, b) => b.prob - a.prob);

  // Over/Under conseillé (la ligne 1.5 ou 2.5 selon ce qui est le plus sûr).
  const ou15 = sim.overUnder.find((o) => o.line === 1.5)!;
  const ou25 = sim.overUnder.find((o) => o.line === 2.5)!;
  const goalsCandidates: PickChoice[] = [
    { market: "Buts", selection: "Over 1.5", prob: ou15.over },
    { market: "Buts", selection: "Under 1.5", prob: ou15.under },
    { market: "Buts", selection: "Over 2.5", prob: ou25.over },
    { market: "Buts", selection: "Under 2.5", prob: ou25.under },
  ].sort((a, b) => b.prob - a.prob);
  const goals = goalsCandidates[0];

  const btts: PickChoice =
    sim.btts >= 0.5
      ? { market: "BTTS", selection: "Oui", prob: sim.btts }
      : { market: "BTTS", selection: "Non", prob: 1 - sim.btts };

  // Le pari "le plus sûr" = la plus haute proba parmi double chance / O/U / BTTS / 1X2.
  const safest = [dc[0], goals, btts, result1x2].sort((a, b) => b.prob - a.prob)[0];

  const conf = confidence(pred, prob1x2, false, 0);

  // Score de classement : favorise haute proba ET confiance solide.
  const score = safest.prob * 0.65 + (conf.total / 100) * 0.35;

  return {
    fixture: fx,
    expectedGoals: { home: round2(eg.home), away: round2(eg.away) },
    prob1x2,
    safest,
    result1x2,
    goals,
    btts,
    confidence: conf.total,
    advice: pred.predictions.advice ?? null,
    score,
  };
}

export async function scanBestBets(
  date: string,
  opts: { scanLimit?: number; returnN?: number; leagueId?: number } = {}
): Promise<BestBetsResult> {
  const scanLimit = Math.max(1, Math.min(opts.scanLimit ?? 12, 20));
  const returnN = Math.max(1, Math.min(opts.returnN ?? 8, 20));
  const notes: string[] = [];

  const raw = await getFixturesByDate(date);
  const upcoming = raw.filter((r) => ["NS", "TBD"].includes(r.fixture.status.short));

  let pool: RawFixture[];
  if (opts.leagueId) {
    pool = upcoming.filter((r) => r.league.id === opts.leagueId);
  } else {
    const top = upcoming.filter((r) => TOP_LEAGUES.has(r.league.id));
    pool = top.length >= 3 ? top : upcoming; // repli si peu de matchs en top championnats
    if (top.length < 3 && upcoming.length) {
      notes.push("Peu de matchs en grands championnats aujourd'hui — scan élargi à toutes les compétitions.");
    }
  }

  // Trie par heure de coup d'envoi et limite le nombre analysé (quota API).
  pool.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
  const candidates = pool.slice(0, scanLimit);
  if (pool.length > scanLimit) {
    notes.push(`${pool.length} matchs éligibles — seuls les ${scanLimit} premiers (par heure) sont analysés pour préserver le quota API (100 req/jour).`);
  }

  const picks: BestPick[] = [];
  for (const r of candidates) {
    try {
      const pred = await getPrediction(r.fixture.id);
      if (!pred) continue; // pas de prédiction → on ignore (souvent petites ligues)
      picks.push(buildPick(toFixtureLite(r), pred));
    } catch {
      // on ignore les matchs en erreur pour ne pas casser le scan
    }
  }

  picks.sort((a, b) => b.score - a.score);
  const top = picks.slice(0, returnN);

  if (!picks.length) {
    notes.push("Aucune prédiction disponible pour les matchs scannés (données API-Football absentes sur ces compétitions).");
  }

  // Coupon du jour : 3 paris les plus sûrs (proba ≥ 65%).
  const safeLegs = picks
    .map((p) => ({ pick: p.safest, fixtureId: p.fixture.id, fx: p.fixture }))
    .filter((l) => l.pick.prob >= 0.65)
    .sort((a, b) => b.pick.prob - a.pick.prob)
    .slice(0, 3);

  const coupon =
    safeLegs.length >= 2
      ? {
          legs: safeLegs.map((l) => ({
            label: `${l.fx.home.name} – ${l.fx.away.name} : ${l.pick.selection}`,
            prob: l.pick.prob,
            fixtureId: l.fixtureId,
          })),
          combinedProb: safeLegs.reduce((acc, l) => acc * l.pick.prob, 1),
        }
      : null;

  return {
    date,
    scanned: candidates.length,
    totalFixtures: raw.length,
    picks: top,
    coupon,
    notes,
  };
}
