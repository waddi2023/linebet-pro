"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      title={dark ? "Mode clair" : "Mode sombre"}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-fg/10 bg-elevated text-base transition hover:bg-fg/10"
    >
      {/* évite le flash d'icône incorrecte avant hydratation */}
      <span suppressHydrationWarning>{mounted ? (dark ? "☀️" : "🌙") : "🌗"}</span>
    </button>
  );
}
