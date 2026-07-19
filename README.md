# Léa — suivi de budget 🐨 (by Joujou)

Petite app pour suivre dépenses et revenus pendant une année en Australie.
Catégories personnalisables, bascule AUD ⇄ €, répartition par catégorie et solde du mois.

## Lancer l'app en local

Prérequis : **Node.js 18+** (vérifie avec `node -v`).

```bash
npm install     # installe les dépendances (à faire une seule fois)
npm run dev     # démarre le serveur de dev
```

Ouvre ensuite l'adresse affichée dans le terminal (en général http://localhost:5173).

Pour générer une version optimisée à héberger :

```bash
npm run build   # crée le dossier dist/
npm run preview # prévisualise le build en local
```

## Où toucher quoi

Tout est dans **`src/App.jsx`** :

- `RATE_AUD_TO_EUR` — le taux de change (actuellement figé à titre indicatif).
  À remplacer plus tard par un vrai taux récupéré en ligne (ex. exchangerate.host).
- `DEFAULT_CATS` — les catégories de départ (nom, emoji, couleur, type).
- `SEED` — les transactions de démo. À vider (`const SEED = [];`) quand tu branches
  une vraie base de données.

## Prochaines étapes possibles

- **Synchro multi-appareils** : brancher Supabase (auth par magic-link + tables
  `categories` et `transactions`) pour que les données suivent sur iPhone et Mac.
- **PWA** (installable sur l'écran d'accueil iOS via Safari) : ajouter
  `vite-plugin-pwa`, il génère le manifest et le service worker tout seul.
- **Export CSV** et **objectif d'épargne** si tu veux pousser un peu plus loin.
