import type { ReactNode } from 'react';
import FalconMark from './FalconMark';
import LanguageToggle from './LanguageToggle';
import { useTranslation } from '../lib/i18n';

interface AuthCardProps {
  children: ReactNode;
}

/**
 * Full-page layout for the authentication screens (setup, login, loading).
 * Shows the Peregrine branding and centers a card with the given content.
 */
export default function AuthCard({ children }: AuthCardProps) {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-peregrine-950 text-peregrine-200">
      {/* Amber ambient glow at the top of the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[460px] w-[640px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-falcon/20 blur-[120px]"
      />

      <div className="relative flex justify-end p-5">
        <LanguageToggle />
      </div>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-peregrine-700 bg-peregrine-900">
            <FalconMark className="h-9 w-9 text-falcon" />
          </div>
          <span className="text-2xl font-bold tracking-[0.2em] text-white">
            PEREGRINE
          </span>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6 shadow-2xl">
          {children}
        </div>
      </main>

      <footer className="relative pb-6 text-center text-xs text-peregrine-600">
        {t('app.footer')}
      </footer>
    </div>
  );
}
