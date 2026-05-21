# Peregrine Panel — Document d'architecture et plan de développement

> Version 1.0 — brouillon de travail, à valider avant de coder.
> Peregrine est un panel d'hébergement de serveurs de jeu auto-hébergeable, dans l'esprit de Pterodactyl et Pelican.

---

## 1. Vision du projet

Peregrine est une application web qui permet à n'importe qui d'installer un « panel » sur sa propre machine Linux, puis de créer, démarrer, arrêter et gérer des serveurs de jeu (Minecraft pour commencer) sans avoir à toucher à la ligne de commande.

Chaque serveur de jeu tourne dans son propre conteneur Docker : c'est ce qui garantit l'isolation, les limites de ressources et la possibilité de faire tourner plusieurs jeux ou versions différentes sur la même machine sans qu'ils se gênent.

Le projet vise trois publics :

- **L'hébergeur** : la personne qui installe Peregrine sur sa machine et veut une interface simple pour gérer ses serveurs.
- **Le joueur / propriétaire de serveur** : la personne qui se connecte au panel pour gérer son propre serveur Minecraft (console, fichiers, redémarrage).
- **Le contributeur** : la personne qui télécharge le code pour signaler des bugs ou des failles.

**Objectif de cette première étape (le « MVP »)** : une version mono-machine fonctionnelle — le panel et les serveurs de jeu tournent sur la même machine. Le support multi-machines viendra plus tard (voir feuille de route).

---

## 2. Stack technique recommandée

Tu m'as laissé choisir, en demandant « le plus simple et le plus efficace ». Voici ma recommandation et, surtout, **pourquoi** chaque brique a été choisie. Le fil conducteur : **un seul langage du début à la fin**, pour que tu n'aies qu'une seule chose à apprendre.

| Brique | Choix recommandé | Pourquoi ce choix |
|---|---|---|
| Langage | **TypeScript** | Un seul langage pour le serveur ET l'interface. TypeScript = JavaScript avec des « garde-fous » qui attrapent beaucoup d'erreurs avant l'exécution. Idéal quand on débute. |
| Serveur (backend) | **Node.js + Fastify** | Node.js exécute le TypeScript côté serveur. Fastify est un framework web moderne, rapide, bien documenté et plus simple à prendre en main que ses concurrents. |
| Interface (frontend) | **React + Vite + Tailwind CSS** | React est la bibliothèque d'interface la plus répandue (donc le plus de tutoriels). Vite la rend rapide à développer. Tailwind permet de styliser sans écrire de CSS séparé. |
| Base de données | **SQLite** (MVP), via **Prisma** | SQLite = un simple fichier, **zéro installation**. Parfait pour « n'importe qui installe ça facilement ». Prisma permet de passer plus tard à PostgreSQL sans réécrire le code. |
| Accès à Docker | **dockerode** | Bibliothèque Node.js mûre et stable pour piloter Docker (créer/démarrer/arrêter des conteneurs) depuis le code. |
| Temps réel | **Socket.IO** | Pour afficher la console d'un serveur en direct et le statut en temps réel. Socket.IO gère tout seul les reconnexions. |
| Authentification | **JWT + Argon2** | JWT pour garder l'utilisateur connecté ; Argon2 pour stocker les mots de passe de façon sécurisée (jamais en clair). |
| Déploiement | **Docker Compose** | L'installation pour l'utilisateur final tient en deux commandes : `git clone` puis `docker compose up`. |

### Pourquoi pas PHP/Laravel comme Pterodactyl ?

Pterodactyl et Pelican utilisent PHP, et c'est un choix tout à fait valable. Mais PHP t'obligerait à apprendre **deux** langages (PHP côté serveur + JavaScript côté interface). Comme tu débutes, rester sur **TypeScript partout** réduit fortement la charge d'apprentissage, sans rien sacrifier : Node.js gère parfaitement Docker, le temps réel et les WebSockets dont un panel a besoin.

---

## 3. Architecture générale (MVP mono-machine)

Pour le MVP, tout tourne sur **une seule machine Linux**. On simplifie au maximum : pas d'agent séparé (le fameux « Wings » de Pterodactyl), le serveur du panel parle **directement** à Docker.

