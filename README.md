# ⚽ LineBet Pro — Agent Expert Paris Sportifs

Application web qui transforme l'agent **« Expert Paris Sportifs Pro »** en outil concret : à partir de **données réelles** (API-Football) et d'une **simulation Poisson Monte-Carlo (10 000 matchs)**, elle produit pour chaque match une analyse EV+ complète.

> ⚠️ Aide à la décision, pas une garantie. Aucun pari n'est certain. Jouez responsable. 18+

## ✨ Fonctionnalités

- 📅 Liste des matchs du jour par championnat (recherche + filtre par date)
- 🎯 **Probabilités 1X2** : mélange du modèle Poisson et des prédictions API-Football
- 🎲 **Simulation 10 000 matchs** : score moyen, scores les plus probables, distribution
- 📊 **Marchés** : 1X2, double chance, Over/Under (0.5→3.5), BTTS, handicap
- 💎 **Détection de value bets** : `value = (proba × cote) − 1`, classée Excellente / Bonne / Faible
- ⚽ **Buteurs probables** : top buteurs des deux équipes
- 🔢 **Score de confiance /100** selon le barème de l'agent (forme, stats, effectif, etc.)
- 🏆 **Verdict** : meilleur pari, pari sûr, value bet, risque, mise recommandée
- 🔒 Transparence : chaque donnée manquante est **signalée explicitement** (jamais inventée)

## 🧱 Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · API-Football (v3) · moteur Poisson maison.

## 🚀 Démarrage local

```bash
npm install
cp .env.example .env.local      # puis renseigne API_FOOTBALL_KEY
npm run dev                      # http://localhost:3000
```

### Obtenir une clé API-Football (gratuit)

1. Crée un compte sur **https://dashboard.api-football.com/**
2. Copie ta clé (`x-apisports-key`)
3. Mets-la dans `.env.local` : `API_FOOTBALL_KEY=...`

Tier gratuit : ~100 requêtes/jour. Une analyse consomme ~3 requêtes (prédictions + cotes + buteurs).

## ☁️ Déploiement Vercel

1. Importe le repo dans Vercel
2. Ajoute la variable d'environnement **`API_FOOTBALL_KEY`** (et éventuellement `API_FOOTBALL_HOST`)
3. Déploie

La clé reste **côté serveur** (routes `/api/*`) — jamais exposée au navigateur.

## 📂 Structure

```
app/
  page.tsx                 # accueil : liste des matchs
  match/[id]/page.tsx      # rapport d'analyse complet
  api/fixtures/route.ts    # GET matchs par date
  api/analyze/route.ts     # GET analyse d'un match
lib/
  apiFootball.ts           # client API-Football (server-side)
  poisson.ts               # simulation Monte-Carlo + value/odds
  analysis.ts              # orchestration des 8 étapes
  types.ts
```

## 🔎 Note sur les sources

La consigne initiale visait `betmines.com`, mais ce site est protégé par Cloudflare
(captcha, HTTP 403) et ne peut être scrapé de façon fiable ni conforme à ses CGU.
**API-Football** fournit les mêmes natures de données (fixtures, stats, xG, cotes,
prédictions) via une API officielle — c'est la source retenue.
