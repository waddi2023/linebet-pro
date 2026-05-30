"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalysisResult, MarketRow } from "@/lib/types";

export default function MatchPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analyze?fixture=${params.id}`);
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError({ code: json.error, message: json.message });
        else setData(json);
      } catch (e) {
        if (alive) setError({ code: "NETWORK", message: (e as Error).message });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.id]);

  return (
    <div className="space-y-5">
      <Link href="/" className="inline-block text-sm text-white/50 hover:text-accent">
        ← Retour aux matchs
      </Link>

      {loading && <Skeleton />}

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <p className="font-semibold text-amber-300">⚠️ Analyse impossible</p>
          <p className="mt-1 text-white/60">{error.message}</p>
        </div>
      )}

      {data && <Report d={data} />}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="card h-28 animate-pulse bg-white/5" />
      <div className="card h-40 animate-pulse bg-white/5" />
      <div className="card h-64 animate-pulse bg-white/5" />
    </div>
  );
}

function pct(x: number, d = 0) {
  return `${(x * 100).toFixed(d)}%`;
}

function Report({ d }: { d: AnalysisResult }) {
  const f = d.fixture;
  const kickoff = new Date(f.timestamp * 1000).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/50">
            {f.league.logo && <img src={f.league.logo} alt="" className="h-4 w-4 object-contain" />}
            <span>
              {f.league.country} · {f.league.name} {f.league.round ? `· ${f.league.round}` : ""}
            </span>
          </div>
          <span className="text-xs text-white/40">{kickoff}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 items-center gap-2">
          <TeamBig logo={f.home.name ? f.home.logo : ""} name={f.home.name} />
          <div className="text-center">
            <div className="text-2xl font-black text-white/80">VS</div>
            <div className="mt-1 text-[11px] text-white/40">
              xG {d.expectedGoals.home} – {d.expectedGoals.away}
            </div>
          </div>
          <TeamBig logo={f.away.logo} name={f.away.name} />
        </div>
      </section>

      {/* Disponibilité des données */}
      {d.dataAvailability.notes.length > 0 && (
        <section className="card border-sky-500/20 bg-sky-500/5 p-4 text-xs text-white/60">
          <div className="mb-1 flex flex-wrap gap-2">
            <Avail ok={d.dataAvailability.predictions} label="Prédictions" />
            <Avail ok={d.dataAvailability.odds} label="Cotes" />
            <Avail ok={d.dataAvailability.scorers} label="Buteurs" />
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-white/50">
            {d.dataAvailability.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Étape 2 : Probabilités 1X2 */}
      <Section title="① Probabilités 1X2" subtitle="Modèle final (Poisson Monte-Carlo + prédictions API)">
        <ProbTripleBar t={d.prob1x2} home={f.home.name} away={f.away.name} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniTriple title="Modèle Poisson (10 000 sims)" t={d.prob1x2Model} />
          {d.prob1x2Api ? (
            <MiniTriple title="Prédictions API-Football" t={d.prob1x2Api} />
          ) : (
            <div className="rounded-lg border border-white/5 p-3 text-xs text-white/40">
              Prédictions API-Football indisponibles pour ce match.
            </div>
          )}
        </div>
      </Section>

      {/* Étape 3 : Simulation */}
      <Section title="② Simulation — 10 000 matchs" subtitle={`Score moyen ${d.simulation.avgScore.home} – ${d.simulation.avgScore.away}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              Scores les plus probables
            </h4>
            <ul className="space-y-1.5">
              {d.simulation.topScores.map((s, i) => (
                <li key={s.score} className="flex items-center gap-2">
                  <span className="w-6 text-xs text-white/40">{i + 1}.</span>
                  <span className="w-12 font-mono text-sm">{s.score}</span>
                  <div className="bar flex-1">
                    <div className="h-full bg-accent" style={{ width: pct(s.prob / d.simulation.topScores[0].prob) }} />
                  </div>
                  <span className="w-12 text-right text-xs text-white/60">{pct(s.prob, 1)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Over / Under & BTTS</h4>
            <table className="w-full">
              <tbody>
                {d.simulation.overUnder.map((o) => (
                  <tr key={o.line}>
                    <td className="td !border-white/5 text-white/60">Over {o.line}</td>
                    <td className="td !border-white/5 text-right font-medium">{pct(o.over, 1)}</td>
                    <td className="td !border-white/5 text-white/60">Under {o.line}</td>
                    <td className="td !border-white/5 text-right font-medium">{pct(o.under, 1)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="td !border-white/5 text-white/60">BTTS Oui</td>
                  <td className="td !border-white/5 text-right font-medium">{pct(d.simulation.btts, 1)}</td>
                  <td className="td !border-white/5 text-white/60">BTTS Non</td>
                  <td className="td !border-white/5 text-right font-medium">{pct(1 - d.simulation.btts, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Étape 4+5 : Marchés & value */}
      <Section title="③ Marchés & détection de value" subtitle="Value = (proba × cote) − 1">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <th className="th">Marché</th>
                <th className="th">Pronostic</th>
                <th className="th text-right">Proba</th>
                <th className="th text-right">Cote</th>
                <th className="th text-right">Value</th>
                <th className="th">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {d.markets.map((m, i) => (
                <MarketTr key={i} m={m} />
              ))}
            </tbody>
          </table>
        </div>
        {d.apiAdvice && (
          <p className="mt-3 text-xs text-white/50">
            💡 Conseil API-Football : <span className="text-white/70">{d.apiAdvice}</span>
          </p>
        )}
      </Section>

      {/* Buteurs */}
      <Section title="④ Buteurs probables" subtitle="Top buteurs des deux équipes (hors compo officielle)">
        {d.scorers.length ? (
          <ol className="space-y-1.5">
            {d.scorers.map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-white/40">{i + 1}.</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-white/40">{s.team}</span>
                <span className="ml-auto text-xs text-white/60">{s.goalsSeason ?? "?"} buts (saison)</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-white/40">
            Données indisponibles — les buteurs probables nécessitent les compositions officielles (~1h avant le match).
          </p>
        )}
      </Section>

      {/* Étape 6 : Confiance */}
      <Section title="⑤ Score de confiance" subtitle={`${d.confidence.total}/100`}>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Forme récente", d.confidence.forme, 20],
            ["Statistiques avancées", d.confidence.statsAvancees, 20],
            ["Effectif", d.confidence.effectif, 15],
            ["Motivation", d.confidence.motivation, 10],
            ["Historique", d.confidence.historique, 10],
            ["Domicile/extérieur", d.confidence.domicileExterieur, 10],
            ["Tactique", d.confidence.tactique, 10],
            ["Marché des cotes", d.confidence.marche, 5],
          ].map(([label, val, max]) => (
            <div key={label as string} className="flex items-center gap-2">
              <span className="w-40 shrink-0 text-xs text-white/50">{label}</span>
              <div className="bar flex-1">
                <div className="h-full bg-gold" style={{ width: `${((val as number) / (max as number)) * 100}%` }} />
              </div>
              <span className="w-14 text-right text-xs text-white/60">
                {val}/{max}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Étape 8 : Verdict */}
      <section className="card border-accent/20 bg-accent-soft/30 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">⑥ Verdict final</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <VerdictItem icon="🥇" label="Meilleur pari" value={d.verdict.meilleurPari} />
          <VerdictItem icon="🥈" label="Pari le plus sûr" value={d.verdict.pariSur} />
          <VerdictItem icon="🥉" label="Value bet" value={d.verdict.valueBet} />
          <VerdictItem icon="⚠️" label="Risque principal" value={d.verdict.risquePrincipal} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">Confiance globale</span>
            <span className="text-2xl font-black text-accent">{d.verdict.confianceGlobale}</span>
            <span className="text-xs text-white/40">/100</span>
          </div>
          <div className="ml-auto rounded-lg bg-white/5 px-3 py-1.5 text-xs">
            💰 Mise recommandée : <span className="font-semibold text-white/80">{d.verdict.miseRecommandee}</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-white/30">
          Aucun pari n'est garanti. Cette analyse vise la rentabilité long terme, pas la certitude. Jouez responsable. 18+
        </p>
      </section>
    </div>
  );
}

function MarketTr({ m }: { m: MarketRow }) {
  const color =
    m.rating === "Excellente"
      ? "text-emerald-400"
      : m.rating === "Bonne"
      ? "text-accent"
      : m.rating === "Faible"
      ? "text-amber-400"
      : "text-white/40";
  return (
    <tr>
      <td className="td text-white/60">{m.market}</td>
      <td className="td font-medium">{m.pick}</td>
      <td className="td text-right">{pct(m.prob, 1)}</td>
      <td className="td text-right">{m.odd ? m.odd.toFixed(2) : "—"}</td>
      <td className={`td text-right ${m.value != null && m.value > 0 ? "text-emerald-400" : "text-white/40"}`}>
        {m.value != null ? `${m.value > 0 ? "+" : ""}${(m.value * 100).toFixed(1)}%` : "—"}
      </td>
      <td className={`td ${color}`}>{m.rating ?? "—"}</td>
    </tr>
  );
}

function VerdictItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-3">
      <div className="text-xs text-white/40">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function ProbTripleBar({ t, home, away }: { t: { home: number; draw: number; away: number }; home: string; away: string }) {
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-lg text-xs font-semibold">
        <div className="flex items-center justify-center bg-accent/80 text-pitch-900" style={{ width: pct(t.home) }}>
          {pct(t.home)}
        </div>
        <div className="flex items-center justify-center bg-white/15" style={{ width: pct(t.draw) }}>
          {pct(t.draw)}
        </div>
        <div className="flex items-center justify-center bg-gold/80 text-pitch-900" style={{ width: pct(t.away) }}>
          {pct(t.away)}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-white/50">
        <span className="truncate">1 · {home}</span>
        <span>N · Nul</span>
        <span className="truncate">2 · {away}</span>
      </div>
    </div>
  );
}

function MiniTriple({ title, t }: { title: string; t: { home: number; draw: number; away: number } }) {
  return (
    <div className="rounded-lg border border-white/5 p-3">
      <div className="mb-2 text-xs font-semibold text-white/50">{title}</div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="font-bold text-accent">{pct(t.home)}</div>
          <div className="text-[10px] text-white/40">1</div>
        </div>
        <div>
          <div className="font-bold">{pct(t.draw)}</div>
          <div className="text-[10px] text-white/40">N</div>
        </div>
        <div>
          <div className="font-bold text-gold">{pct(t.away)}</div>
          <div className="text-[10px] text-white/40">2</div>
        </div>
      </div>
    </div>
  );
}

function TeamBig({ logo, name }: { logo: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {logo && <img src={logo} alt="" className="h-14 w-14 object-contain" />}
      <span className="text-sm font-semibold leading-tight">{name}</span>
    </div>
  );
}

function Avail({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`chip ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/40"}`}>
      {ok ? "✓" : "—"} {label}
    </span>
  );
}
