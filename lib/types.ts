// Types partagés entre l'API et l'UI.

export interface FixtureLite {
  id: number;
  date: string;
  timestamp: number;
  statusShort: string;
  league: { id: number; name: string; country: string; logo: string; flag: string | null; round?: string };
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  goalsHome: number | null;
  goalsAway: number | null;
}

export interface ProbTriple {
  home: number;
  draw: number;
  away: number;
}

export interface ScoreLine {
  score: string;
  prob: number;
}

export interface MarketRow {
  market: string;
  pick: string;
  prob: number; // 0..1
  odd?: number | null;
  value?: number | null; // (prob*odd)-1
  rating?: "Excellente" | "Bonne" | "Faible" | "Aucune" | null;
}

export interface ScorerRow {
  name: string;
  team: string;
  goalsSeason: number | null;
  note?: string;
}

export interface ConfidenceBreakdown {
  forme: number;
  statsAvancees: number;
  effectif: number;
  motivation: number;
  historique: number;
  domicileExterieur: number;
  tactique: number;
  marche: number;
  total: number;
}

export interface Verdict {
  meilleurPari: string;
  pariSur: string;
  valueBet: string;
  risquePrincipal: string;
  confianceGlobale: number;
  miseRecommandee: string;
}

export interface AnalysisResult {
  fixture: FixtureLite;
  dataAvailability: {
    predictions: boolean;
    odds: boolean;
    scorers: boolean;
    notes: string[];
  };
  expectedGoals: { home: number; away: number };
  prob1x2: ProbTriple; // modèle final (mélange Poisson + API)
  prob1x2Model: ProbTriple; // Poisson Monte-Carlo
  prob1x2Api: ProbTriple | null; // API-Football predictions
  simulation: {
    samples: number;
    avgScore: { home: number; away: number };
    topScores: ScoreLine[];
    btts: number; // proba BTTS oui
    overUnder: { line: number; over: number; under: number }[];
  };
  markets: MarketRow[];
  scorers: ScorerRow[];
  confidence: ConfidenceBreakdown;
  verdict: Verdict;
  apiAdvice: string | null;
  recentForm: {
    home: { form: string | null; lastForGoals: number | null; lastAgainstGoals: number | null };
    away: { form: string | null; lastForGoals: number | null; lastAgainstGoals: number | null };
  };
}
