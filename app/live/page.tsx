"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LiveListItem } from "@/lib/live";

export default function LivePage() {
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
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="mr-1 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 align-middle" /> Matchs en direct
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Sélectionne un match : l'agent te dit s'il y a une <span className="text-white/70">probabilité de but supplémentaire</span>.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-pitch-900 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "…" : "↻ Rafraîchir"}
          </button>
        </div>
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
            <div key={i} className="card h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="card p-8 text-center text-sm text-white/50">
          Aucun match en direct actuellement. Reviens à l'heure des matchs ⚽
        </div>
      )}

      <div className="space-y-2">
        {list.map((m) => (
          <Link
            key={m.id}
            href={`/live/${m.id}`}
            className="card flex items-center gap-3 p-3 transition hover:border-accent/40"
          >
            <span className="flex w-14 shrink-0 items-center gap-1 text-xs font-bold text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              {m.elapsed != null ? `${m.elapsed}'` : m.status}
            </span>
            <span className="flex flex-1 items-center justify-end gap-2 text-right text-sm">
              <span className="truncate">{m.home.name}</span>
              {m.home.logo && <img src={m.home.logo} alt="" className="h-5 w-5 object-contain" />}
            </span>
            <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-sm font-bold">
              {m.goals.home ?? 0} - {m.goals.away ?? 0}
            </span>
            <span className="flex flex-1 items-center gap-2 text-sm">
              {m.away.logo && <img src={m.away.logo} alt="" className="h-5 w-5 object-contain" />}
              <span className="truncate">{m.away.name}</span>
            </span>
            <span className="ml-auto hidden shrink-0 text-xs text-accent sm:inline">Analyser →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
