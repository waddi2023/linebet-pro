// Wrapper léger autour d'API-Football (v3, endpoint direct api-sports.io).
// Toutes les requêtes sont server-side : la clé n'est jamais exposée au client.

const HOST = process.env.API_FOOTBALL_HOST || "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY || "";

export type ApiErrorCode = "NO_KEY" | "HTTP" | "EMPTY" | "QUOTA" | "SUSPENDED";

export class ApiFootballError extends Error {
  constructor(message: string, public code: ApiErrorCode = "HTTP") {
    super(message);
    this.name = "ApiFootballError";
  }
}

export function hasApiKey(): boolean {
  return KEY.trim().length > 0;
}

// Statut HTTP à renvoyer côté route selon le type d'erreur.
export function httpStatusForCode(code: ApiErrorCode): number {
  if (code === "QUOTA") return 429;
  if (code === "SUSPENDED") return 403;
  if (code === "NO_KEY") return 503;
  return 502;
}

// Compte suspendu : blocage AU NIVEAU DU COMPTE (≠ quota quotidien, ne se réinitialise pas tout seul).
function isSuspendedError(raw: string): boolean {
  return raw.toLowerCase().includes("suspend");
}

// Rate-limit / quota quotidien dépassé (se réinitialise automatiquement).
function isQuotaError(raw: string): boolean {
  const t = raw.toLowerCase();
  if (t.includes("too many request") || t.includes("ratelimit") || t.includes("rate limit")) return true;
  if (t.includes("request") && (t.includes("exceed") || t.includes("reached") || t.includes("per day") || t.includes("daily") || t.includes("per minute"))) return true;
  return false;
}

const QUOTA_MESSAGE =
  "Quota quotidien de l'API atteint (plan gratuit : 100 requêtes/jour). Le quota se réinitialise automatiquement chaque jour — réessaie plus tard.";
const SUSPENDED_MESSAGE =
  "Le compte API-Football est suspendu (blocage au niveau du compte, ≠ quota quotidien). Connecte-toi à dashboard.api-football.com pour voir la raison et le réactiver.";

// ---------- Limiteur de débit ----------
// Le plan gratuit autorise 10 requêtes/MINUTE. On reste sous 9 pour garder une marge :
// dépasser cette limite de façon répétée peut faire SUSPENDRE le compte.
const RL_MAX = 9;
const RL_WINDOW_MS = 60_000;
let rlTimestamps: number[] = [];

async function rateLimitGate(): Promise<void> {
  const now = Date.now();
  rlTimestamps = rlTimestamps.filter((t) => now - t < RL_WINDOW_MS);
  if (rlTimestamps.length >= RL_MAX) {
    const wait = RL_WINDOW_MS - (now - rlTimestamps[0]) + 50;
    await new Promise((r) => setTimeout(r, wait));
    return rateLimitGate();
  }
  rlTimestamps.push(Date.now());
}

interface ApiResponse<T> {
  response: T;
  errors: unknown;
  results: number;
}