```
                    Navigateur de l'utilisateur
                              |
                              |  HTTPS / WebSocket
                              v
   +-------------------------------------------------------+
   |   MACHINE LINUX (le seul ordinateur, pour le MVP)     |
   |                                                       |
   |   +-----------------------------------------------+   |
   |   |   Conteneur "Peregrine"                       |   |
   |   |   - Interface React (fichiers statiques)      |   |
   |   |   - API Fastify (TypeScript)                  |   |
   |   |   - Socket.IO (console temps réel)            |   |
   |   |   - Fichier SQLite (la base de données)       |   |
   |   +-----------------------------------------------+   |
   |                       |                               |
   |                       |  pilote Docker via            |
   |                       |  /var/run/docker.sock         |
   |                       v                               |
   |   +-----------+  +-----------+  +-----------+          |
   |   | Conteneur |  | Conteneur |  | Conteneur |   ...    |
   |   | Minecraft |  | Minecraft |  |  (autre   |          |
   |   |  serveur1 |  |  serveur2 |  |   jeu)    |          |
   |   +-----------+  +-----------+  +-----------+          |
   |       ^ chaque serveur de jeu = 1 conteneur Docker     |
   +-------------------------------------------------------+
```

### Les composants

- **L'interface (React)** : ce que voit l'utilisateur dans son navigateur. Liste de ses serveurs, boutons démarrer/arrêter, console, gestionnaire de fichiers.
- **L'API (Fastify)** : le cerveau. Elle reçoit les demandes de l'interface (« crée un serveur », « démarre-le »), vérifie les droits, et donne les ordres à Docker.
- **La base de données (SQLite)** : la mémoire. Elle stocke les comptes utilisateurs et la description de chaque serveur (nom, propriétaire, limites de RAM, etc.). **Attention : la base ne stocke PAS les fichiers du jeu** — ceux-ci vivent dans des volumes Docker.
- **Docker** : le moteur qui fait réellement tourner les serveurs de jeu, chacun isolé dans son conteneur.
- **Les conteneurs de jeu** : un conteneur = un serveur de jeu. On peut en créer autant que la machine peut en supporter.

Le panel lui-même tourne dans un conteneur, et on lui « branche » le socket Docker de la machine (`/var/run/docker.sock`) pour qu'il puisse créer les autres conteneurs. C'est puissant mais cela demande de la prudence — voir la section Sécurité.

---

## 4. Comment fonctionne un serveur de jeu

### Les « templates de jeu »

Pterodactyl appelle ça des « Eggs ». Chez Peregrine on parlera de **templates** (modèles). Un template décrit **comment faire tourner un jeu** : quelle image Docker utiliser, quelle commande de démarrage, quelles options sont réglables par l'utilisateur (version, RAM, type de serveur…).

Pour le MVP, on prévoit deux templates :

- **Minecraft Java** — image Docker `itzg/minecraft-server`. C'est l'image de référence pour Minecraft : elle gère l'acceptation de l'EULA, le choix de version, et les variantes (Vanilla, Paper, Forge…) via de simples variables.
- **Minecraft Bedrock** — image `itzg/minecraft-bedrock-server`, pour la version console/mobile.

Le système est conçu pour qu'**ajouter un nouveau jeu plus tard = ajouter un template**, sans toucher au reste du code.

### Le cycle de vie d'un serveur

