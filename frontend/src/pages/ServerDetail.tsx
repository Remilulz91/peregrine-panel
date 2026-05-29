import { useCallback, useEffect, useState, type ReactNode } from 'react';
import FalconMark from '../components/FalconMark';
import LanguageToggle from '../components/LanguageToggle';
import UpdateBadge from '../components/UpdateBadge';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
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
import BackupsPage from './server/Backups';
import SchedulesPage from './server/Schedules';
import SubusersPage from './server/Subusers';
import SettingsPage from './server/Settings';
import ActivityPage from './server/Activity';

interface ServerDetailProps {
  id: string;
  tab: ServerTab;
}

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

const TABS: { id: ServerTab; key: TranslationKey; ownerOnly?: boolean }[] = [
  { id: 'console', key: 'detail.tab.console' },
  { id: 'files', key: 'detail.tab.files' },
  { id: 'network', key: 'detail.tab.network' },
  { id: 'backups', key: 'detail.tab.backups' },
  { id: 'schedules', key: 'detail.tab.schedules', ownerOnly: true },
  { id: 'subusers', key: 'detail.tab.subusers', ownerOnly: true },
  { id: 'settings', key: 'detail.tab.settings' },
  { id: 'activity', key: 'detail.tab.activity' },
];

export default function ServerDetail({ id, tab }: ServerDetailProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [server, setServer] = useState<ApiServer | null>(null);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const loadServer = useCallback(async () => {
    try {
      const result = await api.getServer(id);
      setServer(result.server);
      setMyPermissions(result.myPermissions);
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

  const template = server
    ? templates.find((tpl) => tpl.id === server.templateId) ?? null
    : null;
  const isBedrock = template?.kind === 'bedrock';

  const isOwnerLike = server?.isOwner || user?.role === 'ADMIN';
  const visibleTabs = TABS.filter((entry) =>
    entry.ownerOnly ? Boolean(isOwnerLike) : true,
  );

  const statusKey = server
    ? STATUS_KEY[server.status] ?? 'status.UNKNOWN'
    : 'status.UNKNOWN';
  const badgeStyle = server
    ? STATUS_BADGE[server.status] ?? 'bg-peregrine-700 text-peregrine-200'
    : 'bg-peregrine-700 text-peregrine-200';

  function renderTab(active: ApiServer): ReactNode {
    const safeTab =
      visibleTabs.find((entry) => entry.id === tab)?.id ?? 'console';
    switch (safeTab) {
      case 'console':
        return (
          <ConsolePage
            server={active}
            commandsEnabled={!isBedrock}
            myPermissions={myPermissions}
          />
        );
      case 'files':
        return <FilesPage server={active} myPermissions={myPermissions} />;
      case 'network':
        return <NetworkPage server={active} template={template} />;
      case 'backups':
        return (
          <BackupsPage server={active} myPermissions={myPermissions} />
        );
      case 'schedules':
        return <SchedulesPage server={active} />;
      case 'subusers':
        return <SubusersPage server={active} />;
      case 'settings':
        return (
          <SettingsPage
            server={active}
            myPermissions={myPermissions}
            onRenamed={setServer}
          />
        );
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

  const canStart = server && hasPermission(myPermissions, PERM.CONTROL_START);
  const canStop = server && hasPermission(myPermissions, PERM.CONTROL_STOP);
  const canRestart =
    server && hasPermission(myPermissions, PERM.CONTROL_RESTART);

  return (
    <div className="min-h-full bg-peregrine-950 text-peregrine-200">
      <header className="flex items-center gap-3 border-b border-peregrine-800 bg-peregrine-900 px-5 py-3">
        <FalconMark className="h-7 w-7 text-falcon" />
        <span className="text-sm font-bold tracking-[0.18em] text-white">
          PEREGRINE
        </span>
        <div className="flex-1" />
        <UpdateBadge />
        <LanguageToggle />
        {user && (
          /* Clicking the username opens the account / security page. */
          <button
            type="button"
            onClick={() => navigate('/account')}
            title={t('dashboard.account')}
            className="hidden text-sm text-peregrine-400 transition-colors hover:text-peregrine-200 sm:inline"
          >
            {user.username}
          </button>
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
              {!server.isOwner && (
                <span className="text-xs text-peregrine-500">
                  {t('dashboard.sharedBy')}{' '}
                  <span className="text-peregrine-300">
                    {server.ownerUsername}
                  </span>
                </span>
              )}
              <div className="flex-1" />
              <div className="flex flex-wrap gap-2">
                {server.status === 'OFFLINE' && canStart && (
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
                    {canRestart && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleAction('restart')}
                        className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('server.restart')}
                      </button>
                    )}
                    {canStop && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleAction('stop')}
                        className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('server.stop')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap border-b border-peregrine-800">
              {visibleTabs.map((entry) => (
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

            <div className="mt-6">{renderTab(server)}</div>
          </>
        )}
      </main>
    </div>
  );
}
