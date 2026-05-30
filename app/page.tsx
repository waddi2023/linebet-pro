"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { FixtureLite } from "@/lib/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [date, setDate] = useState(todayISO());
  const [fixtures, setFixtures] = useState<FixtureLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fixtures?date=${d}`);
      const json = await res.json();
      if (!res.ok) {
        setError({ code: json.error, message: json.message });
        setFixtures([]);
      } else {
        setFixtures(json.fixtures);
      }
    } catch (e) {
      setError({ code: "NETWORK", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const filtered = fixtures.filter((f) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      f.home.name.toLowerCase().includes(q) ||
      f.away.name.toLowerCase().includes(q) ||
      f.league.name.toLowerCase().includes(q) ||
      f.league.country.toLowerCase().includes(q)
    );
  });

  // Regroupe par championnat.
  const groups = filtered.reduce((acc, f) => {
    const key = `${f.league.country} · ${f.league.name}`;
    (acc[key] ||= []).push(f);
    return acc;
  }, {} as Record<string, FixtureLite[]>);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-bold tracking-tight">Analyse de match EV+</h1>
        <p className="mt-1 text-sm text-white/50">
          Choisis une date, sélectionne un match, et l'agent produit l'analyse complète : probabilités 1X2,
          simulation de 10 000 matchs, marchés, value bets et score de confiance.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-pitch-700 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Filtrer (équipe, championnat, pays)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-pitch-700 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs text-white/40">
            {loading ? "Chargement…" : `${filtered.length} match(s)`}
          </span>
        </div>
      </section>

      {error && (
        <div className="card border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <p className="font-semibold text-amber-300">⚠️ {humanError(error.code)}</p>
          <p className="mt-1 text-white/60">{error.message}</p>
          {error.code === "NO_KEY" && (
            <p className="mt-2 text-white/50">
              Ajoute la variable <code className="rounded bg-white/10 px-1">API_FOOTBALL_KEY</code> (clé gratuite sur{" "}
              <a className="text-accent underline" href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer">
                dashboard.api-football.com
              </a>
              ) dans tes variables d'environnement Vercel, puis redéploie.
            </p>
          )}
        </div>
      )}

      {!error && !loading && filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-white/50">
          Aucun match pour cette date / ce filtre.
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([league, list]) => (
          <section key={league} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 bg-pitch-700/40 px-4 py-2">
              {list[0].league.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={list[0].league.logo} alt="" className="h-5 w-5 object-contain" />
              )}
              <span className="text-sm font-semibold">{league}</span>
            </div>
            <ul>
              {list.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/match/${f.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/5"
                  >
                    <span className="w-12 shrink-0 text-xs text-white/40">
                      {new Date(f.timestamp * 1000).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Team logo={f.home.logo} name={f.home.name} align="right" />
                    <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-xs text-white/60">
                      {f.goalsHome != null ? `${f.goalsHome}-${f.goalsAway}` : "vs"}
                    </span>
                    <Team logo={f.away.logo} name={f.away.name} align="left" />
                    <span className="ml-auto hidden shrink-0 text-accent sm:inline">Analyser →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Team({ logo, name, align }: { logo: string; name: string; align: "left" | "right" }) {
  return (
    <span
      className={`flex flex-1 items-center gap-2 ${align === "right" ? "justify-end text-right" : "justify-start"}`}
    >
      {align === "left" && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-5 object-contain" />
      )}
      <span className="truncate text-sm">{name}</span>
      {align === "right" && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-5 object-contain" />
      )}
    </span>
  );
}

function humanError(code: string) {
  switch (code) {
    case "NO_KEY":
      return "Clé API-Football manquante";
    case "NETWORK":
      return "Erreur réseau";
    default:
      return "Erreur API";
  }
}
