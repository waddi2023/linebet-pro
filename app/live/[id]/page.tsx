"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LiveInsight, TeamLiveStats } from "@/lib/live";

function pct(x: number, d = 0) {
  return `${(x * 100).toFixed(d)}%`;
}

export default function LiveMatchPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<LiveInsight | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/live?fixture=${params.id}`);
      const json = await res.json();
      if (!res.ok) setError({ code: json.error, message: json.message });
      else {
        setData(json);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString("fr-FR"));
      }
    } catch (e) {
      setError({ code: "NETWORK", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh toutes les 60s (consomme du quota API → opt-in).
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(load, 60000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, load]);

  return (
    <div className="space-y-5">
      <Link href="/live" className="inline-block text-sm text-white/50 hover:text-accent">
        ← Matchs en direct
      </Link>

      {loading && <div className="card h-64 animate-pulse bg-white/5" />}
      {error && (
        <div className="card border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <p className="font-semibold text-amber-300">⚠️ Analyse impossible</p>
          <p className="mt-1 text-white/60">{error.message}</p>
        </div>
      )}

      {data && (
        <>
          {/* Score & minute */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between text-xs text-white/40">
              <span className="flex items-center gap-2">
                {data.fixture.league.logo && (
                  <img src={data.fixture.league.logo} alt="" className="h-4 w-4 object-contain" />
                )}
                {data.fixture.league.country} · {data.fixture.league.name}
              </span>
              {data.live && (
                <span className="flex items-center gap-1 font-bold text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  {data.status} · {data.elapsed}′
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 items-center gap-2">
              <TeamHead name={data.fixture.home.name} logo={data.fixture.home.logo} />
              <div className="text-center">
                <div className="text-3xl font-black">
                  {data.score.home} <span className="text-white/30">-</span> {data.score.away}
                </div>
                {data.live && <div className="mt-1 text-[11px] text-white/40">{data.minutesRemaining}′ restantes</div>}
              </div>
              <TeamHead name={data.fixture.away.name} logo={data.fixture.away.logo} />
            </div>
          </section>

          {/* VERDICT BUT SUPPLÉMENTAIRE */}
          <section className={`card p-5 ${verdictBg(data.verdict.moreGoals)}`}>
            <div className="text-xs uppercase tracking-wide text-white/50">⚽ Probabilité de but supplémentaire</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <span className={`text-3xl font-black ${verdictColor(data.verdict.moreGoals)}`}>
                {data.verdict.moreGoals}
              </span>
              {data.live && (
                <span className="text-2xl font-bold">{pct(data.probAtLeastOneMore)}</span>
              )}
            </div>
            <p className="mt-2 text-sm text-white/70">{data.verdict.headline}</p>
            <p className="mt-1 text-sm font-medium">{data.verdict.reco}</p>

            {data.live && (
              <div className="mt-4">
                <div className="bar h-3">
                  <div
                    className={`h-full ${barColor(data.verdict.moreGoals)}`}
                    style={{ width: pct(data.probAtLeastOneMore) }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/40">
                  <span>≥1 but : {pct(data.probAtLeastOneMore)}</span>
                  <span>≥2 buts : {pct(data.probAtLeastTwoMore)}</span>
                </div>
              </div>
            )}
          </section>

          {data.live && (
            <>
              {/* Prochain but + projections */}
              <section className="card p-5">
                <h3 className="mb-3 text-sm font-bold">Qui marque le prochain but ?</h3>
                <div className="flex h-8 overflow-hidden rounded-lg text-xs font-semibold">
                  <div
                    className="flex items-center justify-center bg-accent/80 text-pitch-900"
                    style={{ width: `${data.nextGoalLean.homePct}%` }}
                  >
                    {data.nextGoalLean.homePct}%
                  </div>
                  <div
                    className="flex items-center justify-center bg-gold/80 text-pitch-900"
                    style={{ width: `${data.nextGoalLean.awayPct}%` }}
                  >
                    {data.nextGoalLean.awayPct}%
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/50">
                  <span className="truncate">{data.fixture.home.name}</span>
                  <span className="truncate">{data.fixture.away.name}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <Stat label="Buts attendus (reste)" value={data.expectedRemainingGoals.toFixed(2)} />
                  <Stat label="Total final projeté" value={data.projectedFinalTotal.toFixed(2)} />
                  <Stat label="Buts actuels" value={String(data.score.total)} />
                </div>
              </section>

              {/* Over/Under sur le total FINAL */}
              <section className="card p-5">
                <h3 className="mb-3 text-sm font-bold">Over / Under sur le total final</h3>
                <table className="w-full">
                  <tbody>
                    {data.ftLines.map((l) => (
                      <tr key={l.line}>
                        <td className="td !border-white/5 text-white/60">Over {l.line}</td>
                        <td className="td !border-white/5">
                          <div className="bar">
                            <div className="h-full bg-accent" style={{ width: pct(l.over) }} />
                          </div>
                        </td>
                        <td className="td !border-white/5 w-14 text-right font-medium">{pct(l.over)}</td>
                        <td className="td !border-white/5 w-14 text-right text-white/50">Under {pct(l.under)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* Stats live */}
              {data.hasStats && (
                <section className="card p-5">
                  <h3 className="mb-3 text-sm font-bold">Statistiques en direct</h3>
                  <StatRow label="Tirs cadrés" h={data.teams.home.shotsOnGoal} a={data.teams.away.shotsOnGoal} />
                  <StatRow label="Tirs totaux" h={data.teams.home.totalShots} a={data.teams.away.totalShots} />
                  <StatRow label="Attaques dangereuses" h={data.teams.home.dangerousAttacks} a={data.teams.away.dangerousAttacks} />
                  <StatRow label="Corners" h={data.teams.home.corners} a={data.teams.away.corners} />
                  <StatRow label="Possession" h={Math.round(data.teams.home.possession * 100)} a={Math.round(data.teams.away.possession * 100)} suffix="%" />
                  <StatRow label="xG estimé" h={data.teams.home.xgEstimate} a={data.teams.away.xgEstimate} />
                </section>
              )}
            </>
          )}

          {data.notes.length > 0 && (
            <div className="card border-sky-500/20 bg-sky-500/5 p-4 text-xs text-white/55">
              <ul className="list-inside list-disc space-y-0.5">
                {data.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Contrôles refresh */}
          <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="rounded-lg bg-accent px-3 py-2 font-semibold text-pitch-900 transition hover:brightness-110"
            >
              ↻ Rafraîchir
            </button>
            <label className="flex items-center gap-2 text-white/60">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Auto-refresh 60s
            </label>
            {updatedAt && <span className="ml-auto text-xs text-white/30">MAJ : {updatedAt}</span>}
          </div>
          <p className="text-center text-[11px] text-white/30">
            Estimations probabilistes en direct — aucune certitude. Le football reste imprévisible. Jouez responsable. 18+
          </p>
        </>
      )}
    </div>
  );
}

function verdictColor(v: LiveInsight["verdict"]["moreGoals"]) {
  if (v === "OUI" || v === "PLUTÔT OUI") return "text-emerald-400";
  if (v === "INCERTAIN") return "text-amber-400";
  return "text-rose-400";
}
function verdictBg(v: LiveInsight["verdict"]["moreGoals"]) {
  if (v === "OUI" || v === "PLUTÔT OUI") return "border-emerald-500/25 bg-emerald-500/5";
  if (v === "INCERTAIN") return "border-amber-500/25 bg-amber-500/5";
  return "border-rose-500/25 bg-rose-500/5";
}
function barColor(v: LiveInsight["verdict"]["moreGoals"]) {
  if (v === "OUI" || v === "PLUTÔT OUI") return "bg-emerald-400";
  if (v === "INCERTAIN") return "bg-amber-400";
  return "bg-rose-400";
}

function TeamHead({ name, logo }: { name: string; logo: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      {logo && <img src={logo} alt="" className="h-12 w-12 object-contain" />}
      <span className="text-sm font-semibold leading-tight">{name}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}

function StatRow({ label, h, a, suffix = "" }: { label: string; h: number; a: number; suffix?: string }) {
  const total = h + a || 1;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{h}{suffix}</span>
        <span className="text-white/40">{label}</span>
        <span className="font-medium">{a}{suffix}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5">
        <div className="h-full rounded-l bg-accent/70" style={{ width: `${(h / total) * 100}%` }} />
        <div className="h-full rounded-r bg-gold/70" style={{ width: `${(a / total) * 100}%` }} />
      </div>
    </div>
  );
}
