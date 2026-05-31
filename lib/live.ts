// Analyse en direct : estime la probabilité d'un (ou plusieurs) but(s) supplémentaire(s)
// à partir du score actuel, du temps restant et de l'intensité du jeu.
import {
  getFixtureById,
  getFixtureStatistics,
  getLiveFixtures,
  ApiFootballError,
  type RawTeamStats,
} from "./apiFootball";
import { toFixtureLite } from "./analysis";
import type { FixtureLite } from "./types";

const LIVE_STATUSES = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "HT", "INT"]);

export function isLiveStatus(short: string): boolean {
  return LIVE_STATUSES.has(short);
}

export interface TeamLiveStats {
  name: string;
  shotsOnGoal: number;
  totalShots: number;
  dangerousAttacks: number;
  attacks: number;
  corners: number;
  possession: number; // 0..1
  threatShare: number; // 0..1 part de la menace offensive
  xgEstimate: number; // xG cumulé estimé
}

export interface LiveInsight {
  fixture: FixtureLite;
  live: boolean;
  status: string;
  elapsed: number; // minutes jouées
  minutesRemaining: number;
  score: { home: number; away: number; total: number };
  hasStats: boolean;
  // Modèle
  expectedRemainingGoals: number; // buts attendus d'ici la fin
  projectedFinalTotal: number;
  probAtLeastOneMore: number; // proba ≥ 1 but supplémentaire
  probAtLeastTwoMore: number;
  nextGoalLean: { team: "home" | "away" | "equilibre"; homePct: number; awayPct: number };
  ftLines: { line: number; over: number; under: number }[]; // proba sur le total FINAL
  verdict: {
    moreGoals: "OUI" | "PLUTÔT OUI" | "INCERTAIN" | "PLUTÔT NON" | "NON";
    headline: string;
    reco: string;
  };
  teams: { home: TeamLiveStats; away: TeamLiveStats };
  notes: string[];
}

function statNum(stats: RawTeamStats | undefined, type: string): number {
  if (!stats) return 0;
  const s = stats.statistics.find((x) => x.type.toLowerCase() === type.toLowerCase());
  if (!s || s.value === null) return 0;
  if (typeof s.value === "number") return s.value;
  const n = parseFloat(String(s.value).replace("%", ""));
  return isNaN(n) ? 0 : n;
}

// xG cumulé estimé à partir des tirs et de l'activité offensive.
function estimateXg(sog: number, totalShots: number, da: number): number {
  const offTarget = Math.max(0, totalShots - sog);
  return 0.3 * sog + 0.05 * offTarget + 0.004 * da;
}

