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
  'common.loading': {
    en: 'Loading...',
    fr: 'Chargement...',
  },
  'common.pleaseWait': {
    en: 'Please wait...',
    fr: 'Veuillez patienter...',
  },
  'common.errorGeneric': {
    en: 'Something went wrong. Please try again.',
    fr: "Une erreur s'est produite. Veuillez réessayer.",
  },
  'language.label': {
    en: 'Language',
    fr: 'Langue',
  },
  'setup.title': {
    en: 'Create your administrator account',
    fr: 'Créez votre compte administrateur',
  },
  'setup.subtitle': {
    en: 'Welcome to Peregrine. This is the first launch — set up the main account to get started.',
    fr: "Bienvenue sur Peregrine. C'est le premier lancement — configurez le compte principal pour commencer.",
  },
  'setup.usernameLabel': {
    en: 'Username',
    fr: "Nom d'utilisateur",
  },
  'setup.emailLabel': {
    en: 'Email address',
    fr: 'Adresse email',
  },
  'setup.passwordLabel': {
    en: 'Password',
    fr: 'Mot de passe',
  },
  'setup.confirmLabel': {
    en: 'Confirm password',
    fr: 'Confirmer le mot de passe',
  },
  'setup.submit': {
    en: 'Create account',
    fr: 'Créer le compte',
  },
  'setup.errorShort': {
    en: 'The password must be at least 8 characters long.',
    fr: 'Le mot de passe doit contenir au moins 8 caractères.',
  },
  'setup.errorMismatch': {
    en: 'The two passwords do not match.',
    fr: 'Les deux mots de passe ne correspondent pas.',
  },
  'login.title': {
    en: 'Sign in',
    fr: 'Connexion',
  },
  'login.subtitle': {
    en: 'Sign in to your Peregrine panel.',
    fr: 'Connectez-vous à votre panel Peregrine.',
  },
  'login.emailLabel': {
    en: 'Email address',
    fr: 'Adresse email',
  },
  'login.passwordLabel': {
    en: 'Password',
    fr: 'Mot de passe',
  },
  'login.submit': {
    en: 'Sign in',
    fr: 'Se connecter',
  },
  'login.errorInvalid': {
    en: 'Invalid email or password.',
    fr: 'Email ou mot de passe incorrect.',
  },
  'dashboard.greeting': {
    en: 'Welcome back,',
    fr: 'Bon retour,',
  },
  'dashboard.subtitle': {
    en: 'Your Peregrine panel is ready.',
    fr: 'Votre panel Peregrine est prêt.',
  },
  'dashboard.accountTitle': {
    en: 'Your account',
    fr: 'Votre compte',
  },
  'dashboard.emailLabel': {
    en: 'Email',
    fr: 'Email',
  },
  'dashboard.roleLabel': {
    en: 'Role',
    fr: 'Rôle',
  },
  'dashboard.logout': {
    en: 'Log out',
    fr: 'Déconnexion',
  },
  'dashboard.nextTitle': {
    en: 'Coming next',
    fr: 'Prochainement',
  },
  'dashboard.nextText': {
    en: 'Game server creation and management arrives in Phase 2. You will be able to create Minecraft servers, each in its own Docker container, right from here.',
    fr: 'La création et la gestion de serveurs de jeu arrivent en Phase 2. Vous pourrez créer des serveurs Minecraft, chacun dans son propre conteneur Docker, directement depuis ici.',
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
  /** The currently selected language. */
  language: Language;
  /** Changes the language and remembers the choice. */
  setLanguage: (language: Language) => void;
  /** Translates a key into the current language. */
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
