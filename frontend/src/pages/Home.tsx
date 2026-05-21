import { useEffect, useState } from 'react';
import FalconMark from '../components/FalconMark';

type HealthState = 'checking' | 'online' | 'offline';

const STATUS_LABEL: Record<HealthState, string> = {
  checking: 'Verification du backend...',
  online: 'Backend connecte',
  offline: 'Backend injoignable',
};

const STATUS_DOT: Record<HealthState, string> = {
  checking: 'bg-peregrine-400',
  online: 'bg-emerald-400',
  offline: 'bg-rose-400',
};

/**
 * Page d'accueil de Peregrine (Phase 0).
 *
 * Affiche l'identite du panel et un indicateur en direct de l'etat du
 * backend (obtenu via la route GET /api/health).
 */
export default function Home() {
  const [health, setHealth] = useState<HealthState>('checking');

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => {
        if (active) setHealth(res.ok ? 'online' : 'offline');
      })
      .catch(() => {
        if (active) setHealth('offline');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-peregrine-950 text-peregrine-200">
      {/* Lueur d'ambiance ambre en haut de page */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-falcon/20 blur-[120px]"
      />

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex max-w-xl flex-col items-center">
          {/* Logo */}
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-2xl border border-peregrine-700 bg-peregrine-900 shadow-2xl">
            <FalconMark className="h-14 w-14 text-falcon drop-shadow-[0_0_12px_rgba(240,162,58,0.45)]" />
          </div>

          {/* Nom du produit */}
          <h1 className="text-5xl font-bold tracking-[0.2em] text-white sm:text-6xl">
            PEREGRINE
          </h1>

          {/* Filet decoratif */}
          <div className="mt-4 h-px w-24 bg-gradient-to-r from-transparent via-falcon to-transparent" />

          {/* Slogan */}
          <p className="mt-6 text-lg text-peregrine-200">
            Hebergez vos serveurs de jeu, simplement.
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-peregrine-400">
            Panel d'hebergement auto-hebergeable. Creez et gerez vos serveurs
            Minecraft, chacun isole dans son propre conteneur Docker.
          </p>

          {/* Etat du backend */}
          <div className="mt-10 inline-flex items-center gap-2.5 rounded-full border border-peregrine-700 bg-peregrine-900 px-4 py-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              {health === 'online' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${STATUS_DOT[health]}`}
              />
            </span>
            <span className="text-peregrine-200">{STATUS_LABEL[health]}</span>
          </div>

          {/* Badge de version */}
          <div className="mt-6 flex items-center gap-2 text-xs text-peregrine-400">
            <span className="rounded border border-peregrine-700 bg-peregrine-900 px-2 py-1 font-mono">
              v0.1.0
            </span>
            <span aria-hidden>&middot;</span>
            <span>En developpement &mdash; Phase 0</span>
          </div>
        </div>
      </main>

      {/* Pied de page */}
      <footer className="relative pb-8 text-center text-xs text-peregrine-600">
        &copy; 2026 Peregrine &mdash; Tous droits reserves.
      </footer>
    </div>
  );
}
