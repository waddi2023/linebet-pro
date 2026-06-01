"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { FixtureLite } from "@/lib/types";
import { ApiErrorCard } from "@/components/ApiErrorCard";

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
    <div className="space-y-5 sm:space-y-6">
      <section className="card p-4 sm:p-5">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Analyse de match EV+</h1>
        <p className="mt-1 text-sm text-fg/50">
          Choisis une date, sélectionne un match, et l'agent produit l'analyse complète : probabilités 1X2,
          simulation de 10 000 matchs, marchés, value bets et score de confiance.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-fg/10 bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Filtrer (équipe, championnat, pays)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-fg/10 bg-elevated px-3 py-2 text-sm outline-none focus:border-accent sm:min-w-[220px] sm:flex-1"
          />
          <span className="text-xs text-fg/40">
            {loading ? "Chargement…" : `${filtered.length} match(s)`}
          </span>
        </div>
        <Link
          href="/best"
          className="mt-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2.5 transition hover:bg-accent/20 sm:gap-3 sm:px-4 sm:py-3"
        >
          <span className="text-lg sm:text-xl">🔥</span>
          <span className="text-xs sm:text-sm">
            <span className="font-semibold text-accent">Tu ne sais pas sur quoi parier ?</span>
            <span className="text-fg/60"> Laisse l'agent choisir les meilleurs matchs du jour →</span>
          </span>
        </Link>
      </section>

      {error && <ApiErrorCard code={error.code} message={error.message} />}

      {!error && !loading && filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-fg/50">
          Aucun match pour cette date / ce filtre.
        </div>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([league, list]) => (
          <section key={league} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-fg/5 bg-elevated/40 px-4 py-2">
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
                    className="flex items-center gap-2 px-3 py-3 transition hover:bg-fg/5 sm:gap-3 sm:px-4"
                  >
                    <span className="w-10 shrink-0 text-[11px] text-fg/40 sm:w-12 sm:text-xs">
                      {new Date(f.timestamp * 1000).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Team logo={f.home.logo} name={f.home.name} align="right" />
                    <span className="shrink-0 rounded bg-fg/5 px-2 py-0.5 text-xs text-fg/60">
                      {f.goalsHome != null ? `${f.goalsHome}-${f.goalsAway}` : "vs"}
                    </span>
                    <Team logo={f.away.logo} name={f.away.name} align="left" />
                    <span className="ml-auto hidden shrink-0 text-accent lg:inline">Analyser →</span>
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
      className={`flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 ${align === "right" ? "justify-end text-right" : "justify-start"}`}
    >
      {align === "left" && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
      )}
      <span className="truncate text-xs sm:text-sm">{name}</span>
      {align === "right" && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
      )}
    </span>
  );
}
