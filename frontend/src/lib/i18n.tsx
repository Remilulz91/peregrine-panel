import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** Languages supported by the panel interface. */
export type Language = 'en' | 'fr';

/** The list of languages, used to build the language selector. */
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

/**
 * All UI text, grouped by translation key.
 *
 * To add a string: add a key here with its `en` and `fr` values, then use
 * it in a component with `t('your.key')`.
 */
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
  'setup.confirmLabel': {
    en: 'Confirm password',
    fr: 'Confirmer le mot de passe',
  },
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

  'invite.title': { en: 'Set your password', fr: 'Définissez votre mot de passe' },
  'invite.welcome': {
    en: 'Welcome to Peregrine, {username}. Choose a password to finish setting up your account.',
    fr: 'Bienvenue sur Peregrine, {username}. Choisissez un mot de passe pour finaliser votre compte.',
  },
  'invite.passwordLabel': { en: 'Password', fr: 'Mot de passe' },
  'invite.confirmLabel': {
    en: 'Confirm password',
    fr: 'Confirmer le mot de passe',
  },
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

  'admin.title': { en: 'Administration', fr: 'Administration' },
  'admin.subtitle': {
    en: 'Manage user accounts and inspect every server on the panel.',
    fr: 'Gérez les comptes utilisateurs et inspectez tous les serveurs du panel.',
  },
  'admin.tabUsers': { en: 'Users', fr: 'Utilisateurs' },
  'admin.tabServers': { en: 'All servers', fr: 'Tous les serveurs' },
  'admin.users.title': { en: 'User accounts', fr: 'Comptes utilisateurs' },
  'admin.users.create': { en: 'Create user', fr: 'Créer un utilisateur' },
  'admin.users.empty': {
    en: 'No accounts yet.',
    fr: 'Aucun compte pour le moment.',
  },
  'admin.users.colUsername': { en: 'Username', fr: "Nom d'utilisateur" },
  'admin.users.colEmail': { en: 'Email', fr: 'Email' },
  'admin.users.colRole': { en: 'Role', fr: 'Rôle' },
  'admin.users.colStatus': { en: 'Status', fr: 'Statut' },
  'admin.users.colActions': { en: 'Actions', fr: 'Actions' },
  'admin.users.statusActive': { en: 'Active', fr: 'Actif' },
  'admin.users.statusPending': {
    en: 'Invitation pending',
    fr: 'Invitation en attente',
  },
  'admin.users.regenerate': {
    en: 'Regenerate invite',
    fr: "Régénérer l'invitation",
  },
  'admin.users.delete': { en: 'Delete', fr: 'Supprimer' },
  'admin.users.deleteConfirm': {
    en: 'Delete this account? All of their servers (containers and files) will also be removed.',
    fr: 'Supprimer ce compte ? Tous ses serveurs (conteneurs et fichiers) seront également supprimés.',
  },
  'admin.users.loadError': {
    en: 'Unable to load the accounts.',
    fr: 'Impossible de charger les comptes.',
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

  'admin.servers.title': {
    en: 'All game servers',
    fr: 'Tous les serveurs de jeu',
  },
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
  'status.INSTALL_FAILED': {
    en: 'Installation failed',
    fr: "Échec de l'installation",
  },
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
} as const;

/** A valid translation key (any key declared in `translations`). */
export type TranslationKey = keyof typeof translations;

const STORAGE_KEY = 'peregrine.language';

/** Picks the initial language: saved choice, else browser, else English. */
function detectInitialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'fr') {
    return saved;
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Provides the current language and the translation function to the whole
 * application. Wrap the app with this provider (see App.tsx).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] =
    useState<Language>(detectInitialLanguage);

  // Keeps the <html lang="..."> attribute in sync, for accessibility.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[key][language],
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Hook to read the current language and translate UI text. */
export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider.');
  }
  return context;
}
