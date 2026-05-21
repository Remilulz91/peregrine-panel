# Peregrine

**Panel d'hébergement de serveurs de jeu, auto-hébergeable.**

Peregrine permet d'installer un panneau de contrôle sur sa propre machine Linux,
puis de créer et gérer des serveurs de jeu (Minecraft pour commencer) qui tournent
chacun dans un conteneur Docker isolé. Le projet s'inscrit dans l'esprit de
Pterodactyl et Pelican.

> **Projet en cours de développement.** Version actuelle : `0.1.0` — Phase 0
> (mise en place). Voir la feuille de route plus bas.

## Fonctionnalités prévues

- Comptes utilisateurs, avec un compte administrateur créé au premier lancement
- Création de serveurs Minecraft (Java et Bedrock) en quelques clics
- Démarrage, arrêt et redémarrage des serveurs
- Console en direct
- Gestionnaire de fichiers
- Limites de ressources (CPU, RAM, disque) par serveur

## Stack technique

- **Backend** : Node.js + Fastify (TypeScript)
- **Frontend** : React + Vite + Tailwind CSS
- **Base de données** : SQLite (via Prisma) — à partir de la Phase 1
- **Conteneurs** : Docker, piloté avec dockerode — à partir de la Phase 2
- **Déploiement** : Docker Compose

## Installation rapide (avec Docker)

Prérequis : une machine Linux avec Docker et Docker Compose installés.

```bash
git clone <url-du-depot> peregrine-panel
cd peregrine-panel
cp .env.example .env
# Éditez .env (au minimum, changez JWT_SECRET)
docker compose up -d
```

Le panel est ensuite accessible sur `http://localhost:3000`. Au premier accès,
un assistant vous guidera pour créer le compte administrateur.

## Développement (sans Docker)

Prérequis : Node.js 22 ou plus récent.

```bash
# Installer les dépendances du backend et du frontend
npm run install:all

# Démarrer le backend (port 3000)
npm run dev:backend

# Dans un autre terminal, démarrer le frontend (port 5173)
npm run dev:frontend
```

Le frontend de développement est sur `http://localhost:5173` ; il transmet
automatiquement les appels `/api` au backend.

## Structure du projet

```
peregrine-panel/
├── backend/            API Fastify (TypeScript)
├── frontend/           Interface React (Vite + Tailwind)
├── docs/               Documentation (architecture, etc.)
├── docker-compose.yml  Lancement en une commande
└── Dockerfile          Image de production
```

## Feuille de route

- [x] **Phase 0** — Mise en place du projet
- [ ] **Phase 1** — Comptes & connexion (création automatique de l'admin)
- [ ] **Phase 2** — Création de serveurs (intégration de Docker)
- [ ] **Phase 3** — Contrôle des serveurs (démarrer / arrêter / redémarrer)
- [ ] **Phase 4** — Console en direct
- [ ] **Phase 5** — Gestionnaire de fichiers
- [ ] **Phase 6** — Limites de ressources & templates de jeu
- [ ] **Phase 7** — Finition & première version publiée

Détails complets dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Licence

Peregrine est distribué sous une licence **source-available** (source-disponible) :
le code est public, mais sa redistribution est interdite. Vous pouvez utiliser
Peregrine librement — y compris pour un usage commercial — et modifier le code
pour votre propre usage ou pour contribuer. Vous ne pouvez pas le revendre, le
redistribuer, ou le présenter comme votre propre produit.

Voir le fichier [`LICENSE`](LICENSE) pour les termes complets.

## Contribuer & signaler un bug

Les rapports de bugs sont les bienvenus — voir [`CONTRIBUTING.md`](CONTRIBUTING.md).
Pour signaler une faille de sécurité, voir [`SECURITY.md`](SECURITY.md).
