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
  'home.tagline': {
    en: 'Host your game servers, simply.',
    fr: 'Hébergez vos serveurs de jeu, simplement.',
  },
  'home.description': {
    en: 'A self-hostable hosting panel. Create and manage your Minecraft servers, each isolated in its own Docker container.',
    fr: "Panel d'hébergement auto-hébergeable. Créez et gérez vos serveurs Minecraft, chacun isolé dans son propre conteneur Docker.",
  },
  'home.status.checking': {
    en: 'Checking backend...',
    fr: 'Vérification du backend...',
  },
  'home.status.online': {
    en: 'Backend connected',
    fr: 'Backend connecté',
  },
  'home.status.offline': {
    en: 'Backend unreachable',
    fr: 'Backend injoignable',
  },
  'home.version.phase': {
    en: 'In development — Phase 0',
    fr: 'En développement — Phase 0',
  },
  'home.footer': {
    en: '© 2026 Peregrine — All rights reserved.',
    fr: '© 2026 Peregrine — Tous droits réservés.',
  },
  'language.label': {
    en: 'Language',
    fr: 'Langue',
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
