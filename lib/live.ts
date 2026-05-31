// Analyse en direct : probabilité de but supplémentaire + PRESSION & OCCASIONS par équipe.
//
// Modèle de pression = DOMINANCE OFFENSIVE CUMULÉE depuis le coup d'envoi (le feed
// /fixtures/statistics ne fournit AUCUNE fenêtre glissante, donc ce n'est pas du
// momentum instantané — étiqueté honnêtement comme tel dans l'UI).
// xG natif (expected_goals) prioritaire ; repli proxy par tirs si absent (cas fréquent).
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

export type DataConfidence = "xg" | "shots" | "shots_coarse" | "possession" | "none";

export interface TeamLiveStats {
  name: string;
  // champs bruts (du feed /fixtures/statistics)
  shotsOnGoal: number;
  shotsOffGoal: number;
  totalShots: number;
  blockedShots: number;
  shotsInsidebox: number;
  shotsOutsidebox: number;
  corners: number;
  possession: number; // 0..1
  gkSaves: number;
  totalPasses: number;
  // dérivés
  xg: number | null; // xG natif si publié
  threatXg: number; // menace utilisée (xG natif OU proxy estimé)
  xgSource: "real" | "estime";
  threatShare: number; // 0..1 part de la menace cumulée
  pressure: number; // 0..100 (somme des 2 équipes = 100)
  chances: number | null; // occasions estimées
  bigChances: number | null; // grosses occasions estimées
  bigChanceSource: "xG" | "repli" | null;
  finishingRate: number | null; // buts / grosses occasions
}

export interface PressureModel {
  dataConfidence: DataConfidence;
  pressureHome: number; // 0..100
  pressureAway: number; // 0..100 (somme = 100)
  pressureMargin: number; // 0..100, ampleur du déséquilibre
  intensityLevel: "Faible" | "Moyen" | "Élevé" | null;
  rate10: number | null; // (tirs+corners) des 2 équipes par 10 min
  lowConfidence: boolean; // elapsed < 15'
  oneSidedStats: boolean; // stats publiées pour une seule équipe
  fallbackXg: boolean; // xG estimé par tirs (xG natif absent)
  hybridXg: boolean; // xG natif d'un seul côté
  flags: string[];
}

export interface LiveInsight {
  fixture: FixtureLite;
  live: boolean;
  status: string;
  elapsed: number;
  minutesRemaining: number;
  score: { home: number; away: number; total: number };
  hasStats: boolean;
  // Buts à venir (Poisson)
  expectedRemainingGoals: number;
  projectedFinalTotal: number;
  probAtLeastOneMore: number;
  probAtLeastTwoMore: number;
  nextGoalLean: { team: "home" | "away" | "equilibre"; homePct: number; awayPct: number };
  ftLines: { line: number; over: number; under: number }[];
  verdict: {
    moreGoals: "OUI" | "PLUTÔT OUI" | "INCERTAIN" | "PLUTÔT NON" | "NON";
    headline: string;
    reco: string;
  };
  // Pression & occasions
  pressure: PressureModel;
  teams: { home: TeamLiveStats; away: TeamLiveStats };
  notes: string[];
}

// ---------- Lecture des stats (distingue 0 réel et absence) ----------
function statRaw(stats: RawTeamStats | undefined, type: string): number | null {
  if (!stats) return null;
  const s = stats.statistics.find((x) => x.type.toLowerCase() === type.toLowerCase());
  if (!s || s.value === null || s.value === undefined) return null;
  if (typeof s.value === "number") return s.value;
  const n = parseFloat(String(s.value).replace("%", ""));
  return isNaN(n) ? null : n;
}
const num0 = (v: number | null): number => (v === null ? 0 : v);

// ---------- Poisson ----------
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

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}

// Champs bruts d'une équipe.
interface RawTeamFields {
  sog: number; soff: number; ts: number; bl: number; si: number; so: number;
  ck: number; poss: number; saves: number; passes: number; xg: number | null;
  hasXg: boolean; hasSi: boolean; hasShots: boolean; hasPoss: boolean; hasAnyStat: boolean;
}