1. **Création** : l'utilisateur choisit un template (« Minecraft Java »), un nom, une quantité de RAM. L'API crée une entrée en base, crée un **volume Docker** (un espace de stockage qui survit aux redémarrages — c'est là que vivront les fichiers du monde), réserve un **port** libre, et crée le conteneur (sans le démarrer).
2. **Démarrage** : l'API demande à Docker de démarrer le conteneur, avec les limites de ressources (CPU/RAM) appliquées.
3. **Console en direct** : l'API « écoute » la sortie du conteneur et la renvoie au navigateur via Socket.IO. L'utilisateur peut aussi taper des commandes, qui sont envoyées à l'entrée du conteneur.
4. **Gestion des fichiers** : l'utilisateur peut parcourir, éditer et téléverser des fichiers (configs, plugins, mondes) dans le volume du serveur.
5. **Arrêt / redémarrage** : ordres envoyés à Docker.
6. **Suppression** : le conteneur et (en option) le volume sont supprimés.

---

## 5. Modèle de données (schéma de base de données)

Quatre tables suffisent pour le MVP. (Notation simplifiée ; les types exacts seront définis dans Prisma.)

**`User` — les comptes**
- `id` — identifiant unique
- `email` — unique
- `username`
- `passwordHash` — le mot de passe haché avec Argon2 (jamais en clair)
- `role` — `ADMIN` ou `USER`
- `createdAt`

**`GameTemplate` — les modèles de jeu**
- `id`
- `name` — ex. « Minecraft Java »
- `dockerImage` — ex. `itzg/minecraft-server`
- `startupCommand` — la commande de démarrage
- `variables` — la liste des options réglables (version, type de serveur, RAM par défaut…), au format JSON
- `stopCommand` — la commande pour arrêter proprement (ex. `stop` pour Minecraft)

**`Server` — les serveurs de jeu créés**
- `id`
- `ownerId` — référence vers `User`
- `templateId` — référence vers `GameTemplate`
- `name` — le nom donné par l'utilisateur
- `containerId` — l'identifiant du conteneur Docker
- `dockerImage` — l'image utilisée
- `status` — `INSTALLING`, `OFFLINE`, `STARTING`, `RUNNING`, `STOPPING`
- `memoryLimitMb` — limite de RAM
- `cpuLimit` — limite de CPU (ex. 1.5 cœur)
- `diskLimitMb` — limite d'espace disque
- `volumeName` — le volume Docker qui contient les fichiers du jeu
- `environment` — les variables choisies par l'utilisateur (version, etc.), au format JSON
- `createdAt`

**`Allocation` — les ports réseau**
- `id`
- `ip` — généralement `0.0.0.0` pour le MVP
- `port` — le port exposé (ex. 25565 pour le premier serveur Minecraft)
- `serverId` — référence vers `Server` (vide si le port est libre)

Une table `AuditLog` (journal des actions) et une table `ApiKey` pourront être ajoutées après le MVP.

---

## 6. Structure du projet (arborescence du dépôt)

Une organisation simple en deux dossiers principaux : `backend` et `frontend`.

```
peregrine-panel/
├── README.md                 # Présentation + guide d'installation
├── LICENSE                   # La licence (voir section 9)
├── CONTRIBUTING.md           # Comment signaler un bug / contribuer
├── docker-compose.yml        # Lance tout Peregrine en une commande
├── .env.example              # Modèle de configuration
│
├── backend/
│   ├── src/
│   │   ├── index.ts          # Point d'entrée du serveur
│   │   ├── routes/           # Les URL de l'API (auth, servers, files...)
│   │   ├── services/         # Logique métier
│   │   │   ├── docker.ts     # Tout ce qui pilote Docker (dockerode)
│   │   │   ├── auth.ts       # Connexion, inscription, jetons JWT
│   │   │   └── server.ts     # Création/gestion des serveurs de jeu
│   │   ├── realtime/         # Console temps réel (Socket.IO)
│   │   ├── middleware/       # Vérification des droits, etc.
│   │   └── templates/        # Les templates de jeu (Minecraft...)
│   ├── prisma/
│   │   └── schema.prisma     # Le schéma de la base de données
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx          # Point d'entrée de l'interface
│   │   ├── pages/            # Les écrans (Connexion, Liste, Console...)
│   │   ├── components/       # Les briques d'interface réutilisables
│   │   └── api/              # Le code qui parle à l'API du backend
│   └── package.json
│
└── docs/
    └── ARCHITECTURE.md       # Ce document, versionné avec le projet
```

---

## 7. Principales routes de l'API

Aperçu des points d'entrée du MVP (la liste sera affinée pendant le développement) :

| Méthode | URL | Rôle |
|---|---|---|
| `POST` | `/api/auth/register` | Créer un compte |
| `POST` | `/api/auth/login` | Se connecter (renvoie un jeton JWT) |
| `GET` | `/api/servers` | Lister les serveurs de l'utilisateur |
| `POST` | `/api/servers` | Créer un serveur |
| `GET` | `/api/servers/:id` | Détails d'un serveur |
| `POST` | `/api/servers/:id/start` | Démarrer un serveur |
| `POST` | `/api/servers/:id/stop` | Arrêter un serveur |
| `POST` | `/api/servers/:id/restart` | Redémarrer un serveur |
| `DELETE` | `/api/servers/:id` | Supprimer un serveur |
| `GET` | `/api/servers/:id/files` | Lister les fichiers |
| `GET/PUT` | `/api/servers/:id/files/content` | Lire / écrire un fichier |
| *(WebSocket)* | `/ws/servers/:id/console` | Console en direct + envoi de commandes |

---

## 8. Feuille de route — développement par phases

L'idée : avancer par petites étapes, chacune donnant quelque chose qui **fonctionne et se teste**. On ne passe à la phase suivante qu'une fois la précédente solide.

**Phase 0 — Mise en place** : créer le dépôt, la structure des dossiers, le `LICENSE`, le `README`, le `docker-compose.yml`, la configuration de base du backend et du frontend. À la fin : `docker compose up` lance une page d'accueil vide.

**Phase 1 — Comptes & connexion** : inscription, connexion, jetons JWT, première page protégée. À la fin : on peut créer un compte et se connecter.

**Phase 2 — Création de serveurs** : intégration de Docker (dockerode), template Minecraft Java, créer/lister/supprimer un serveur. À la fin : un serveur Minecraft apparaît comme conteneur Docker.

**Phase 3 — Contrôle des serveurs** : démarrer, arrêter, redémarrer, affichage du statut en temps réel. À la fin : on peut allumer/éteindre un serveur depuis l'interface.

**Phase 4 — Console en direct** : Socket.IO, affichage de la sortie du serveur, envoi de commandes. À la fin : on voit la console Minecraft et on peut taper dedans.

**Phase 5 — Gestionnaire de fichiers** : parcourir, éditer, téléverser des fichiers du serveur. À la fin : on peut modifier `server.properties` depuis le navigateur.

**Phase 6 — Limites & templates** : appliquer les limites CPU/RAM/disque, ajouter le template Minecraft Bedrock, page d'administration. À la fin : MVP complet et utilisable.

**Phase 7 — Finition & sortie** : guide d'installation soigné, script d'installation, page d'accueil du dépôt, première version publiée (`v0.1.0`).

**Après le MVP** : support multi-machines (un agent « daemon » séparé par machine), sauvegardes automatiques, sous-utilisateurs et permissions fines, planificateur de tâches, statistiques d'usage, davantage de jeux.

---

## 9. Sécurité — points de vigilance

Un panel fait tourner du code arbitraire (mods, plugins) sur des machines, parfois pour d'autres personnes. À garder en tête dès le départ, même si tout n'est pas pour le MVP :

- **Le socket Docker ne doit jamais être exposé sur Internet.** Pouvoir parler à Docker = pouvoir tout faire sur la machine. Seul le panel y accède, en local.
- **Limites de ressources obligatoires** sur chaque conteneur de jeu (CPU, RAM, disque), pour qu'un serveur ne puisse pas étouffer les autres.
- **Conteneurs de jeu sans privilèges** : jamais de `--privileged`, retirer les capacités Linux inutiles, ne pas tourner en `root` dans le conteneur quand c'est évitable.
- **Gestionnaire de fichiers** : valider rigoureusement les chemins pour empêcher un utilisateur de sortir du dossier de son serveur (attaque dite de « path traversal »).
- **Mots de passe** hachés avec Argon2, jamais stockés en clair.
- **Limitation du nombre d'essais** sur la page de connexion (anti-force brute).
- **Vérification des droits** sur chaque requête : un utilisateur ne doit pouvoir gérer que ses propres serveurs ; seul un `ADMIN` accède à l'administration.
- **HTTPS** recommandé en production (via un reverse proxy comme Caddy ou Nginx).

---

## 10. Licence et mise en place sur GitHub

### La licence

Tu as choisi : **usage libre, mais revente/redistribution de Peregrine interdite**. C'est ce qu'on appelle une licence **« source-available »** (source-disponible) : le code est visible publiquement, mais sa réutilisation est encadrée. À ne pas confondre avec « open source », qui a un sens juridique précis autorisant justement la redistribution.

Aucune licence standard ne correspond exactement à ton besoin. Je recommande une **licence propriétaire sur mesure** — la « Peregrine Source-Available License » — avec ces principes :

- ✅ **Autorisé** : télécharger, installer, exécuter et utiliser Peregrine pour n'importe quel usage, y compris commercial (par exemple héberger des serveurs pour des joueurs).
- ✅ **Autorisé** : modifier le code pour son propre usage, pour évaluer le logiciel, déboguer, ou proposer des corrections au projet.
- ❌ **Interdit** : distribuer, vendre, louer, ou partager Peregrine ou une version modifiée.
- ❌ **Interdit** : retirer ou modifier le nom, la marque ou les mentions de copyright « Peregrine » pour présenter le logiciel comme le sien.
- 📥 Les contributions proposées au projet (corrections de bugs) sont reversées au projet.
- ⚠️ Aucune garantie : le logiciel est fourni « tel quel ».

Je pourrai rédiger le fichier `LICENSE` complet au démarrage du code. **Important** : je ne suis pas juriste. Pour quelque chose de réellement opposable en cas de litige, fais relire le texte final par un professionnel du droit.

À savoir aussi : sur un dépôt GitHub **public**, tout le monde peut voir et « forker » (copier) le code — les conditions de GitHub l'autorisent quelle que soit ta licence. C'est la licence qui rend la redistribution **illégale**, ce n'est pas un verrou technique. Si tu veux un vrai contrôle d'accès, il faut un dépôt **privé** avec invitations pour les testeurs.

### Le dépôt GitHub

- **Nom du dépôt** : `peregrine-panel` (en minuscules avec un tiret — les espaces compliquent la vie en ligne de commande). Le nom affiché du produit reste « Peregrine ».
- **Fichiers de base** : `README.md` (présentation + installation), `LICENSE`, `CONTRIBUTING.md` (comment signaler bugs et failles).
- **Signalement de failles** : prévoir un fichier `SECURITY.md` indiquant comment signaler une faille de sécurité de façon responsable (en privé, pas dans une issue publique).
- **Les « Issues » GitHub** serviront aux rapports de bugs ; tu peux fournir des modèles d'issue pour guider les gens.

---

## 11. Récapitulatif des décisions

| Sujet | Décision |
|---|---|
| Nom du produit | Peregrine — dépôt `peregrine-panel` |
| Architecture | Mono-machine pour le MVP (panel + Docker sur la même machine) |
| Langage | TypeScript partout |
| Backend | Node.js + Fastify |
| Frontend | React + Vite + Tailwind CSS |
| Base de données | SQLite via Prisma (PostgreSQL plus tard) |
| Docker | dockerode |
| Temps réel | Socket.IO |
| Déploiement | Docker Compose |
| Jeux au lancement | Minecraft Java + Minecraft Bedrock |
| Licence | Source-available propriétaire « usage libre, revente interdite » |

---

## 12. Prochaines étapes

1. **Tu relis ce document** et tu me dis ce qui te convient ou ce que tu veux changer.
2. Une fois validé, **tu me donnes accès au dossier** où créer le projet.
3. Je démarre la **Phase 0** : je crée le dossier `peregrine-panel`, la structure complète, le `LICENSE`, le `README` et le `docker-compose.yml`.
4. On enchaîne phase par phase, en testant à chaque étape.

Quelques questions ouvertes sur lesquelles ton avis m'aiderait (sans urgence, on peut en discuter au fil de l'eau) :

- Veux-tu que le dépôt GitHub soit **public** dès le départ, ou **privé** au début le temps de stabiliser le MVP ?
- Pour le tout premier compte **administrateur**, préfères-tu qu'il se crée automatiquement au premier lancement, ou via une commande d'installation ?
- Souhaites-tu un **thème visuel** particulier pour l'interface (couleurs, ambiance sombre/claire) ? On peut décider ça plus tard.
