import { useCallback, useEffect, useState } from 'react';
import AdminPanel from '../components/AdminPanel';
import FalconMark from '../components/FalconMark';
import LanguageToggle from '../components/LanguageToggle';
import ServerCard from '../components/ServerCard';
import CreateServerDialog from '../components/CreateServerDialog';
import ConsoleDialog from '../components/ConsoleDialog';
import FilesDialog from '../components/FilesDialog';
import {
  api,
  ApiError,
  type ApiServer,
  type ApiTemplate,
  type ServerAction,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

/**
 * The protected screen shown once a user is signed in: the list of their
 * game servers, with controls to create, start, stop and delete them, open
 * their live console, and manage their files.
 *
 * Administrators get an extra "Admin" toggle in the header that swaps the
 * main area for the administration view (user accounts + every server on
 * the panel, with full controls for troubleshooting).
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consoleServer, setConsoleServer] = useState<ApiServer | null>(null);
  const [filesServer, setFilesServer] = useState<ApiServer | null>(null);

  // Admins can switch between their own dashboard ("servers") and the
  // administration view ("admin"). Regular users only ever see "servers".
  const [view, setView] = useState<'servers' | 'admin'>('servers');
  const isAdmin = user?.role === 'ADMIN';

  const loadServers = useCallback(async () => {
    try {
      const result = await api.listServers();
      setServers(result.servers);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  // Load the servers and templates, then poll the servers so that status
  // changes (installing, running, ...) appear without a manual refresh.
  useEffect(() => {
    void loadServers();
    api
      .listTemplates()
      .then((result) => setTemplates(result.templates))
      .catch(() => undefined);

    const interval = setInterval(() => void loadServers(), 4000);
    return () => clearInterval(interval);
  }, [loadServers]);

  // Reports an error to the user instead of letting it fail silently.
  function reportError(err: unknown): void {
    const message =
      err instanceof ApiError ? err.message : t('common.errorGeneric');
    window.alert(message);
  }

  async function handleAction(
    server: ApiServer,
    action: ServerAction,
  ): Promise<void> {
    try {
      await api.serverAction(server.id, action);
    } catch (err) {
      reportError(err);
    }
    await loadServers();
  }

  async function handleDelete(server: ApiServer): Promise<void> {
    if (!window.confirm(t('server.deleteConfirm'))) {
      return;
    }
    try {
      await api.deleteServer(server.id);
    } catch (err) {
      reportError(err);
    }
    void loadServers();
  }

  function templateName(id: string): string {
    return templates.find((template) => template.id === id)?.name ?? 'Minecraft';
  }

  function templateKind(id: string): string {
    return templates.find((template) => template.id === id)?.kind ?? 'java';
  }

  return (
    <div className="min-h-full bg-peregrine-950 text-peregrine-200">
      <header className="flex items-center gap-3 border-b border-peregrine-800 bg-peregrine-900 px-5 py-3">
        <FalconMark className="h-7 w-7 text-falcon" />
        <span className="text-sm font-bold tracking-[0.18em] text-white">
          PEREGRINE
        </span>
        <div className="flex-1" />
        {isAdmin && (
          <div className="flex gap-1 rounded-lg border border-peregrine-700 p-0.5">
            <button
              type="button"
              onClick={() => setView('servers')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === 'servers'
                  ? 'bg-falcon text-peregrine-950'
                  : 'text-peregrine-300 hover:bg-peregrine-800'
              }`}
            >
              {t('dashboard.viewServers')}
            </button>
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === 'admin'
                  ? 'bg-falcon text-peregrine-950'
                  : 'text-peregrine-300 hover:bg-peregrine-800'
              }`}
            >
              {t('dashboard.viewAdmin')}
            </button>
          </div>
        )}
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

      <main className="mx-auto max-w-4xl px-6 py-10">
        {isAdmin && view === 'admin' ? (
          <AdminPanel templates={templates} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  {t('servers.title')}
                </h1>
                <p className="mt-1 max-w-lg text-sm text-peregrine-400">
                  {t('servers.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="shrink-0 rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
              >
                {t('servers.create')}
              </button>
            </div>

            {loadError && (
              <p className="mt-6 text-sm text-rose-400">
                {t('servers.loadError')}
              </p>
            )}

            {servers.length === 0 && !loadError ? (
              <div className="mt-8 rounded-2xl border border-dashed border-peregrine-700 p-10 text-center text-sm text-peregrine-400">
                {t('servers.empty')}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    templateName={templateName(server.templateId)}
                    onAction={handleAction}
                    onConsole={setConsoleServer}
                    onFiles={setFilesServer}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {dialogOpen && (
        <CreateServerDialog
          templates={templates}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            void loadServers();
          }}
        />
      )}

      {consoleServer && (
        <ConsoleDialog
          server={consoleServer}
          commandsEnabled={templateKind(consoleServer.templateId) !== 'bedrock'}
          onClose={() => setConsoleServer(null)}
        />
      )}

      {filesServer && (
        <FilesDialog
          server={filesServer}
          onClose={() => setFilesServer(null)}
        />
      )}
    </div>
  );
}
