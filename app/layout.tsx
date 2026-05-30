import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LineBet Pro — Agent Expert Paris Sportifs",
  description:
    "Analyses de paris à valeur attendue positive (EV+) : données réelles API-Football, simulation Poisson Monte-Carlo, détection de value bets et score de confiance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-pitch-900/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-pitch-900 font-black">
                LB
              </span>
              <span className="font-semibold tracking-tight">
                LineBet <span className="text-accent">Pro</span>
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-white/60 transition hover:text-white">
                Matchs
              </Link>
              <Link
                href="/best"
                className="rounded-lg bg-accent/15 px-3 py-1.5 font-medium text-accent transition hover:bg-accent/25"
              >
                🔥 Meilleurs paris
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-white/30">
          Données : API-Football · Simulation Poisson Monte-Carlo (10 000 tirages). Paris à risque — jouez responsable. 18+
        </footer>
      </body>
    </html>
  );
}