export function readTeam(stats: RawTeamStats | undefined): RawTeamFields {
  const sogR = statRaw(stats, "Shots on Goal");
  const tsR = statRaw(stats, "Total Shots");
  const siR = statRaw(stats, "Shots insidebox");
  const xgR = statRaw(stats, "expected_goals");
  const possR = statRaw(stats, "Ball Possession");
  const sog = num0(sogR);
  const ts = num0(tsR);
  const bl = num0(statRaw(stats, "Blocked Shots"));
  const soffR = statRaw(stats, "Shots off Goal");
  const soff = soffR === null ? Math.max(0, ts - sog - bl) : soffR;
  const si = num0(siR);
  const so = num0(statRaw(stats, "Shots outsidebox"));
  return {
    sog, soff, ts, bl, si, so,
    ck: num0(statRaw(stats, "Corner Kicks")),
    poss: num0(possR) / 100,
    saves: num0(statRaw(stats, "Goalkeeper Saves")),
    passes: num0(statRaw(stats, "Total passes")),
    xg: xgR,
    hasXg: xgR !== null,
    hasSi: siR !== null,
    hasShots: sogR !== null || tsR !== null,
    hasPoss: possR !== null,
    hasAnyStat: sogR !== null || tsR !== null || siR !== null || possR !== null,
  };
}

// Proxy-xG (menace estimée) quand xG natif absent.
function proxyXg(t: RawTeamFields, savesOpp: number, coarse: boolean): number {
  const offTarget = t.soff;
  if (coarse) {
    // SHOTS_COARSE : localisation inconnue.
    return 0.085 * t.sog + 0.02 * Math.max(0, t.ts - t.sog) + 0.03 * t.bl + 0.025 * t.ck + 0.15 * savesOpp;
  }
  return (
    0.115 * t.sog +
    0.06 * t.si +
    0.03 * t.bl +
    0.02 * offTarget +
    0.025 * t.ck +
    0.15 * savesOpp
  );
}

// Occasions (chances de tir crédibles).
export function chancesOf(t: RawTeamFields): number | null {
  if (t.hasSi) {
    const siOff = Math.max(0, t.si - t.sog);
    return t.sog + 0.5 * t.bl + 0.5 * siOff + 0.25 * t.ck;
  }
  if (t.hasShots && t.ts > 0) return t.sog + 0.25 * Math.max(0, t.ts - t.sog) + 0.5 * t.bl;
  if (t.hasShots) return 0.55 * t.ts;
  return null;
}

// Grosses occasions (occasions franches).
export function bigChancesOf(
  t: RawTeamFields,
  goals: number,
  savesOpp: number,
  chances: number | null
): { value: number | null; source: "xG" | "repli" | null } {
  if (t.hasXg && t.xg !== null) {
    const v = clamp(Math.round(t.xg / 0.3), 0, t.sog + t.bl);
    return { value: v, source: "xG" };
  }
  if (t.hasSi) {
    const sotInside = Math.min(t.sog, t.si);
    const extra = 0.4 * Math.max(0, sotInside - goals - savesOpp);
    let v = Math.round(goals + savesOpp + extra);
    v = clamp(v, 0, t.sog + savesOpp + t.bl);
    if (chances !== null) v = Math.min(v, Math.round(chances));
    return { value: v, source: "repli" };
  }
  if (t.hasShots) return { value: Math.round(goals + 0.3 * t.sog), source: "repli" };
  if (t.hasAnyStat) return { value: goals, source: "repli" };
  return { value: null, source: null };
}