async function apiGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  if (!hasApiKey()) {
    throw new ApiFootballError(
      "Clé API-Football absente. Définis la variable d'environnement API_FOOTBALL_KEY.",
      "NO_KEY"
    );
  }
  const qs = new URLSearchParams(
    Object.entries(params).reduce((acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  const url = `${HOST}${path}?${qs}`;
  const isRapid = HOST.includes("rapidapi.com");
  const headers: Record<string, string> = isRapid
    ? {
        "x-rapidapi-key": KEY,
        "x-rapidapi-host": new URL(HOST).host,
      }
    : { "x-apisports-key": KEY };

  await rateLimitGate(); // respecte la limite gratuite de 10 req/min
  const res = await fetch(url, { headers, next: { revalidate: 120 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isSuspendedError(body)) throw new ApiFootballError(SUSPENDED_MESSAGE, "SUSPENDED");
    // 429 = trop de requêtes (quota dépassé).
    if (res.status === 429 || isQuotaError(body)) throw new ApiFootballError(QUOTA_MESSAGE, "QUOTA");
    throw new ApiFootballError(`API-Football HTTP ${res.status} sur ${path}`, "HTTP");
  }
  const json = (await res.json()) as ApiResponse<T>;
  const hasErrors = Array.isArray(json.errors)
    ? (json.errors as unknown[]).length > 0
    : json.errors && Object.keys(json.errors as object).length > 0;
  if (hasErrors) {
    const msg = JSON.stringify(json.errors);
    if (isSuspendedError(msg)) throw new ApiFootballError(SUSPENDED_MESSAGE, "SUSPENDED");
    if (isQuotaError(msg)) throw new ApiFootballError(QUOTA_MESSAGE, "QUOTA");
    throw new ApiFootballError(`API-Football a renvoyé une erreur : ${msg}`, "HTTP");
  }
  return json.response;
}

// ---------- Fixtures ----------

export interface RawFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: { short: string; long?: string; elapsed: number | null };
  };
  league: { id: number; name: string; country: string; logo: string; flag: string | null; round: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export async function getFixturesByDate(date: string): Promise<RawFixture[]> {
  return apiGet<RawFixture[]>("/fixtures", { date });
}

export async function getFixtureById(id: number): Promise<RawFixture[]> {
  return apiGet<RawFixture[]>("/fixtures", { id });
}

// Matchs actuellement en direct.
export async function getLiveFixtures(): Promise<RawFixture[]> {
  return apiGet<RawFixture[]>("/fixtures", { live: "all" });
}

// Statistiques en direct (tirs, attaques dangereuses, possession, corners…).
export interface RawTeamStats {
  team: { id: number; name: string; logo: string };
  statistics: { type: string; value: number | string | null }[];
}

export async function getFixtureStatistics(fixtureId: number): Promise<RawTeamStats[]> {
  return apiGet<RawTeamStats[]>("/fixtures/statistics", { fixture: fixtureId });
}

// ---------- Predictions ----------

export interface RawPrediction {
  predictions: {
    winner: { id: number | null; name: string | null; comment: string | null };
    win_or_draw: boolean;
    under_over: string | null;
    goals: { home: string | null; away: string | null };
    advice: string | null;
    percent: { home: string; draw: string; away: string };
  };
  league: { id: number; name: string; season: number };
  teams: {
    home: RawPredTeam;
    away: RawPredTeam;
  };
  comparison: Record<string, { home: string; away: string }>;
  h2h: RawFixture[];
}

export interface RawPredTeam {
  id: number;
  name: string;
  logo: string;
  last_5: {
    played: number;
    form: string;
    att: string;
    def: string;
    goals: {
      for: { total: number; average: number };
      against: { total: number; average: number };
    };
  };
  league: {
    form: string | null;
    goals: {
      for: { total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
      against: { total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
    };
  };
}

export async function getPrediction(fixtureId: number): Promise<RawPrediction | null> {
  const r = await apiGet<RawPrediction[]>("/predictions", { fixture: fixtureId });
  return r.length ? r[0] : null;
}

// ---------- Odds ----------

export interface RawOdds {
  bookmakers: {
    id: number;
    name: string;
    bets: { id: number; name: string; values: { value: string; odd: string }[] }[];
  }[];
}

export async function getOdds(fixtureId: number): Promise<RawOdds | null> {
  const r = await apiGet<{ bookmakers: RawOdds["bookmakers"] }[]>("/odds", { fixture: fixtureId });
  return r.length ? { bookmakers: r[0].bookmakers } : null;
}

// ---------- Top scorers ----------

export interface RawTopScorer {
  player: { id: number; name: string };
  statistics: { team: { id: number; name: string }; goals: { total: number | null } }[];
}

export async function getTopScorers(league: number, season: number): Promise<RawTopScorer[]> {
  return apiGet<RawTopScorer[]>("/players/topscorers", { league, season });
}

// ---------- Statut du compte / quota ----------
// Note : /status ne consomme PAS le quota quotidien (non décompté par api-sports).
export interface AccountStatus {
  current: number;
  limit: number;
  remaining: number;
  plan: string;
  active: boolean;
}

export async function getStatus(): Promise<AccountStatus> {
  const r = await apiGet<{
    subscription: { plan: string; active: boolean };
    requests: { current: number; limit_day: number };
  }>("/status", {});
  const current = r.requests?.current ?? 0;
  const limit = r.requests?.limit_day ?? 100;
  return {
    current,
    limit,
    remaining: Math.max(0, limit - current),
    plan: r.subscription?.plan ?? "Free",
    active: r.subscription?.active ?? false,
  };
}
