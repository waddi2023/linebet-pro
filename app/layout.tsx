import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QuotaBadge } from "@/components/QuotaBadge";

export const metadata: Metadata = {
  title: "LineBet Pro — Agent Expert Paris Sportifs",
  description:
    "Analyses de paris à valeur attendue positive (EV+) : données réelles API-Football, simulation Poisson Monte-Carlo, détection de value bets et score de confiance.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e14" },
  ],
};

// Applique le thème AVANT le premier paint (évite le flash). Défaut : sombre.
const themeInitScript = `
(function(){try{
  var t = localStorage.getItem('theme');
  if(!t){ t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
  if(t === 'dark'){ document.documentElement.classList.add('dark'); }
  else { document.documentElement.classList.remove('dark'); }
}catch(e){ document.documentElement.classList.add('dark'); }})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-fg/5 bg-base/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-black text-pitch-900">
                LB
              </span>
              <span className="hidden text-sm font-semibold tracking-tight xs:inline sm:text-base">
                LineBet <span className="text-accent">Pro</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1.5 text-xs sm:gap-3 sm:text-sm">
              <Link href="/" className="px-1.5 py-2 text-fg/60 transition hover:text-fg">
                Matchs
              </Link>
              <Link
                href="/live"
                className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-2 font-medium text-red-300 transition hover:bg-red-500/25"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> En direct
              </Link>
              <Link
                href="/best"
                className="rounded-lg bg-accent/15 px-2.5 py-2 font-medium text-accent transition hover:bg-accent/25"
              >
                🔥 <span className="hidden sm:inline">Meilleurs </span>Paris
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-3 py-8 text-center text-xs text-fg/30 sm:px-4">
          <QuotaBadge />
          <p className="mt-2">
            Données : API-Football · Simulation Poisson Monte-Carlo (10 000 tirages). Paris à risque — jouez responsable. 18+
          </p>
        </footer>
      </body>
    </html>
  );
}