export function buildPressure(
  homeRaw: RawTeamFields,
  awayRaw: RawTeamFields,
  elapsed: number
): { model: PressureModel; threatHome: number; threatAway: number } {
  const flags: string[] = [];
  const el = Math.max(1, elapsed);

  // Mode / niveau de confiance.
  let dataConfidence: DataConfidence;
  let hybridXg = false;
  let fallbackXg = false;
  let threatHome: number;
  let threatAway: number;

  const bothXg = homeRaw.hasXg && awayRaw.hasXg;
  const oneXg = homeRaw.hasXg || awayRaw.hasXg;
  const anyShots = homeRaw.hasShots || awayRaw.hasShots;
  const anySi = homeRaw.hasSi || awayRaw.hasSi;
  const anyPoss = homeRaw.hasPoss || awayRaw.hasPoss;
  const coarse = !anySi; // pas de localisation des tirs

  if (bothXg) {
    dataConfidence = "xg";
    threatHome = homeRaw.xg as number;
    threatAway = awayRaw.xg as number;
  } else if (oneXg) {
    dataConfidence = "xg";
    hybridXg = true;
    threatHome = homeRaw.hasXg ? (homeRaw.xg as number) : proxyXg(homeRaw, awayRaw.saves, coarse);
    threatAway = awayRaw.hasXg ? (awayRaw.xg as number) : proxyXg(awayRaw, homeRaw.saves, coarse);
  } else if (anyShots) {
    dataConfidence = coarse ? "shots_coarse" : "shots";
    fallbackXg = true;
    threatHome = proxyXg(homeRaw, awayRaw.saves, coarse);
    threatAway = proxyXg(awayRaw, homeRaw.saves, coarse);
  } else if (anyPoss) {
    dataConfidence = "possession";
    fallbackXg = true;
    threatHome = homeRaw.poss;
    threatAway = awayRaw.poss;
  } else {
    dataConfidence = "none";
    return {
      threatHome: 0,
      threatAway: 0,
      model: {
        dataConfidence,
        pressureHome: 50,
        pressureAway: 50,
        pressureMargin: 0,
        intensityLevel: null,
        rate10: null,
        lowConfidence: elapsed < 15,
        oneSidedStats: false,
        fallbackXg: false,
        hybridXg: false,
        flags: ["Statistiques détaillées non publiées — pression non calculable."],
      },
    };
  }

  // Facteur contrôle (possession) borné, pour ne pas dominer la qualité.
  const possFactor = (p: number) => (p > 0 ? 0.9 + 0.2 * p : 1);
  const PRIOR = 0.15;
  const adjHome = threatHome * possFactor(homeRaw.poss) + PRIOR;
  const adjAway = threatAway * possFactor(awayRaw.poss) + PRIOR;
  const denom = adjHome + adjAway;
  const scoreHome = denom > 1e-9 ? adjHome / denom : 0.5;

  // Amortissement temporel vers 50/50 (révèle l'écart progressivement).
  const conf = clamp(el / (el + 15), 0, 1);
  let pressureHome = Math.round(50 + (100 * scoreHome - 50) * conf);
  pressureHome = clamp(pressureHome, 0, 100);
  const pressureAway = 100 - pressureHome;
  const pressureMargin = Math.abs(pressureHome - 50) * 2;

  // Intensité absolue (tempo du match).
  let events = 0;
  let intensityLevel: PressureModel["intensityLevel"] = null;
  let rate10: number | null = null;
  if (homeRaw.hasShots || awayRaw.hasShots) {
    events = homeRaw.ts + awayRaw.ts + homeRaw.ck + awayRaw.ck;
    if (events === 0) events = homeRaw.sog + homeRaw.soff + homeRaw.bl + awayRaw.sog + awayRaw.soff + awayRaw.bl + homeRaw.ck + awayRaw.ck;
    rate10 = round2((events / el) * 10);
    if (rate10 < 3.0) intensityLevel = "Faible";
    else if (rate10 < 5.5) intensityLevel = "Moyen";
    else intensityLevel = "Élevé";
    // Garde-fou faux "Élevé" en tout début de match.
    if (elapsed < 8 && events < 3 && intensityLevel === "Élevé") intensityLevel = "Moyen";
  }

  const lowConfidence = elapsed < 15;
  const oneSidedStats = homeRaw.hasAnyStat !== awayRaw.hasAnyStat;
  if (hybridXg) flags.push("xG natif publié pour une seule équipe — l'autre est estimée par ses tirs.");
  if (fallbackXg) flags.push("xG natif indisponible — pression estimée par le volume de tirs (cadrés, surface, bloqués, arrêts).");
  if (oneSidedStats) flags.push("Statistiques publiées pour une seule équipe — répartition prudente.");
  if (lowConfidence) flags.push("Moins de 15′ jouées — estimations encore instables.");

  return {
    threatHome,
    threatAway,
    model: {
      dataConfidence,
      pressureHome,
      pressureAway,
      pressureMargin,
      intensityLevel,
      rate10,
      lowConfidence,
      oneSidedStats,
      fallbackXg,
      hybridXg,
      flags,
    },
  };
}

// Minutes restantes selon le statut (gère mi-temps / prolongations).
export function minutesLeft(status: string, elapsed: number, live: boolean): number {
  if (status === "HT") return 45 + 3;
  if (status === "2H" || status === "1H") return Math.max(1, 90 + 4 - elapsed);
  if (status === "ET" || status === "BT" || status === "P") return Math.max(1, 120 + 3 - elapsed);
  return live ? Math.max(1, 90 - elapsed) : 0;
}

