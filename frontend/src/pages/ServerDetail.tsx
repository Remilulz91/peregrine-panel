import { useCallback, useEffect, useState, type ReactNode } from 'react';
import FalconMark from '../components/FalconMark';
import LanguageToggle from '../components/LanguageToggle';
import {
  api,
  ApiError,
  type ApiServer,
  type ApiTemplate,
  type ServerAction,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  navigate,
  serverPath,
  type ServerTab,
} from '../lib/router';
import {
  useTranslation,
  type TranslationKey,
} from '../lib/i18n';
import ConsolePage from './server/Console';
import FilesPage from './server/Files';
import NetworkPage from './server/Network';
import SettingsPage from './server/Settings';
import ActivityPage from './server/Activity';

interface ServerDetailProps {
  id: string;
  tab: ServerTab;
}

// Status colours, reused from the list row so the badge looks consistent.
const STATUS_BADGE: Record<string, string> = {
  INSTALLING: 'bg-falcon/15 text-falcon',
  OFFLINE: 'bg-peregrine-700 text-peregrine-200',
  INSTALL_FAILED: 'bg-rose-500/15 text-rose-400',
  STARTING: 'bg-falcon/15 text-falcon',
  RUNNING: 'bg-emerald-500/15 text-emerald-400',
  STOPPING: 'bg-falcon/15 text-falcon',
};

const STATUS_KEY: Record<string, TranslationKey> = {
  INSTALLING: 'status.INSTALLING',
  OFFLINE: 'status.OFFLINE',
  INSTALL_FAILED: 'status.INSTALL_FAILED',
  STARTING: 'status.STARTING',
  RUNNING: 'status.RUNNING',
  STOPPING: 'status.STOPPING',
};

// The tabs in display order, plus their translation key.
const TABS: { id: ServerTab; key: TranslationKey }[] = [
  { id: 'console', key: 'detail.tab.console' },
  { id: 'files', key: 'detail.tab.files' },
  { id: 'network', key: 'detail.tab.network' },
  { id: 'settings', key: 'detail.tab.settings' },
  { id: 'activity', key: 'detail.tab.activity' },
];

/**
 * The server-detail page: header (back / name / status / power actions),
 * tab bar, and the currently selected tab content. Polls the server
 * record every 4 s so the status badge stays in sync with the container.
 */
export default function ServerDetail({ id, tab }: ServerDetailProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [server, setServer] = useState<ApiServer | null>(null);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const loadServer = useCallback(async () => {
    try {
      const result = await api.getServer(id);
      setServer(result.server);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    void loadServer();
    api
      .listTemplates()
      .then((result) => setTemplates(result.templates))
      .catch(() => undefined);
    const interval = setInterval(() => void loadServer(), 4000);
    return () => clearInterval(interval);
  }, [loadServer]);

  function reportError(err: unknown): void {
    const message =
      err instanceof ApiError ? err.message : t('common.errorGeneric');
    window.alert(message);
  }

  async function handleAction(action: ServerAction): Promise<void> {
    if (!server) return;
    setBusyAction(true);
    try {
      await api.serverAction(server.id, action);
    } catch (err) {
      reportError(err);
    } finally {
      setBusyAction(false);
      void loadServer();
    }
  }

  // The matching template for this server, used by the Network tab and
  // to decide whether commands can be sent on the console.
  const template = server
    ? templates.find((tpl) => tpl.id === server.templateId) ?? null
    : null;
  const commandsEnabled = template?.kind !== 'bedrock';

  // --- Render -----------------------------------------------------------

  const statusKey = server
    ? STATUS_KEY[server.status] ?? 'status.UNKNOWN'
    : 'status.UNKNOWN';
  const badgeStyle = server
    ? STATUS_BADGE[server.status] ?? 'bg-peregrine-700 text-peregrine-200'
    : 'bg-peregrine-700 text-peregrine-200';

  // Renders the active tab. Switching tabs unmounts the previous one —
  // that's intentional: it stops the console websocket and discards any
  // unsaved file editor state.
  function renderTab(active: ApiServer): ReactNode {
    switch (tab) {
      case 'console':
        return (
          <ConsolePage server={active} commandsEnabled={commandsEnabled} />
        );
      case 'files':
        return <FilesPage server={active} />;
      case 'network':
        return <NetworkPage server={active} template={template} />;
      case 'settings':
        return <SettingsPage server={active} onRenamed={setServer} />;
      case 'activity':
        return <ActivityPage server={active} />;
    }
  }

  function tabClass(target: ServerTab): string {
    const base =
      'border-b-2 px-4 py-3 text-sm font-medium transition-colors';
    return tab === target
      ? `${base} border-falcon text-white`
      : `${base} border-transparent text-peregrine-400 hover:text-peregrine-200`;
  }

  return (
    <div className="min-h-full bg-peregrine-950 text-peregrine-200">
      {/* Global header — same as the dashboard so the user is never lost */}
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

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-peregrine-400 transition-colors hover:text-peregrine-200"
        >
          ← {t('detail.back')}
        </button>

        {error && (
          <p className="mb-4 text-sm text-rose-400">{t('detail.loadError')}</p>
        )}

        {/* Server header */}
        {loaded && server && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-semibold text-white">
                {server.name}
              </h1>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${badgeStyle}`}
              >
                {t(statusKey)}
              </span>
              <div className="flex-1" />
              {/* Power actions live in the header so they are accessible
                  from any tab. Same conditional logic as the list row. */}
              <div className="flex flex-wrap gap-2">
                {server.status === 'OFFLINE' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleAction('start')}
                    className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('server.start')}
                  </button>
                )}
                {server.status === 'RUNNING' && (
                  <>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleAction('restart')}
                      className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('server.restart')}
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleAction('stop')}
                      className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('server.stop')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="mt-6 flex flex-wrap border-b border-peregrine-800">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => navigate(serverPath(server.id, entry.id))}
                  className={tabClass(entry.id)}
                >
                  {t(entry.key)}
                </button>
              ))}
            </div>

            {/* Active tab content */}
            <div className="mt-6">{renderTab(server)}</div>
          </>
        )}
      </main>
    </div>
  );
}
