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

          {data.live && <LiveAlerts d={data} />}

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

          {data.live && data.hasStats && data.pressure.dataConfidence !== "none" && (
            <PressureSection d={data} />
          )}

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
                  <StatRow label="Tirs dans la surface" h={data.teams.home.shotsInsidebox} a={data.teams.away.shotsInsidebox} />
                  <StatRow label="Tirs bloqués" h={data.teams.home.blockedShots} a={data.teams.away.blockedShots} />
                  <StatRow label="Corners" h={data.teams.home.corners} a={data.teams.away.corners} />
                  <StatRow label="Arrêts gardien" h={data.teams.home.gkSaves} a={data.teams.away.gkSaves} />
                  <StatRow label="Possession" h={Math.round(data.teams.home.possession * 100)} a={Math.round(data.teams.away.possession * 100)} suffix="%" />
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

function LiveAlerts({ d }: { d: LiveInsight }) {
  const alerts: { icon: string; text: string; cls: string }[] = [];
  const p = d.pressure;

  if (p.dataConfidence !== "none" && p.pressureMargin >= 30) {
    const lead = p.pressureHome > p.pressureAway ? d.teams.home : d.teams.away;
    const val = Math.max(p.pressureHome, p.pressureAway);
    alerts.push({
      icon: "🔴",
      text: `${lead.name} met une grosse pression (${val}% de dominance offensive)`,
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    });
  }
  if (d.probAtLeastOneMore >= 0.7) {
    alerts.push({
      icon: "🔥",
      text: `But supplémentaire très probable (${Math.round(d.probAtLeastOneMore * 100)}%) — match chaud`,
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    });
  }
  if (p.intensityLevel === "Élevé") {
    alerts.push({
      icon: "⚡",
      text: `Match à haute intensité (${p.rate10} tirs+corners / 10 min)`,
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    });
  }

  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${a.cls}`}>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
          <span>{a.icon} {a.text}</span>
        </div>
      ))}
    </div>
  );
}

function confidenceBadge(c: LiveInsight["pressure"]["dataConfidence"]) {
  switch (c) {
    case "xg":
      return { label: "xG réel", cls: "bg-emerald-500/15 text-emerald-300" };
    case "shots":
      return { label: "estimé (tirs)", cls: "bg-amber-500/15 text-amber-300" };
    case "shots_coarse":
      return { label: "estimé (grossier)", cls: "bg-amber-500/15 text-amber-300" };
    case "possession":
      return { label: "possession seule", cls: "bg-rose-500/15 text-rose-300" };
    default:
      return { label: "indisponible", cls: "bg-white/10 text-white/40" };
  }
}

function PressureSection({ d }: { d: LiveInsight }) {
  const p = d.pressure;
  const h = d.teams.home;
  const a = d.teams.away;
  const badge = confidenceBadge(p.dataConfidence);
  const intensity = p.intensityLevel
    ? `${p.lowConfidence ? "~" : ""}${p.intensityLevel}`
    : "—";
  const intensityCls =
    p.intensityLevel === "Élevé"
      ? "bg-emerald-500/15 text-emerald-300"
      : p.intensityLevel === "Moyen"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-white/10 text-white/50";

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold">⚡ Pression & dominance offensive</h3>
        <span className={`chip ${badge.cls}`}>{badge.label}</span>
        <span className={`chip ${intensityCls}`}>Intensité {intensity}</span>
        {p.rate10 != null && (
          <span className="chip bg-white/5 text-white/50">{p.rate10} tirs+corners / 10′</span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-white/40">
        Dominance cumulée depuis le coup d'envoi — pas le momentum des dernières minutes.
      </p>

      {/* Barre de pression relative */}
      <div className="flex h-8 overflow-hidden rounded-lg text-xs font-semibold">
        <div className="flex items-center justify-center bg-accent/80 text-pitch-900" style={{ width: `${p.pressureHome}%` }}>
          {p.pressureHome}%
        </div>
        <div className="flex items-center justify-center bg-gold/80 text-pitch-900" style={{ width: `${p.pressureAway}%` }}>
          {p.pressureAway}%
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-white/50">
        <span className="truncate">{h.name}</span>
        <span className="truncate">{a.name}</span>
      </div>

      {/* Occasions par équipe */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <OccasionCard t={h} goals={d.score.home} />
        <OccasionCard t={a} goals={d.score.away} />
      </div>

      {p.flags.length > 0 && (
        <ul className="mt-3 list-inside list-disc space-y-0.5 text-[11px] text-white/40">
          {p.flags.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OccasionCard({ t, goals }: { t: TeamLiveStats; goals: number }) {
  const xgVal = t.xg != null ? t.xg : t.threatXg;
  const xgBadge = t.xgSource === "real" ? "xG réel" : "xG estimé";
  const xgCls = t.xgSource === "real" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="mb-2 truncate text-xs font-semibold">{t.name}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Occasions" value={t.chances != null ? String(t.chances) : "n/d"} />
        <Metric label="Grosses occ." value={t.bigChances != null ? String(t.bigChances) : "n/d"} />
        <Metric label={xgBadge} value={xgVal.toFixed(2)} valueCls={xgCls} />
      </div>
      {t.bigChances != null && t.bigChances > 0 && (
        <div className="mt-2 text-center text-[10px] text-white/40">
          Efficacité : {goals}/{t.bigChances} grosse(s) occ. converties
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, valueCls = "" }: { label: string; value: string; valueCls?: string }) {
  return (
    <div className="rounded-md bg-white/5 p-1.5">
      <div className="truncate text-[9px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={`text-base font-bold ${valueCls}`}>{value}</div>
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