// Buts restants attendus (Poisson) à partir de la menace cumulée de chaque équipe.
export function remainingLambdas(
  threatHome: number,
  threatAway: number,
  elapsed: number,
  minutesRemaining: number,
  hasStats: boolean
): { lambdaHome: number; lambdaAway: number; lambdaTotal: number } {
  const BASE_PER_MIN = 1.25 / 90;
  const el = Math.max(1, elapsed);
  const w = el / (el + 20);
  const ratePerMin = (threat: number) => {
    const liveRate = hasStats && threat > 0 ? threat / el : BASE_PER_MIN;
    return w * liveRate + (1 - w) * BASE_PER_MIN;
  };
  const lambdaHome = ratePerMin(threatHome) * minutesRemaining;
  const lambdaAway = ratePerMin(threatAway) * minutesRemaining;
  return { lambdaHome, lambdaAway, lambdaTotal: Math.max(0.01, lambdaHome + lambdaAway) };
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

  const minutesRemaining = minutesLeft(status, elapsed, live);

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
    notes.push("Statistiques détaillées non publiées pour ce match — pression/occasions indisponibles, estimation des buts basée sur le temps et le score.");
  }

  const hRaw = readTeam(homeStats);
  const aRaw = readTeam(awayStats);

  // Pression & menace.
  const { model: pressure, threatHome, threatAway } = buildPressure(hRaw, aRaw, elapsed);

  // Occasions / grosses occasions.
  const hChances = chancesOf(hRaw);
  const aChances = chancesOf(aRaw);
  const hBig = bigChancesOf(hRaw, gh, aRaw.saves, hChances);
  const aBig = bigChancesOf(aRaw, ga, hRaw.saves, aChances);

  const mkTeam = (
    name: string,
    r: RawTeamFields,
    threat: number,
    pressureVal: number,
    chances: number | null,
    big: { value: number | null; source: "xG" | "repli" | null },
    goals: number
  ): TeamLiveStats => {
    const threatXg = r.hasXg && r.xg !== null ? r.xg : round2(threat);
    return {
      name,
      shotsOnGoal: r.sog,
      shotsOffGoal: r.soff,
      totalShots: r.ts,
      blockedShots: r.bl,
      shotsInsidebox: r.si,
      shotsOutsidebox: r.so,
      corners: r.ck,
      possession: r.poss,
      gkSaves: r.saves,
      totalPasses: r.passes,
      xg: r.hasXg ? r.xg : null,
      threatXg,
      xgSource: r.hasXg ? "real" : "estime",
      threatShare: 0, // rempli plus bas
      pressure: pressureVal,
      chances: chances === null ? null : Math.round(chances),
      bigChances: big.value,
      bigChanceSource: big.source,
      finishingRate: big.value && big.value > 0 ? round2(goals / big.value) : big.value === 0 ? null : null,
    };
  };

  const home = mkTeam(fixture.home.name, hRaw, threatHome, pressure.pressureHome, hChances, hBig, gh);
  const away = mkTeam(fixture.away.name, aRaw, threatAway, pressure.pressureAway, aChances, aBig, ga);

  // Menace pour Poisson (xG natif ou proxy), avec base de sécurité.
  const { lambdaHome, lambdaAway, lambdaTotal } = remainingLambdas(
    home.threatXg,
    away.threatXg,
    elapsed,
    minutesRemaining,
    hasStats
  );

  // Parts de menace cumulée (pour l'inclinaison prochain but).
  const tSum = threatHome + threatAway;
  home.threatShare = tSum > 1e-9 ? round2(threatHome / tSum) : 0.5;
  away.threatShare = tSum > 1e-9 ? round2(threatAway / tSum) : 0.5;

  const probAtLeastOneMore = live ? 1 - Math.exp(-lambdaTotal) : 0;
  const probAtLeastTwoMore = live ? probAtLeast(lambdaTotal, 2) : 0;

  const homePct = Math.round((lambdaHome / lambdaTotal) * 100);
  const awayPct = 100 - homePct;
  const leanTeam: "home" | "away" | "equilibre" =
    Math.abs(homePct - 50) < 8 ? "equilibre" : homePct > 50 ? "home" : "away";

  const ftLines = [1.5, 2.5, 3.5].map((line) => {
    const need = Math.max(0, Math.ceil(line - total));
    const over = total > line ? 1 : probAtLeast(lambdaTotal, need);
    return { line, over: round3(over), under: round3(1 - over) };
  });

  const expectedRemainingGoals = round2(lambdaTotal);
  const projectedFinalTotal = round2(total + lambdaTotal);

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
    pressure,
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

