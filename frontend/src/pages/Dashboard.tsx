import FalconMark from '../components/FalconMark';
import LanguageToggle from '../components/LanguageToggle';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

/**
 * The protected screen shown once a user is signed in.
 *
 * Phase 1: a welcome page with the account details. Game server management
 * will fill this dashboard from Phase 2 onwards.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-full bg-peregrine-950 text-peregrine-200">
      <header className="flex items-center gap-3 border-b border-peregrine-800 bg-peregrine-900 px-5 py-3">
        <FalconMark className="h-7 w-7 text-falcon" />
        <span className="text-sm font-bold tracking-[0.18em] text-white">
          PEREGRINE
        </span>
        <div className="flex-1" />
        <LanguageToggle />
        {user && (
          <span className="hidden text-sm text-peregrine-400 sm:inline">
            {user.username}
          </span>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
        >
          {t('dashboard.logout')}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">
          {t('dashboard.greeting')} {user?.username}
        </h1>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('dashboard.subtitle')}
        </p>

        <section className="mt-8 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h2 className="text-sm font-semibold text-white">
            {t('dashboard.accountTitle')}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-peregrine-400">
                {t('dashboard.emailLabel')}
              </dt>
              <dd className="text-peregrine-200">{user?.email}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-peregrine-400">{t('dashboard.roleLabel')}</dt>
              <dd>
                <span className="rounded bg-falcon/15 px-2 py-0.5 text-xs font-medium text-falcon">
                  {user?.role}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-5 rounded-2xl border border-dashed border-peregrine-700 bg-peregrine-900/50 p-5">
          <h2 className="text-sm font-semibold text-white">
            {t('dashboard.nextTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-peregrine-400">
            {t('dashboard.nextText')}
          </p>
        </section>
      </main>
    </div>
  );
}
