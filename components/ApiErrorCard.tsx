// Encart d'erreur réutilisable : message clair selon le type (quota, clé manquante, etc.).

export function ApiErrorCard({ code, message }: { code: string; message: string }) {
  if (code === "QUOTA") {
    return (
      <div className="card border-orange-500/30 bg-orange-500/5 p-4 text-sm sm:p-5">
        <p className="font-semibold text-orange-300">🕒 Quota quotidien de l'API atteint</p>
        <p className="mt-1 text-white/60">
          Le plan gratuit d'API-Football est limité à <span className="text-white/80">100 requêtes/jour</span>. Le quota se
          réinitialise automatiquement chaque jour — réessaie plus tard ou demain.
        </p>
        <p className="mt-2 text-xs text-white/40">
          Pour lever la limite, passe à un plan supérieur sur{" "}
          <a className="text-accent underline" href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer">
            dashboard.api-football.com
          </a>
          .
        </p>
      </div>
    );
  }

  if (code === "NO_KEY") {
    return (
      <div className="card border-amber-500/30 bg-amber-500/5 p-4 text-sm sm:p-5">
        <p className="font-semibold text-amber-300">⚠️ Clé API-Football manquante</p>
        <p className="mt-1 text-white/60">{message}</p>
        <p className="mt-2 text-white/50">
          Ajoute la variable <code className="rounded bg-white/10 px-1">API_FOOTBALL_KEY</code> (clé gratuite sur{" "}
          <a className="text-accent underline" href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer">
            dashboard.api-football.com
          </a>
          ) dans tes variables d'environnement Vercel, puis redéploie.
        </p>
      </div>
    );
  }

  return (
    <div className="card border-amber-500/30 bg-amber-500/5 p-4 text-sm sm:p-5">
      <p className="font-semibold text-amber-300">⚠️ {code === "NETWORK" ? "Erreur réseau" : "Erreur"}</p>
      <p className="mt-1 text-white/60">{message}</p>
    </div>
  );
}
