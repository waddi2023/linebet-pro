// Encart d'erreur réutilisable : message clair selon le type (quota, clé manquante, etc.).

export function ApiErrorCard({ code, message }: { code: string; message: string }) {
  if (code === "SUSPENDED") {
    return (
      <div className="card border-rose-500/30 bg-rose-500/5 p-4 text-sm sm:p-5">
        <p className="font-semibold text-rose-300">⛔ Compte API suspendu</p>
        <p className="mt-1 text-fg/60">
          Le compte API-Football a été <span className="text-fg/80">suspendu au niveau du compte</span> — ce n'est{" "}
          <span className="text-fg/80">pas</span> le quota quotidien, donc ça ne se débloque pas automatiquement après 24 h.
          Cela arrive souvent après un usage trop intensif du plan gratuit.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-fg/50">
          <li>
            Connecte-toi à{" "}
            <a className="text-accent underline" href="https://dashboard.api-football.com/" target="_blank" rel="noreferrer">
              dashboard.api-football.com
            </a>{" "}
            pour voir la raison et réactiver le compte.
          </li>
          <li>Évite de rafraîchir en boucle : chaque appel pendant la suspension peut la prolonger.</li>
          <li>Si besoin : régénère la clé API ou contacte le support depuis le dashboard.</li>
        </ul>
      </div>
    );
  }

  if (code === "QUOTA") {
    return (
      <div className="card border-orange-500/30 bg-orange-500/5 p-4 text-sm sm:p-5">
        <p className="font-semibold text-orange-300">🕒 Quota quotidien de l'API atteint</p>
        <p className="mt-1 text-fg/60">
          Le plan gratuit d'API-Football est limité à <span className="text-fg/80">100 requêtes/jour</span>. Le quota se
          réinitialise automatiquement chaque jour — réessaie plus tard ou demain.
        </p>
        <p className="mt-2 text-xs text-fg/40">
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
        <p className="mt-1 text-fg/60">{message}</p>
        <p className="mt-2 text-fg/50">
          Ajoute la variable <code className="rounded bg-fg/10 px-1">API_FOOTBALL_KEY</code> (clé gratuite sur{" "}
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
      <p className="mt-1 text-fg/60">{message}</p>
    </div>
  );
}
