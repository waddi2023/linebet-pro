"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LiveListItem, HeatItem, HeatScan } from "@/lib/live";
import { ApiErrorCard } from "@/components/ApiErrorCard";

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}
function flames(heat: number) {
  if (heat >= 70) return "🔥🔥🔥";
  if (heat >= 50) return "🔥🔥";
  if (heat >= 30) return "🔥";
  return "·";
}

export default function LivePage() {
  const [mode, setMode] = useState<"all" | "hot">("all");
  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              <span className="mr-1 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 align-middle" /> Matchs en direct
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Pression, occasions et <span className="text-white/70">probabilité de but supplémentaire</span> en temps réel.
            </p>
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-lg border border-white/10 bg-pitch-700 p-1 text-sm">
          <button
            onClick={() => setMode("all")}
            className={`rounded-md px-3 py-2 font-medium transition ${mode === "all" ? "bg-accent text-pitch-900" : "text-white/60 hover:text-white"}`}
          >
            Tous
          </button>
          <button
            onClick={() => setMode("hot")}
            className={`rounded-md px-3 py-2 font-medium transition ${mode === "hot" ? "bg-red-500 text-white" : "text-white/60 hover:text-white"}`}
          >
            🔥 Matchs chauds
          </button>
        </div>
      </section>

      {mode === "all" ? <AllList /> : <HotList />}
    </div>
  );
}

function AllList() {
  const [list, setList] = useState<LiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/live");
      const json = await res.json();
      if (!res.ok) setError({ code: json.error, message: json.message });
      else setList(json.fixtures);
    } catch (e) {
      setError({ code: "NETWORK", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={load} disabled={loading} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-pitch-900 transition hover:brightness-110 disabled:opacity-50">
          {loading ? "…" : "↻ Rafraîchir"}
        </button>
      </div>
      {error && <ErrorCard error={error} />}
      {loading && <Skeletons />}
      {!loading && !error && list.length === 0 && (
        <div className="card p-8 text-center text-sm text-white/50">Aucun match en direct actuellement. ⚽</div>
      )}
      {list.map((m) => (
        <Link key={m.id} href={`/live/${m.id}`} className="card flex items-center gap-2 p-3 transition hover:border-accent/40 sm:gap-3">
          <span className="flex w-10 shrink-0 items-center gap-1 text-[11px] font-bold text-red-400 sm:w-14 sm:text-xs">
            <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 xs:inline-block" />
            {m.elapsed != null ? `${m.elapsed}'` : m.status}
          </span>
          <Teams m={m} />
          <span className="ml-auto hidden shrink-0 text-xs text-accent lg:inline">Analyser →</span>
        </Link>
      ))}
    </div>
  );
}

function HotList() {
  const [data, setData] = useState<HeatScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [limit, setLimit] = useState(12);

  const scan = useCallback(async (lim: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/live?mode=hot&limit=${lim}`);
      const json = await res.json();
      if (!res.ok) setError({ code: json.error, message: json.message });
      else setData(json);
    } catch (e) {
      setError({ code: "NETWORK", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan(limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/40">
          Classement par « chaleur » : intensité + proba de but + dominance. ⚠️ {limit} requêtes API par scan.
        </p>
        <div className="flex items-center gap-2">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-white/10 bg-pitch-700 px-2 py-1.5 text-sm">
            {[8, 12, 16, 20].map((n) => (
              <option key={n} value={n}>{n} matchs</option>
            ))}
          </select>
          <button onClick={() => scan(limit)} disabled={loading} className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
            {loading ? "Scan…" : "↻ Scanner"}
          </button>
        </div>
      </div>

      {error && <ErrorCard error={error} />}
      {loading && <Skeletons />}
      {data?.notes?.map((n, i) => (
        <p key={i} className="text-[11px] text-white/40">{n}</p>
      ))}
      {data && !loading && data.items.length === 0 && (
        <div className="card p-8 text-center text-sm text-white/50">Aucun match analysable en direct (10′–88′). ⚽</div>
      )}
      {data?.items.map((m, i) => (
        <Link key={m.id} href={`/live/${m.id}`} className="card block p-3 transition hover:border-red-500/40">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="flex w-9 shrink-0 flex-col items-center sm:w-12">
              <span className="text-base leading-none sm:text-lg">{flames(m.heat)}</span>
              <span className="text-[10px] font-bold text-red-400">{m.heat}</span>
            </span>
            <span className="flex w-9 shrink-0 items-center gap-1 text-[11px] font-bold text-red-400 sm:w-12 sm:text-xs">
              <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 xs:inline-block" />
              {m.elapsed != null ? `${m.elapsed}'` : m.status}
            </span>
            <Teams m={m} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:pl-24">
            <span className="chip bg-emerald-500/10 text-emerald-300">⚽ but +{pct(m.probMore)}</span>
            {m.intensityLevel && (
              <span className="chip bg-amber-500/10 text-amber-300">Intensité {m.intensityLevel}</span>
            )}
            {m.leadTeam && (
              <span className="chip bg-white/5 text-white/60">
                Pression {m.leadTeam === "home" ? m.home.name : m.away.name} {Math.max(m.pressureHome, m.pressureAway)}%
              </span>
            )}
            {!m.hasStats && <span className="chip bg-white/5 text-white/40">stats n/d</span>}
            <span className="ml-auto text-accent">Analyser →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Teams({ m }: { m: LiveListItem }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-xs sm:gap-2 sm:text-sm">
        <span className="truncate">{m.home.name}</span>
        {m.home.logo && <img src={m.home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />}
      </span>
      <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-sm font-bold">
        {m.goals.home ?? 0} - {m.goals.away ?? 0}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
        {m.away.logo && <img src={m.away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />}
        <span className="truncate">{m.away.name}</span>
      </span>
    </>
  );
}

function ErrorCard({ error }: { error: { code: string; message: string } }) {
  return <ApiErrorCard code={error.code} message={error.message} />;
}

function Skeletons() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-16 animate-pulse bg-white/5" />
      ))}
    </div>
  );
}
