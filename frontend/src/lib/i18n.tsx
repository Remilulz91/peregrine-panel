import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Language = 'en' | 'fr';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const translations = {
  'app.footer': {
    en: '© 2026 Peregrine — All rights reserved.',
    fr: '© 2026 Peregrine — Tous droits réservés.',
  },
  'common.loading': { en: 'Loading...', fr: 'Chargement...' },
  'common.pleaseWait': { en: 'Please wait...', fr: 'Veuillez patienter...' },
  'common.errorGeneric': {
    en: 'Something went wrong. Please try again.',
    fr: "Une erreur s'est produite. Veuillez réessayer.",
  },
  'common.cancel': { en: 'Cancel', fr: 'Annuler' },
  'common.close': { en: 'Close', fr: 'Fermer' },
  'common.save': { en: 'Save', fr: 'Enregistrer' },
  'common.back': { en: 'Back', fr: 'Retour' },
  'language.label': { en: 'Language', fr: 'Langue' },

  'setup.title': {
    en: 'Create your administrator account',
    fr: 'Créez votre compte administrateur',
  },
  'setup.subtitle': {
    en: 'Welcome to Peregrine. This is the first launch — set up the main account to get started.',
    fr: "Bienvenue sur Peregrine. C'est le premier lancement — configurez le compte principal pour commencer.",
  },
  'setup.usernameLabel': { en: 'Username', fr: "Nom d'utilisateur" },
  'setup.emailLabel': { en: 'Email address', fr: 'Adresse email' },
  'setup.passwordLabel': { en: 'Password', fr: 'Mot de passe' },
  'setup.confirmLabel': { en: 'Confirm password', fr: 'Confirmer le mot de passe' },
  'setup.submit': { en: 'Create account', fr: 'Créer le compte' },
  'setup.errorShort': {
    en: 'The password must be at least 8 characters long.',
    fr: 'Le mot de passe doit contenir au moins 8 caractères.',
  },
  'setup.errorMismatch': {
    en: 'The two passwords do not match.',
    fr: 'Les deux mots de passe ne correspondent pas.',
  },

  'login.title': { en: 'Sign in', fr: 'Connexion' },
  'login.subtitle': {
    en: 'Sign in to your Peregrine panel.',
    fr: 'Connectez-vous à votre panel Peregrine.',
  },
  'login.usernameLabel': { en: 'Username', fr: "Nom d'utilisateur" },
  'login.passwordLabel': { en: 'Password', fr: 'Mot de passe' },
  'login.submit': { en: 'Sign in', fr: 'Se connecter' },
  'login.errorInvalid': {
    en: 'Invalid username or password.',
    fr: "Nom d'utilisateur ou mot de passe incorrect.",
  },

  'login.mfa.title': { en: 'Two-step verification', fr: 'Vérification en deux étapes' },
  'login.mfa.subtitle': {
    en: 'Enter the 6-digit code from your authenticator app to finish signing in.',
    fr: "Saisissez le code à 6 chiffres affiché par votre application d'authentification pour terminer la connexion.",
  },
  'login.mfa.codeLabel': { en: 'Code', fr: 'Code' },
  'login.mfa.submit': { en: 'Verify', fr: 'Vérifier' },
  'login.mfa.useRecovery': {
    en: 'Use a recovery code instead',
    fr: 'Utiliser un code de récupération à la place',
  },
  'login.mfa.useCode': {
    en: 'Use a code from my authenticator',
    fr: "Utiliser un code de mon application d'authentification",
  },
  'login.mfa.recoveryLabel': { en: 'Recovery code', fr: 'Code de récupération' },
  'login.mfa.errorInvalid': {
    en: 'The code is invalid or has expired. Try again.',
    fr: "Le code est invalide ou a expiré. Réessayez.",
  },

  'invite.title': { en: 'Set your password', fr: 'Définissez votre mot de passe' },
  'invite.welcome': {
    en: 'Welcome to Peregrine, {username}. Choose a password to finish setting up your account.',
    fr: 'Bienvenue sur Peregrine, {username}. Choisissez un mot de passe pour finaliser votre compte.',
  },
  'invite.passwordLabel': { en: 'Password', fr: 'Mot de passe' },
  'invite.confirmLabel': { en: 'Confirm password', fr: 'Confirmer le mot de passe' },
  'invite.submit': { en: 'Activate my account', fr: 'Activer mon compte' },
  'invite.errorShort': {
    en: 'The password must be at least 8 characters long.',
    fr: 'Le mot de passe doit contenir au moins 8 caractères.',
  },
  'invite.errorMismatch': {
    en: 'The two passwords do not match.',
    fr: 'Les deux mots de passe ne correspondent pas.',
  },
  'invite.errorInvalid': {
    en: 'This invitation link is invalid or has expired. Ask your administrator for a new one.',
    fr: "Ce lien d'invitation est invalide ou a expiré. Demandez-en un nouveau à votre administrateur.",
  },
  'invite.checking': {
    en: 'Checking your invitation...',
    fr: 'Vérification de votre invitation...',
  },

  'dashboard.logout': { en: 'Log out', fr: 'Déconnexion' },
  'dashboard.viewServers': { en: 'Servers', fr: 'Serveurs' },
  'dashboard.viewAdmin': { en: 'Admin', fr: 'Admin' },
  'dashboard.sharedBy': { en: 'shared by', fr: 'partagé par' },
  'dashboard.account': { en: 'My account', fr: 'Mon compte' },

  'admin.title': { en: 'Administration', fr: 'Administration' },
  'admin.subtitle': {
    en: 'Manage user accounts and inspect every server on the panel.',
    fr: 'Gérez les comptes utilisateurs et inspectez tous les serveurs du panel.',
  },
  'admin.tabUsers': { en: 'Users', fr: 'Utilisateurs' },
  'admin.tabServers': { en: 'All servers', fr: 'Tous les serveurs' },
  'admin.users.title': { en: 'User accounts', fr: 'Comptes utilisateurs' },
  'admin.users.create': { en: 'Create user', fr: 'Créer un utilisateur' },
  'admin.users.empty': { en: 'No accounts yet.', fr: 'Aucun compte pour le moment.' },
  'admin.users.colUsername': { en: 'Username', fr: "Nom d'utilisateur" },
  'admin.users.colEmail': { en: 'Email', fr: 'Email' },
  'admin.users.colRole': { en: 'Role', fr: 'Rôle' },
  'admin.users.colStatus': { en: 'Status', fr: 'Statut' },
  'admin.users.colActions': { en: 'Actions', fr: 'Actions' },
  'admin.users.statusActive': { en: 'Active', fr: 'Actif' },
  'admin.users.statusPending': { en: 'Invitation pending', fr: 'Invitation en attente' },
  'admin.users.regenerate': { en: 'Regenerate invite', fr: "Régénérer l'invitation" },
  'admin.users.delete': { en: 'Delete', fr: 'Supprimer' },
  'admin.users.deleteConfirm': {
    en: 'Delete this account? All of their servers (containers and files) will also be removed.',
    fr: 'Supprimer ce compte ? Tous ses serveurs (conteneurs et fichiers) seront également supprimés.',
  },
  'admin.users.loadError': {
    en: 'Unable to load the accounts.',
    fr: 'Impossible de charger les comptes.',
  },
  'admin.users.mfaBadge': { en: '2FA', fr: '2FA' },
  'admin.users.resetMfa': { en: 'Reset 2FA', fr: 'Réinitialiser la 2FA' },
  'admin.users.resetMfaConfirm': {
    en: 'Reset 2FA for this account? They will be able to sign in with just their password until they re-enable it.',
    fr: 'Réinitialiser la 2FA de ce compte ? La personne pourra se connecter avec son mot de passe seul jusqu’à ce qu’elle la réactive.',
  },

  'admin.role.USER': { en: 'User', fr: 'Utilisateur' },
  'admin.role.ADMIN': { en: 'Administrator', fr: 'Administrateur' },

  'admin.create.title': { en: 'Create a user', fr: 'Créer un utilisateur' },
  'admin.create.subtitle': {
    en: 'The user will receive a one-time link to set their own password.',
    fr: "L'utilisateur recevra un lien à usage unique pour définir son propre mot de passe.",
  },
  'admin.create.usernameLabel': { en: 'Username', fr: "Nom d'utilisateur" },
  'admin.create.emailLabel': { en: 'Email address', fr: 'Adresse email' },
  'admin.create.roleLabel': { en: 'Role', fr: 'Rôle' },
  'admin.create.submit': {
    en: 'Create and generate link',
    fr: 'Créer et générer le lien',
  },
  'admin.invite.ready': {
    en: 'Invitation link ready — share it with the user. The link is valid for 7 days and can be used only once.',
    fr: "Lien d'invitation prêt — partagez-le avec l'utilisateur. Le lien est valable 7 jours et utilisable une seule fois.",
  },
  'admin.invite.copy': { en: 'Copy link', fr: 'Copier le lien' },
  'admin.invite.copied': { en: 'Copied!', fr: 'Copié !' },

  'admin.servers.title': { en: 'All game servers', fr: 'Tous les serveurs de jeu' },
  'admin.servers.subtitle': {
    en: 'Every server on the panel, regardless of owner. Use this list to help users troubleshoot their servers.',
    fr: 'Tous les serveurs du panel, peu importe le propriétaire. Utilisez cette liste pour aider les utilisateurs à dépanner leurs serveurs.',
  },
  'admin.servers.ownerLabel': { en: 'Owner', fr: 'Propriétaire' },
  'admin.servers.empty': {
    en: 'No servers on the panel yet.',
    fr: 'Aucun serveur sur le panel pour le moment.',
  },
  'admin.servers.loadError': {
    en: 'Unable to load the servers.',
    fr: 'Impossible de charger les serveurs.',
  },

  'servers.title': { en: 'Your game servers', fr: 'Vos serveurs de jeu' },
  'servers.subtitle': {
    en: 'Create and manage your servers. Each one runs in its own Docker container.',
    fr: 'Créez et gérez vos serveurs. Chacun tourne dans son propre conteneur Docker.',
  },
  'servers.create': { en: 'Create a server', fr: 'Créer un serveur' },
  'servers.empty': {
    en: 'No servers yet. Create your first one to get started.',
    fr: 'Aucun serveur pour le moment. Créez le premier pour commencer.',
  },
  'servers.loadError': {
    en: 'Unable to load the servers.',
    fr: 'Impossible de charger les serveurs.',
  },

  'server.versionLabel': { en: 'Version', fr: 'Version' },
  'server.memoryLabel': { en: 'Memory', fr: 'Mémoire' },
  'server.cpuLabel': { en: 'CPU', fr: 'CPU' },
  'server.portLabel': { en: 'Port', fr: 'Port' },
  'server.start': { en: 'Start', fr: 'Démarrer' },
  'server.stop': { en: 'Stop', fr: 'Arrêter' },
  'server.restart': { en: 'Restart', fr: 'Redémarrer' },
  'server.console': { en: 'Console', fr: 'Console' },
  'server.files': { en: 'Files', fr: 'Fichiers' },
  'server.delete': { en: 'Delete', fr: 'Supprimer' },
  'server.deleteConfirm': {
    en: 'Delete this server? Its container and files will be permanently removed.',
    fr: 'Supprimer ce serveur ? Son conteneur et ses fichiers seront définitivement effacés.',
  },

  'status.INSTALLING': { en: 'Installing', fr: 'Installation' },
  'status.OFFLINE': { en: 'Offline', fr: 'Hors ligne' },
  'status.INSTALL_FAILED': { en: 'Installation failed', fr: "Échec de l'installation" },
  'status.STARTING': { en: 'Starting', fr: 'Démarrage' },
  'status.RUNNING': { en: 'Running', fr: 'En ligne' },
  'status.STOPPING': { en: 'Stopping', fr: 'Arrêt' },
  'status.UNKNOWN': { en: 'Unknown', fr: 'Inconnu' },

  'create.title': { en: 'New game server', fr: 'Nouveau serveur de jeu' },
  'create.nameLabel': { en: 'Server name', fr: 'Nom du serveur' },
  'create.templateLabel': { en: 'Game', fr: 'Jeu' },
  'create.versionLabel': { en: 'Version', fr: 'Version' },
  'create.versionHint': {
    en: 'Use LATEST for the newest version, or a number like 1.21.',
    fr: 'Utilisez LATEST pour la dernière version, ou un numéro comme 1.21.',
  },
  'create.memoryLabel': { en: 'Memory', fr: 'Mémoire' },
  'create.cpuLabel': { en: 'CPU cores', fr: 'Cœurs CPU' },
  'create.submit': { en: 'Create', fr: 'Créer' },
  'create.error': {
    en: 'The server could not be created.',
    fr: "Le serveur n'a pas pu être créé.",
  },
  'create.errorNotEnoughHost': {
    en: 'Not enough free RAM or CPU on the host machine. Available: {memMb} MiB RAM, {cpuCount} cores. Lower the requested values, or adjust RESERVED_MEM_MB / RESERVED_CPUS in .env.',
    fr: "Pas assez de RAM ou de CPU disponibles sur la machine hôte. Disponible : {memMb} Mio de RAM, {cpuCount} cœurs. Baissez les valeurs demandées, ou ajustez RESERVED_MEM_MB / RESERVED_CPUS dans .env.",
  },
  'create.loaderLabel': { en: 'Loader', fr: 'Loader' },
  'create.loaderHint': {
    en: 'Vanilla = pure Minecraft. Paper is a high-performance fork. Fabric and Forge let you install mods.',
    fr: 'Vanilla = Minecraft pur. Paper est un fork plus performant. Fabric et Forge permettent d’installer des mods.',
  },
  'loader.vanilla': { en: 'Vanilla', fr: 'Vanilla' },
  'loader.paper': { en: 'Paper', fr: 'Paper' },
  'loader.fabric': { en: 'Fabric', fr: 'Fabric' },
  'loader.forge': { en: 'Forge', fr: 'Forge' },

  'console.connecting': { en: 'Connecting...', fr: 'Connexion...' },
  'console.connected': { en: 'Connected', fr: 'Connecté' },
  'console.waiting': {
    en: 'Waiting for the server output...',
    fr: 'En attente de la sortie du serveur...',
  },
  'console.placeholder': {
    en: 'Type a command and press Enter...',
    fr: 'Tapez une commande et appuyez sur Entrée...',
  },
  'console.send': { en: 'Send', fr: 'Envoyer' },
  'console.error': { en: 'console error', fr: 'erreur de console' },
  'console.viewOnly': {
    en: 'Sending commands is not available for Bedrock servers — the console is view-only.',
    fr: "L'envoi de commandes n'est pas disponible pour les serveurs Bedrock — la console est en lecture seule.",
  },
  'console.noSendPermission': {
    en: 'You do not have permission to send commands on this server.',
    fr: "Vous n'avez pas la permission d'envoyer des commandes sur ce serveur.",
  },

  'files.loadError': {
    en: 'Cannot load the files.',
    fr: 'Impossible de charger les fichiers.',
  },
  'files.empty': { en: 'This folder is empty.', fr: 'Ce dossier est vide.' },
  'files.parent': { en: 'Parent folder', fr: 'Dossier parent' },
  'files.upload': { en: 'Upload a file', fr: 'Téléverser un fichier' },
  'files.uploading': { en: 'Uploading...', fr: 'Téléversement...' },
  'files.save': { en: 'Save', fr: 'Enregistrer' },
  'files.back': { en: 'Back', fr: 'Retour' },
  'files.deleteConfirm': {
    en: 'Delete this item permanently?',
    fr: 'Supprimer cet élément définitivement ?',
  },
  'files.readOnly': {
    en: 'You have read-only access to these files.',
    fr: 'Vous avez un accès en lecture seule à ces fichiers.',
  },

  'detail.back': { en: 'Back to servers', fr: 'Retour aux serveurs' },
  'detail.loadError': {
    en: 'Unable to load this server.',
    fr: 'Impossible de charger ce serveur.',
  },
  'detail.tab.console': { en: 'Console', fr: 'Console' },
  'detail.tab.files': { en: 'Files', fr: 'Fichiers' },
  'detail.tab.network': { en: 'Network', fr: 'Réseau' },
  'detail.tab.backups': { en: 'Backups', fr: 'Sauvegardes' },
  'detail.tab.schedules': { en: 'Schedules', fr: 'Planifications' },
  'detail.tab.subusers': { en: 'Users', fr: 'Utilisateurs' },
  'detail.tab.settings': { en: 'Settings', fr: 'Paramètres' },
  'detail.tab.activity': { en: 'Activity', fr: 'Activité' },

  'network.title': { en: 'Connection details', fr: 'Détails de connexion' },
  'network.subtitle': {
    en: 'How to connect to this server from a game client.',
    fr: 'Comment se connecter à ce serveur depuis un client de jeu.',
  },
  'network.address': { en: 'Address', fr: 'Adresse' },
  'network.port': { en: 'Port', fr: 'Port' },
  'network.protocol': { en: 'Protocol', fr: 'Protocole' },
  'network.connectionString': { en: 'Connection string', fr: 'Chaîne de connexion' },
  'network.copy': { en: 'Copy', fr: 'Copier' },
  'network.copied': { en: 'Copied!', fr: 'Copié !' },

  'sftp.title': { en: 'SFTP access', fr: 'Accès SFTP' },
  'sftp.subtitle': {
    en: 'Connect with any SFTP client to browse, upload and edit this server’s files directly from your computer.',
    fr: 'Connectez-vous avec n’importe quel client SFTP pour parcourir, importer et modifier les fichiers de ce serveur depuis votre ordinateur.',
  },
  'sftp.host': { en: 'Host', fr: 'Hôte' },
  'sftp.port': { en: 'Port', fr: 'Port' },
  'sftp.username': { en: 'Username', fr: 'Nom d’utilisateur' },
  'sftp.password': { en: 'Password', fr: 'Mot de passe' },
  'sftp.passwordValue': {
    en: 'Your panel password',
    fr: 'Votre mot de passe du panneau',
  },
  'sftp.launch': { en: 'Open in SFTP client', fr: 'Ouvrir dans le client SFTP' },
  'sftp.disabled': {
    en: 'The administrator has disabled SFTP access on this panel.',
    fr: 'L’administrateur a désactivé l’accès SFTP sur ce panneau.',
  },
  'sftp.mfaWarning': {
    en: 'Heads up: SFTP only checks your password, even though you have two-factor authentication enabled. Use a strong, unique password.',
    fr: 'Attention : le SFTP ne vérifie que votre mot de passe, même si la double authentification est activée sur votre compte. Utilisez un mot de passe fort et unique.',
  },
  'sftp.hint': {
    en: 'The username encodes which server you are connecting to.',
    fr: 'Le nom d’utilisateur encode le serveur auquel vous vous connectez.',
  },

  'settings.title': { en: 'Server settings', fr: 'Paramètres du serveur' },
  'settings.renameTitle': { en: 'Rename', fr: 'Renommer' },
  'settings.renameLabel': { en: 'Server name', fr: 'Nom du serveur' },
  'settings.renameSave': { en: 'Save name', fr: 'Enregistrer' },

  'settings.resourcesTitle': { en: 'Resources', fr: 'Ressources' },
  'settings.resourcesSubtitle': {
    en: 'Adjust how much RAM and CPU this server can use. The server must be stopped before changing these values.',
    fr: 'Ajustez la RAM et le CPU que ce serveur peut utiliser. Le serveur doit être arrêté avant de modifier ces valeurs.',
  },
  'settings.resourcesMemLabel': { en: 'RAM (MiB)', fr: 'RAM (Mio)' },
  'settings.resourcesCpuLabel': { en: 'CPU cores', fr: 'Cœurs CPU' },
  'settings.resourcesSave': { en: 'Save resources', fr: 'Enregistrer' },
  'settings.resourcesNeedStop': {
    en: 'Stop the server before changing its resources.',
    fr: 'Arrêtez le serveur avant de modifier ses ressources.',
  },
  'settings.resourcesSaved': { en: 'Saved.', fr: 'Enregistré.' },
  'settings.resourcesHostUsage': {
    en: 'Host usage: {usedMem} / {totalMem} MiB RAM · {usedCpu} / {totalCpu} cores',
    fr: 'Utilisation hôte : {usedMem} / {totalMem} Mio RAM · {usedCpu} / {totalCpu} cœurs',
  },
  'settings.resourcesReserve': {
    en: 'Peregrine keeps {reservedMem} MiB and {reservedCpu} core reserved for the OS, Docker and the panel itself.',
    fr: 'Peregrine garde {reservedMem} Mio et {reservedCpu} cœur réservés à l’OS, à Docker et au panel.',
  },
  'settings.resourcesNotEnough': {
    en: 'Not enough free RAM or CPU on the host machine. Available: {memMb} MiB, {cpuCount} cores.',
    fr: 'Pas assez de RAM ou de CPU disponibles sur la machine hôte. Disponible : {memMb} Mio, {cpuCount} cœurs.',
  },

  'settings.dangerZone': { en: 'Danger zone', fr: 'Zone dangereuse' },
  'settings.delete': { en: 'Delete this server', fr: 'Supprimer ce serveur' },
  'settings.deleteHint': {
    en: 'Permanently removes the container and all files. This cannot be undone.',
    fr: 'Supprime définitivement le conteneur et tous les fichiers. Action irréversible.',
  },
  'settings.deleteBlocked': {
    en: 'Stop the server before deleting it.',
    fr: 'Arrêtez le serveur avant de le supprimer.',
  },
  'settings.deleteOwnerOnly': {
    en: 'Only the owner can delete this server.',
    fr: 'Seul le propriétaire peut supprimer ce serveur.',
  },
  'settings.renameNoPermission': {
    en: 'You do not have permission to rename this server.',
    fr: 'Vous n’avez pas la permission de renommer ce serveur.',
  },

  'activity.title': { en: 'Activity log', fr: "Journal d'activité" },
  'activity.subtitle': {
    en: 'The most recent 100 events on this server.',
    fr: 'Les 100 derniers événements sur ce serveur.',
  },
  'activity.empty': { en: 'No activity yet.', fr: "Aucune activité pour l'instant." },
  'activity.system': { en: 'system', fr: 'système' },
  'activity.kind.server.create': { en: 'created the server', fr: 'a créé le serveur' },
  'activity.kind.server.start': { en: 'started the server', fr: 'a démarré le serveur' },
  'activity.kind.server.stop': { en: 'stopped the server', fr: 'a arrêté le serveur' },
  'activity.kind.server.restart': { en: 'restarted the server', fr: 'a redémarré le serveur' },
  'activity.kind.server.rename': { en: 'renamed the server', fr: 'a renommé le serveur' },
  'activity.kind.server.delete': { en: 'deleted the server', fr: 'a supprimé le serveur' },
  'activity.kind.files.write': { en: 'edited a file', fr: 'a modifié un fichier' },
  'activity.kind.files.delete': { en: 'deleted a file', fr: 'a supprimé un fichier' },
  'activity.kind.files.upload': { en: 'uploaded a file', fr: 'a téléversé un fichier' },
  'activity.kind.backup.create': { en: 'created a backup', fr: 'a créé une sauvegarde' },
  'activity.kind.backup.restore': { en: 'restored a backup', fr: 'a restauré une sauvegarde' },
  'activity.kind.backup.delete': { en: 'deleted a backup', fr: 'a supprimé une sauvegarde' },
  'activity.kind.subuser.add': { en: 'added a subuser', fr: 'a ajouté un sous-utilisateur' },
  'activity.kind.subuser.update': { en: 'updated subuser permissions', fr: "a mis à jour les permissions d'un sous-utilisateur" },
  'activity.kind.subuser.remove': { en: 'removed a subuser', fr: 'a retiré un sous-utilisateur' },
  'activity.kind.schedule.create': { en: 'created a schedule', fr: 'a créé une planification' },
  'activity.kind.schedule.update': { en: 'updated a schedule', fr: 'a modifié une planification' },
  'activity.kind.schedule.delete': { en: 'deleted a schedule', fr: 'a supprimé une planification' },
  'activity.kind.schedule.run': { en: 'ran a scheduled task', fr: 'a exécuté une tâche planifiée' },
  'activity.kind.schedule.skipped': { en: 'skipped a scheduled task', fr: 'a sauté une tâche planifiée' },
  'activity.kind.schedule.failed': { en: 'failed a scheduled task', fr: 'a échoué une tâche planifiée' },
  'activity.kind.unknown': { en: 'did something', fr: 'a fait quelque chose' },

  'backups.title': { en: 'Backups', fr: 'Sauvegardes' },
  'backups.subtitle': {
    en: 'Snapshots of this server’s files, stored on the dedicated disk. Up to {max} per server — the oldest is pruned automatically.',
    fr: "Snapshots des fichiers de ce serveur, stockés sur le disque dédié. Maximum {max} par serveur — la plus ancienne est supprimée automatiquement.",
  },
  'backups.create': { en: 'New backup', fr: 'Nouvelle sauvegarde' },
  'backups.creating': { en: 'Creating...', fr: 'Création...' },
  'backups.namePlaceholder': {
    en: 'Backup name (optional)',
    fr: 'Nom de la sauvegarde (optionnel)',
  },
  'backups.empty': {
    en: 'No backups yet. Create one to capture the current state.',
    fr: "Aucune sauvegarde pour l'instant. Créez-en une pour capturer l'état actuel.",
  },
  'backups.colName': { en: 'Name', fr: 'Nom' },
  'backups.colSize': { en: 'Size', fr: 'Taille' },
  'backups.colCreated': { en: 'Created', fr: 'Créée' },
  'backups.colActions': { en: 'Actions', fr: 'Actions' },
  'backups.download': { en: 'Download', fr: 'Télécharger' },
  'backups.restore': { en: 'Restore', fr: 'Restaurer' },
  'backups.delete': { en: 'Delete', fr: 'Supprimer' },
  'backups.restoreConfirm': {
    en: 'Restore this backup? The current server files will be replaced.',
    fr: 'Restaurer cette sauvegarde ? Les fichiers actuels du serveur seront remplacés.',
  },
  'backups.deleteConfirm': {
    en: 'Delete this backup? The archive file will be removed from disk.',
    fr: 'Supprimer cette sauvegarde ? Le fichier sera effacé du disque.',
  },
  'backups.restoreBlocked': {
    en: 'Stop the server before restoring a backup.',
    fr: 'Arrêtez le serveur avant de restaurer une sauvegarde.',
  },
  'backups.loadError': {
    en: 'Unable to load the backups.',
    fr: 'Impossible de charger les sauvegardes.',
  },
  'backups.diskFull': {
    en: 'Not enough free disk space. Delete some backups or unused servers and try again.',
    fr: "Pas assez d'espace disque libre. Supprimez des sauvegardes ou des serveurs inutilisés et réessayez.",
  },
  'backups.noCreatePerm': {
    en: 'You do not have permission to create backups.',
    fr: 'Vous n’avez pas la permission de créer des sauvegardes.',
  },

  'disk.title': { en: 'Disk usage', fr: 'Utilisation du disque' },
  'disk.used': { en: 'Used', fr: 'Utilisé' },
  'disk.free': { en: 'Free', fr: 'Libre' },
  'disk.reserved': { en: 'Reserved', fr: 'Réservé' },
  'disk.reservedHint': {
    en: 'Peregrine keeps a safety margin so a runaway server never fills the disk completely.',
    fr: 'Peregrine garde une marge de sécurité pour qu’un serveur emballé ne remplisse jamais le disque complètement.',
  },

  'subusers.title': { en: 'Server users', fr: 'Utilisateurs du serveur' },
  'subusers.subtitle': {
    en: 'Grant another existing account access to this server with a custom permission set. Only the owner can manage this list.',
    fr: "Accorder à un autre compte existant l'accès à ce serveur avec un jeu de permissions personnalisé. Seul le propriétaire peut gérer cette liste.",
  },
  'subusers.empty': {
    en: 'No one else has been granted access to this server.',
    fr: "Aucune autre personne n'a accès à ce serveur.",
  },
  'subusers.invite': { en: 'Add a user', fr: 'Ajouter un utilisateur' },
  'subusers.colUser': { en: 'User', fr: 'Utilisateur' },
  'subusers.colPermissions': { en: 'Permissions', fr: 'Permissions' },
  'subusers.colActions': { en: 'Actions', fr: 'Actions' },
  'subusers.edit': { en: 'Edit', fr: 'Modifier' },
  'subusers.remove': { en: 'Remove', fr: 'Retirer' },
  'subusers.removeConfirm': {
    en: 'Remove this user from the server? They will lose access immediately.',
    fr: "Retirer cet utilisateur du serveur ? Il perdra l'accès immédiatement.",
  },
  'subusers.permCount': {
    en: '{count} permission(s)',
    fr: '{count} permission(s)',
  },
  'subusers.invite.title': { en: 'Add a user', fr: 'Ajouter un utilisateur' },
  'subusers.invite.subtitle': {
    en: 'Enter the email of an existing account. They will see this server in their dashboard immediately.',
    fr: "Saisissez l'email d'un compte existant. Le serveur apparaîtra dans son tableau de bord immédiatement.",
  },
  'subusers.invite.emailLabel': { en: 'User email', fr: 'Email de l’utilisateur' },
  'subusers.invite.submit': { en: 'Add', fr: 'Ajouter' },
  'subusers.edit.title': { en: 'Edit permissions', fr: 'Modifier les permissions' },
  'subusers.permissions.label': { en: 'Permissions', fr: 'Permissions' },
  'subusers.permissions.selectAll': { en: 'Select all', fr: 'Tout cocher' },
  'subusers.loadError': {
    en: 'Unable to load the users.',
    fr: 'Impossible de charger les utilisateurs.',
  },

  'perm.group.control': { en: 'Power', fr: 'Alimentation' },
  'perm.group.console': { en: 'Console', fr: 'Console' },
  'perm.group.files': { en: 'Files', fr: 'Fichiers' },
  'perm.group.backups': { en: 'Backups', fr: 'Sauvegardes' },
  'perm.group.settings': { en: 'Settings', fr: 'Paramètres' },

  'perm.control.start': { en: 'Start the server', fr: 'Démarrer le serveur' },
  'perm.control.stop': { en: 'Stop the server', fr: 'Arrêter le serveur' },
  'perm.control.restart': { en: 'Restart the server', fr: 'Redémarrer le serveur' },
  'perm.console.send': {
    en: 'Send commands via the console',
    fr: 'Envoyer des commandes via la console',
  },
  'perm.files.write': {
    en: 'Create, edit and upload files',
    fr: 'Créer, modifier et téléverser des fichiers',
  },
  'perm.files.delete': { en: 'Delete files', fr: 'Supprimer des fichiers' },
  'perm.backups.create': { en: 'Create backups', fr: 'Créer des sauvegardes' },
  'perm.backups.restore': { en: 'Restore a backup', fr: 'Restaurer une sauvegarde' },
  'perm.backups.delete': { en: 'Delete backups', fr: 'Supprimer des sauvegardes' },
  'perm.backups.download': { en: 'Download backups', fr: 'Télécharger des sauvegardes' },
  'perm.settings.rename': { en: 'Rename the server', fr: 'Renommer le serveur' },

  'schedules.title': { en: 'Scheduled tasks', fr: 'Tâches planifiées' },
  'schedules.subtitle': {
    en: 'Run backups automatically on a recurring schedule. The newest backups always replace the oldest once the per-server limit is reached.',
    fr: 'Exécutez des sauvegardes automatiquement selon une planification récurrente. Les plus récentes remplacent les plus anciennes une fois la limite par serveur atteinte.',
  },
  'schedules.empty': {
    en: 'No scheduled tasks yet.',
    fr: "Aucune tâche planifiée pour l'instant.",
  },
  'schedules.create': { en: 'New schedule', fr: 'Nouvelle planification' },
  'schedules.colName': { en: 'Name', fr: 'Nom' },
  'schedules.colFrequency': { en: 'Frequency', fr: 'Fréquence' },
  'schedules.colNext': { en: 'Next run', fr: 'Prochaine exécution' },
  'schedules.colLast': { en: 'Last run', fr: 'Dernière exécution' },
  'schedules.colEnabled': { en: 'Enabled', fr: 'Activée' },
  'schedules.colActions': { en: 'Actions', fr: 'Actions' },
  'schedules.runNow': { en: 'Run now', fr: 'Exécuter maintenant' },
  'schedules.edit': { en: 'Edit', fr: 'Modifier' },
  'schedules.delete': { en: 'Delete', fr: 'Supprimer' },
  'schedules.deleteConfirm': {
    en: 'Delete this schedule? Existing backups it produced are kept.',
    fr: 'Supprimer cette planification ? Les sauvegardes existantes qu’elle a produites sont conservées.',
  },
  'schedules.runConfirm': {
    en: 'Trigger this scheduled task now? It will produce a backup immediately.',
    fr: 'Déclencher cette tâche maintenant ? Elle créera une sauvegarde immédiatement.',
  },
  'schedules.loadError': {
    en: 'Unable to load the schedules.',
    fr: 'Impossible de charger les planifications.',
  },
  'schedules.never': { en: 'never', fr: 'jamais' },

  'schedules.form.title': { en: 'Schedule', fr: 'Planification' },
  'schedules.form.editTitle': { en: 'Edit schedule', fr: 'Modifier la planification' },
  'schedules.form.name': { en: 'Name', fr: 'Nom' },
  'schedules.form.frequency': { en: 'Frequency', fr: 'Fréquence' },
  'schedules.form.time': { en: 'Time', fr: 'Heure' },
  'schedules.form.day': { en: 'Day of the week', fr: 'Jour de la semaine' },
  'schedules.form.enabled': { en: 'Enabled', fr: 'Activée' },
  'schedules.form.submit': { en: 'Save', fr: 'Enregistrer' },

  'schedules.freq.hourly': { en: 'Every hour', fr: 'Toutes les heures' },
  'schedules.freq.daily': { en: 'Every day', fr: 'Chaque jour' },
  'schedules.freq.weekly': { en: 'Every week', fr: 'Chaque semaine' },

  'schedules.freq.hourly.desc': {
    en: 'Every hour at minute {minute}',
    fr: 'Toutes les heures à {minute} minute(s)',
  },
  'schedules.freq.daily.desc': {
    en: 'Every day at {time}',
    fr: 'Chaque jour à {time}',
  },
  'schedules.freq.weekly.desc': {
    en: 'Every {day} at {time}',
    fr: 'Chaque {day} à {time}',
  },

  'schedules.day.0': { en: 'Sunday', fr: 'dimanche' },
  'schedules.day.1': { en: 'Monday', fr: 'lundi' },
  'schedules.day.2': { en: 'Tuesday', fr: 'mardi' },
  'schedules.day.3': { en: 'Wednesday', fr: 'mercredi' },
  'schedules.day.4': { en: 'Thursday', fr: 'jeudi' },
  'schedules.day.5': { en: 'Friday', fr: 'vendredi' },
  'schedules.day.6': { en: 'Saturday', fr: 'samedi' },

  'account.title': { en: 'My account', fr: 'Mon compte' },
  'account.back': { en: 'Back to servers', fr: 'Retour aux serveurs' },
  'account.profile.title': { en: 'Profile', fr: 'Profil' },
  'account.profile.username': { en: 'Username', fr: "Nom d'utilisateur" },
  'account.profile.email': { en: 'Email', fr: 'Email' },
  'account.profile.role': { en: 'Role', fr: 'Rôle' },

  'account.security.title': { en: 'Security', fr: 'Sécurité' },
  'account.mfa.title': { en: 'Two-step verification (2FA)', fr: 'Vérification en deux étapes (2FA)' },
  'account.mfa.intro': {
    en: 'Protect your account with a 6-digit code from an authenticator app such as Google Authenticator, Authy, 1Password or Bitwarden.',
    fr: "Protégez votre compte avec un code à 6 chiffres généré par une application d'authentification comme Google Authenticator, Authy, 1Password ou Bitwarden.",
  },
  'account.mfa.statusOn': {
    en: 'Two-step verification is enabled. {count} recovery code(s) left.',
    fr: 'La 2FA est activée. {count} code(s) de récupération restant(s).',
  },
  'account.mfa.statusOff': {
    en: 'Two-step verification is not enabled.',
    fr: "La 2FA n'est pas activée.",
  },
  'account.mfa.enable': { en: 'Enable 2FA', fr: 'Activer la 2FA' },
  'account.mfa.disable': { en: 'Disable 2FA', fr: 'Désactiver la 2FA' },

  'account.mfa.setup.title': { en: 'Set up two-step verification', fr: 'Configurer la 2FA' },
  'account.mfa.setup.step1Title': { en: 'Step 1 — Scan the QR code', fr: 'Étape 1 — Scannez le QR code' },
  'account.mfa.setup.step1Body': {
    en: 'Open your authenticator app and scan this QR code, or paste the secret manually.',
    fr: "Ouvrez votre application d'authentification et scannez ce QR code, ou collez le secret manuellement.",
  },
  'account.mfa.setup.secretLabel': { en: 'Secret', fr: 'Secret' },
  'account.mfa.setup.step2Title': { en: 'Step 2 — Enter the 6-digit code', fr: 'Étape 2 — Saisissez le code à 6 chiffres' },
  'account.mfa.setup.step2Body': {
    en: 'Type the code your app is showing right now to confirm everything is wired up.',
    fr: "Tapez le code que votre application affiche en ce moment pour confirmer que tout est bien connecté.",
  },
  'account.mfa.setup.codeLabel': { en: 'Code', fr: 'Code' },
  'account.mfa.setup.activate': { en: 'Activate', fr: 'Activer' },
  'account.mfa.setup.step3Title': { en: 'Step 3 — Save your recovery codes', fr: 'Étape 3 — Sauvegardez vos codes de récupération' },
  'account.mfa.setup.step3Body': {
    en: 'Each code can be used once if you lose access to your authenticator. Save them somewhere safe — they will not be shown again.',
    fr: "Chaque code peut être utilisé une fois si vous perdez l'accès à votre application. Sauvegardez-les en lieu sûr — ils ne seront plus jamais affichés.",
  },
  'account.mfa.setup.done': { en: 'I have saved them', fr: 'Je les ai sauvegardés' },

  'account.mfa.disable.title': { en: 'Disable 2FA', fr: 'Désactiver la 2FA' },
  'account.mfa.disable.body': {
    en: 'Re-enter your password to confirm.',
    fr: 'Saisissez à nouveau votre mot de passe pour confirmer.',
  },
  'account.mfa.disable.passwordLabel': { en: 'Password', fr: 'Mot de passe' },
  'account.mfa.disable.confirm': { en: 'Disable', fr: 'Désactiver' },
} as const;


export type TranslationKey = keyof typeof translations;

const STORAGE_KEY = 'peregrine.lang';

function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  const nav = window.navigator.language.toLowerCase();
  return nav.startsWith('fr') ? 'fr' : 'en';
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[language] ?? entry.en ?? key;
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used inside a LanguageProvider');
  }
  return ctx;
}
