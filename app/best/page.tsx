"use client";

import { useState } from "react";
import Link from "next/link";
import type { BestBetsResult, BestPick } from "@/lib/bestBets";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function pct(x: number, d = 0) {
  return `${(x * 100).toFixed(d)}%`;
}

export default function BestPage() {
  const [date, setDate] = useState(todayISO());
  const [scan, setScan] = useState(12);
  const [data, setData] = useState<BestBetsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/best?date=${date}&scan=${scan}&top=8`);
      const json = await res.json();
      if (!res.ok) setError({ code: json.error, message: json.message });
      else setData(json);
    } catch (e) {
      setError({ code: "NETWORK", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-bold tracking-tight">🔥 Meilleurs paris du jour</h1>
        <p className="mt-1 text-sm text-white/50">
          L'agent scanne les matchs (priorité aux grands championnats), simule chacun et te classe les{" "}
          <span className="text-white/70">meilleures probabilités</span> + le coupon le plus sûr.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-pitch-700 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-xs text-white/50">
            Matchs à scanner
            <select
              value={scan}
              onChange={(e) => setScan(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-pitch-700 px-2 py-2 text-sm outline-none focus:border-accent"
            >
              {[6, 10, 12, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Analyse en cours…" : "Trouver les meilleurs paris"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/30">
          ⚠️ Chaque match scanné = 1 requête API (quota gratuit : 100/jour). Le scan en consomme {scan} + 1.
        </p>
      </section>

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <p className="font-semibold text-amber-300">⚠️ {error.code === "NO_KEY" ? "Clé API manquante" : "Erreur"}</p>
          <p className="mt-1 text-white/60">{error.message}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {data && (
        <>
          {data.notes.length > 0 && (
            <div className="card border-sky-500/20 bg-sky-500/5 p-4 text-xs text-white/55">
              <ul className="list-inside list-disc space-y-0.5">
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {data.coupon && (
            <section className="card border-gold/30 bg-gold/5 p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gold">🎟️ Coupon du jour (combiné le plus sûr)</h3>
              <ul className="mt-3 space-y-2">
                {data.coupon.legs.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Link href={`/match/${l.fixtureId}`} className="flex-1 hover:text-accent">
                      {l.label}
                    </Link>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{pct(l.prob)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-white/10 pt-3 text-sm">
                Probabilité combinée estimée :{" "}
                <span className="font-bold text-gold">{pct(data.coupon.combinedProb)}</span>
                <span className="ml-2 text-xs text-white/40">
                  ({data.coupon.legs.length} sélections — plus de sélections = plus de risque)
                </span>
              </div>
            </section>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white/60">
              Classement ({data.picks.length} meilleurs sur {data.scanned} scannés / {data.totalFixtures} matchs du jour)
            </h2>
            {data.picks.map((p, i) => (
              <PickCard key={p.fixture.id} p={p} rank={i + 1} />
            ))}
            {data.picks.length === 0 && (
              <div className="card p-8 text-center text-sm text-white/50">
                Aucun pari exploitable trouvé (prédictions API indisponibles sur ces matchs). Essaie une autre date.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PickCard({ p, rank }: { p: BestPick; rank: number }) {
  const f = p.fixture;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  const confColor =
    p.confidence >= 70 ? "text-emerald-400" : p.confidence >= 55 ? "text-accent" : "text-amber-400";
  return (
    <Link href={`/match/${f.id}`} className="card block p-4 transition hover:border-accent/40">
      <div className="flex items-center gap-3">
        <span className="w-8 text-center text-lg">{medal}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-white/40">
            {f.league.logo && <img src={f.league.logo} alt="" className="h-3.5 w-3.5 object-contain" />}
            <span className="truncate">
              {f.league.country} · {f.league.name}
            </span>
            <span className="ml-auto">
              {new Date(f.timestamp * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-semibold">
            {f.home.name} <span className="text-white/30">vs</span> {f.away.name}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-accent-soft/40 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Pari recommandé (le plus sûr)</div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-sm font-bold text-accent">
              {p.safest.market} · {p.safest.selection}
            </span>
            <span className="text-sm font-bold">{pct(p.safest.prob)}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Mini label="1X2" value={p.result1x2.selection.split(" ")[0]} prob={p.result1x2.prob} />
          <Mini label={p.goals.selection} value="" prob={p.goals.prob} />
          <Mini label={`BTTS ${p.btts.selection}`} value="" prob={p.btts.prob} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <span className={`font-semibold ${confColor}`}>Confiance {p.confidence}/100</span>
        <span className="text-white/30">xG {p.expectedGoals.home}–{p.expectedGoals.away}</span>
        <span className="ml-auto text-accent">Analyse détaillée →</span>
      </div>
    </Link>
  );
}

function Mini({ label, value, prob }: { label: string; value: string; prob: number }) {
  return (
    <div className="rounded-lg bg-white/5 p-1.5">
      <div className="truncate text-[10px] text-white/40">{label}</div>
      <div className="text-sm font-semibold">
        {value && <span className="text-white/70">{value} </span>}
        {pct(prob)}
      </div>
    </div>
  );
}
