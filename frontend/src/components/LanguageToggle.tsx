import { LANGUAGES, useTranslation } from '../lib/i18n';

/**
 * A small EN / FR language selector.
 * The chosen language is highlighted and remembered between visits.
 */
export default function LanguageToggle() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-peregrine-700 bg-peregrine-900 p-1"
      role="group"
      aria-label={t('language.label')}
    >
      {LANGUAGES.map(({ code, label }) => {
        const active = code === language;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            title={label}
            className={
              'rounded-full px-2.5 py-1 text-xs font-medium uppercase transition-colors ' +
              (active
                ? 'bg-falcon text-peregrine-950'
                : 'text-peregrine-400 hover:text-peregrine-200')
            }
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
