"use client";

import { useEffect, useState } from "react";

interface Quota {
  current: number;
  limit: number;
  remaining: number;
}

export function QuotaBadge() {
  const [q, setQ] = useState<Quota | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/quota")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error || typeof d.current !== "number") setHidden(true);
        else setQ(d);
      })
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, []);

  if (hidden || !q) return null;

  const ratio = q.limit > 0 ? q.current / q.limit : 0;
  const color =
    ratio >= 0.9 ? "text-rose-400" : ratio >= 0.7 ? "text-amber-400" : "text-fg/40";
  const barColor = ratio >= 0.9 ? "bg-rose-400" : ratio >= 0.7 ? "bg-amber-400" : "bg-accent";

  return (
    <div className="mx-auto flex max-w-[220px] flex-col items-center gap-1">
      <span className={`text-[11px] font-medium ${color}`}>
        🔢 {q.current}/{q.limit} requêtes API utilisées aujourd'hui
      </span>
      <div className="bar h-1 w-full">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