// Loi de Poisson : P(X = k) et survie.
function poissonP(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
function probAtLeast(lambda: number, k: number): number {
  if (k <= 0) return 1;
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += poissonP(lambda, i);
  return 1 - cdf;
}

export async function buildLiveInsight(fixtureId: number): Promise<LiveInsight> {
  const fx = await getFixtureById(fixtureId);
  if (!fx.length) throw new ApiFootballError("Match introuvable.", "EMPTY");
  const raw = fx[0];
  const fixture = toFixtureLite(raw);
  const status = raw.fixture.status.short;
  const live = isLiveStatus(status);
  const elapsedRaw = raw.fixture.status.elapsed ?? (status === "HT" ? 45 : 0);
  const elapsed = Math.max(1, elapsedRaw);
  const gh = raw.goals.home ?? 0;
  const ga = raw.goals.away ?? 0;
  const total = gh + ga;
  const notes: string[] = [];

  if (!live) {
    notes.push(
      status === "NS"
        ? "Le match n'a pas encore commencé — l'analyse live sera disponible au coup d'envoi."
        : `Match non en direct (statut : ${status}). Données figées.`
    );
  }

  // Minutes restantes (gère mi-temps et prolongations sommairement).
  let minutesRemaining: number;
  if (status === "HT") minutesRemaining = 45 + 3;
  else if (status === "2H" || status === "1H") minutesRemaining = Math.max(1, 90 + 4 - elapsed);
  else if (status === "ET" || status === "BT" || status === "P") minutesRemaining = Math.max(1, 120 + 3 - elapsed);
  else minutesRemaining = live ? Math.max(1, 90 - elapsed) : 0;

  // Statistiques en direct.
  let stats: RawTeamStats[] = [];
  try {
    if (live) stats = await getFixtureStatistics(fixtureId);
  } catch (e) {
    notes.push(`Statistiques live indisponibles : ${(e as Error).message}`);
  }
  const homeStats = stats.find((s) => s.team.id === fixture.home.id);
  const awayStats = stats.find((s) => s.team.id === fixture.away.id);
  const hasStats = !!(homeStats || awayStats);
  if (live && !hasStats) {
    notes.push("Statistiques détaillées non publiées pour ce match — estimation basée sur le score et le temps.");
  }

  const mk = (name: string, st: RawTeamStats | undefined): TeamLiveStats => {
    const sog = statNum(st, "Shots on Goal");
    const ts = statNum(st, "Total Shots");
    const da = statNum(st, "Dangerous Attacks");
    const at = statNum(st, "Attacks");
    const co = statNum(st, "Corner Kicks");
    const poss = statNum(st, "Ball Possession") / 100;
    return {
      name,
      shotsOnGoal: sog,
      totalShots: ts,
      dangerousAttacks: da,
      attacks: at,
      corners: co,
      possession: poss,
      threatShare: 0,
      xgEstimate: Math.round(estimateXg(sog, ts, da) * 100) / 100,
    };
  };

  const home = mk(fixture.home.name, homeStats);
  const away = mk(fixture.away.name, awayStats);

  // Taux de but / minute par équipe : mélange du rythme live et d'une base.
  const BASE_PER_MIN = 1.25 / 90; // ~1.25 but/équipe/match par défaut
  const w = elapsed / (elapsed + 20); // confiance croissante avec le temps joué

  const ratePerMin = (xg: number) => {
    const liveRate = hasStats ? xg / elapsed : BASE_PER_MIN;
    return w * liveRate + (1 - w) * BASE_PER_MIN;
  };

  const lambdaHome = ratePerMin(home.xgEstimate) * minutesRemaining;
  const lambdaAway = ratePerMin(away.xgEstimate) * minutesRemaining;
  const lambdaTotal = Math.max(0.01, lambdaHome + lambdaAway);

  // Parts de menace (pour l'inclinaison du prochain but).
  const threatHome = hasStats ? home.xgEstimate + 0.15 * home.corners + 0.005 * home.dangerousAttacks : 1;
  const threatAway = hasStats ? away.xgEstimate + 0.15 * away.corners + 0.005 * away.dangerousAttacks : 1;
  const tSum = threatHome + threatAway || 1;
  home.threatShare = Math.round((threatHome / tSum) * 100) / 100;
  away.threatShare = Math.round((threatAway / tSum) * 100) / 100;

  const probAtLeastOneMore = live ? 1 - Math.exp(-lambdaTotal) : 0;
  const probAtLeastTwoMore = live ? probAtLeast(lambdaTotal, 2) : 0;

  // Inclinaison prochain but.
  const homePct = Math.round((lambdaHome / lambdaTotal) * 100);
  const awayPct = 100 - homePct;
  const leanTeam: "home" | "away" | "equilibre" =
    Math.abs(homePct - 50) < 8 ? "equilibre" : homePct > 50 ? "home" : "away";

  // Probabilités sur le total FINAL (score actuel + buts à venir ~ Poisson(lambdaTotal)).
  const ftLines = [1.5, 2.5, 3.5].map((line) => {
    const need = Math.max(0, Math.ceil(line - total)); // buts supplémentaires requis pour dépasser
    const over = total > line ? 1 : probAtLeast(lambdaTotal, need);
    return { line, over: round3(over), under: round3(1 - over) };
  });

  const expectedRemainingGoals = round2(lambdaTotal);
  const projectedFinalTotal = round2(total + lambdaTotal);

  // Verdict.
  let moreGoals: LiveInsight["verdict"]["moreGoals"];
  if (probAtLeastOneMore >= 0.75) moreGoals = "OUI";
  else if (probAtLeastOneMore >= 0.6) moreGoals = "PLUTÔT OUI";
  else if (probAtLeastOneMore >= 0.45) moreGoals = "INCERTAIN";
  else if (probAtLeastOneMore >= 0.3) moreGoals = "PLUTÔT NON";
  else moreGoals = "NON";

  const leanName = leanTeam === "home" ? home.name : leanTeam === "away" ? away.name : "match équilibré";
  const headline = live
    ? `${(probAtLeastOneMore * 100).toFixed(0)}% de chances d'au moins 1 but d'ici la fin (${minutesRemaining}′ restantes).`
    : "Analyse live indisponible (match non en cours).";
  const reco = live
    ? probAtLeastOneMore >= 0.6
      ? `📈 But supplémentaire probable — Over ${total + 0.5} jouable. Pression côté ${leanName}.`
      : probAtLeastOneMore <= 0.4
      ? `📉 Peu de buts attendus — Under ${total + 1.5} / score figé plausible.`
      : `⚖️ Situation 50-50 — prudence, attendre un signal (carton, changement offensif).`
    : "—";

  return {
    fixture,
    live,
    status,
    elapsed,
    minutesRemaining: live ? minutesRemaining : 0,
    score: { home: gh, away: ga, total },
    hasStats,
    expectedRemainingGoals,
    projectedFinalTotal,
    probAtLeastOneMore: round3(probAtLeastOneMore),
    probAtLeastTwoMore: round3(probAtLeastTwoMore),
    nextGoalLean: { team: leanTeam, homePct, awayPct },
    ftLines,
    verdict: { moreGoals, headline, reco },
    teams: { home, away },
    notes,
  };
}

export interface LiveListItem {
  id: number;
  status: string;
  elapsed: number | null;
  league: { name: string; country: string; logo: string };
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  goals: { home: number | null; away: number | null };
}

export async function listLiveFixtures(): Promise<LiveListItem[]> {
  const raw = await getLiveFixtures();
  return raw
    .map((r) => ({
      id: r.fixture.id,
      status: r.fixture.status.short,
      elapsed: r.fixture.status.elapsed,
      league: { name: r.league.name, country: r.league.country, logo: r.league.logo },
      home: { name: r.teams.home.name, logo: r.teams.home.logo },
      away: { name: r.teams.away.name, logo: r.teams.away.logo },
      goals: r.goals,
    }))
    .sort((a, b) => (b.elapsed ?? 0) - (a.elapsed ?? 0));
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}
