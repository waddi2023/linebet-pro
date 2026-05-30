// Moteur de simulation Poisson Monte-Carlo + utilitaires marché.
import type { ProbTriple, ScoreLine } from "./types";

// Échantillon d'une loi de Poisson (algorithme de Knuth) — suffisant pour lambda raisonnables.
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export interface SimOutput {
  samples: number;
  prob1x2: ProbTriple;
  avgScore: { home: number; away: number };
  topScores: ScoreLine[];
  btts: number;
  overUnder: { line: number; over: number; under: number }[];
}

const OU_LINES = [0.5, 1.5, 2.5, 3.5];

export function simulate(lambdaHome: number, lambdaAway: number, samples = 10000): SimOutput {
  let h = 0,
    d = 0,
    a = 0;
  let sumH = 0,
    sumA = 0,
    btts = 0;
  const scoreCount = new Map<string, number>();
  const overCount = OU_LINES.map(() => 0);

  for (let i = 0; i < samples; i++) {
    const gh = samplePoisson(lambdaHome);
    const ga = samplePoisson(lambdaAway);
    sumH += gh;
    sumA += ga;
    if (gh > ga) h++;
    else if (gh < ga) a++;
    else d++;
    if (gh > 0 && ga > 0) btts++;
    const total = gh + ga;
    OU_LINES.forEach((line, idx) => {
      if (total > line) overCount[idx]++;
    });
    const key = `${gh}-${ga}`;
    scoreCount.set(key, (scoreCount.get(key) || 0) + 1);
  }

  const topScores: ScoreLine[] = [...scoreCount.entries()]
    .map(([score, n]) => ({ score, prob: n / samples }))
    .sort((x, y) => y.prob - x.prob)
    .slice(0, 6);

  return {
    samples,
    prob1x2: { home: h / samples, draw: d / samples, away: a / samples },
    avgScore: { home: sumH / samples, away: sumA / samples },
    topScores,
    btts: btts / samples,
    overUnder: OU_LINES.map((line, idx) => ({
      line,
      over: overCount[idx] / samples,
      under: 1 - overCount[idx] / samples,
    })),
  };
}

// Détection de value : compare proba modèle et proba implicite de la cote.
export function valueOf(prob: number, odd: number | null | undefined): number | null {
  if (!odd || odd <= 1) return null;
  return prob * odd - 1;
}

export function rateValue(value: number | null): "Excellente" | "Bonne" | "Faible" | "Aucune" | null {
  if (value === null) return null;
  if (value >= 0.1) return "Excellente";
  if (value >= 0.04) return "Bonne";
  if (value > 0) return "Faible";
  return "Aucune";
}

export function impliedProb(odd: number | null | undefined): number | null {
  if (!odd || odd <= 1) return null;
  return 1 / odd;
}

// Normalise un triple de probas pour que la somme = 1.
export function normalizeTriple(t: ProbTriple): ProbTriple {
  const s = t.home + t.draw + t.away;
  if (s <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: t.home / s, draw: t.draw / s, away: t.away / s };
}

// Mélange pondéré de deux triples (ex : Poisson + API-Football).
export function blendTriples(a: ProbTriple, b: ProbTriple | null, wB = 0.5): ProbTriple {
  if (!b) return normalizeTriple(a);
  const wA = 1 - wB;
  return normalizeTriple({
    home: a.home * wA + b.home * wB,
    draw: a.draw * wA + b.draw * wB,
    away: a.away * wA + b.away * wB,
  });
}