// ---------- Scan des matchs « chauds » ----------
export interface HeatItem extends LiveListItem {
  heat: number; // 0..100
  intensityLevel: PressureModel["intensityLevel"];
  rate10: number | null;
  probMore: number; // proba ≥1 but d'ici la fin
  pressureHome: number;
  pressureAway: number;
  pressureMargin: number;
  leadTeam: "home" | "away" | null;
  dataConfidence: DataConfidence;
  hasStats: boolean;
}

export interface HeatScan {
  scanned: number;
  totalLive: number;
  items: HeatItem[];
  notes: string[];
}

const HEAT_STATUSES = new Set(["1H", "2H", "HT", "ET", "BT", "P"]);

export async function scanHotMatches(limit = 12): Promise<HeatScan> {
  const lim = Math.max(1, Math.min(limit, 20));
  const raw = await getLiveFixtures();
  const inPlay = raw.filter((r) => HEAT_STATUSES.has(r.fixture.status.short));
  // On scanne en priorité les matchs entre la 10e et la 88e minute (assez de données, encore du temps).
  const candidates = inPlay
    .filter((r) => {
      const e = r.fixture.status.elapsed ?? 0;
      return e >= 10 && e <= 88;
    })
    .sort((a, b) => (b.fixture.status.elapsed ?? 0) - (a.fixture.status.elapsed ?? 0))
    .slice(0, lim);

  const notes: string[] = [];
  if (inPlay.length > candidates.length) {
    notes.push(
      `${inPlay.length} matchs en direct — ${candidates.length} analysés en détail (1 requête stats chacun) pour préserver le quota API.`
    );
  }

  const items: HeatItem[] = [];
  for (const r of candidates) {
    let stats: RawTeamStats[] = [];
    try {
      stats = await getFixtureStatistics(r.fixture.id);
    } catch {
      // on continue sans stats
    }
    const homeStats = stats.find((s) => s.team.id === r.teams.home.id);
    const awayStats = stats.find((s) => s.team.id === r.teams.away.id);
    const hasStats = !!(homeStats || awayStats);
    const hRaw = readTeam(homeStats);
    const aRaw = readTeam(awayStats);
    const elapsed = Math.max(1, r.fixture.status.elapsed ?? 45);
    const { model, threatHome, threatAway } = buildPressure(hRaw, aRaw, elapsed);
    const minRem = minutesLeft(r.fixture.status.short, elapsed, true);
    const noThreat = model.dataConfidence === "none";
    const { lambdaTotal } = remainingLambdas(
      noThreat ? 0 : threatHome,
      noThreat ? 0 : threatAway,
      elapsed,
      minRem,
      hasStats
    );
    const probMore = 1 - Math.exp(-lambdaTotal);

    const intensityNorm = model.rate10 != null ? clamp(model.rate10 / 8, 0, 1) : 0;
    const marginNorm = model.pressureMargin / 100;
    const goalsTotal = (r.goals.home ?? 0) + (r.goals.away ?? 0);
    const goalsNorm = clamp(goalsTotal / 4, 0, 1);
    const heat = Math.round(100 * (0.4 * probMore + 0.35 * intensityNorm + 0.1 * marginNorm + 0.15 * goalsNorm));

    const leadTeam: "home" | "away" | null =
      model.pressureMargin < 15 ? null : model.pressureHome > model.pressureAway ? "home" : "away";

    items.push({
      id: r.fixture.id,
      status: r.fixture.status.short,
      elapsed: r.fixture.status.elapsed,
      league: { name: r.league.name, country: r.league.country, logo: r.league.logo },
      home: { name: r.teams.home.name, logo: r.teams.home.logo },
      away: { name: r.teams.away.name, logo: r.teams.away.logo },
      goals: r.goals,
      heat,
      intensityLevel: model.intensityLevel,
      rate10: model.rate10,
      probMore: round3(probMore),
      pressureHome: model.pressureHome,
      pressureAway: model.pressureAway,
      pressureMargin: model.pressureMargin,
      leadTeam,
      dataConfidence: model.dataConfidence,
      hasStats,
    });
  }

  items.sort((a, b) => b.heat - a.heat);
  return { scanned: candidates.length, totalLive: inPlay.length, items, notes };
}
