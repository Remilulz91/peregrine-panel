import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type ApiAdminServer,
  type ApiAdminUser,
  type ApiTemplate,
  type ApiServer,
  type ServerAction,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation, type TranslationKey } from '../lib/i18n';
import ConsoleDialog from './ConsoleDialog';
import CreateUserDialog from './CreateUserDialog';
import FilesDialog from './FilesDialog';
import ServerCard from './ServerCard';

interface AdminPanelProps {
  templates: ApiTemplate[];
}

type Tab = 'users' | 'servers';

/**
 * Administration view, accessible only to users with the ADMIN role.
 *
 * Two tabs:
 *   * Users    — list, create, regenerate invite, delete accounts.
 *   * Servers  — every server on the panel (regardless of owner), with
 *                the same controls as the user dashboard so the admin
 *                can troubleshoot servers that belong to other users.
 */
export default function AdminPanel({ templates }: AdminPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('users');

  // --- Users ----------------------------------------------------------------

  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  // Tracks whether the first load has completed: the empty-state card
  // should only ever appear after we know the list is truly empty.
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const result = await api.listAdminUsers();
      setUsers(result.users);
      setUsersError(false);
    } catch {
      setUsersError(true);
    } finally {
      setUsersLoaded(true);
    }
  }, []);

  // --- Servers --------------------------------------------------------------

  const [servers, setServers] = useState<ApiAdminServer[]>([]);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [serversError, setServersError] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const result = await api.listAdminServers();
      setServers(result.servers);
      setServersError(false);
    } catch {
      setServersError(true);
    } finally {
      setServersLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadServers();
    // Poll servers like the regular dashboard so status changes show up.
    const interval = setInterval(() => void loadServers(), 4000);
    return () => clearInterval(interval);
  }, [loadUsers, loadServers]);

  // --- Server controls (admin can act on any server) ----------------------

  const [consoleServer, setConsoleServer] = useState<ApiServer | null>(null);
  const [filesServer, setFilesServer] = useState<ApiServer | null>(null);

  function reportError(err: unknown): void {
    const message =
      err instanceof ApiError ? err.message : t('common.errorGeneric');
    window.alert(message);
  }

  async function handleServerAction(
    server: ApiServer,
    action: ServerAction,
  ): Promise<void> {
    try {
      await api.serverAction(server.id, action);
    } catch (err) {
      reportError(err);
    }
    void loadServers();
  }

  async function handleServerDelete(server: ApiServer): Promise<void> {
    if (!window.confirm(t('server.deleteConfirm'))) return;
    try {
      await api.deleteServer(server.id);
    } catch (err) {
      reportError(err);
    }
    void loadServers();
  }

  function templateName(id: string): string {
    return templates.find((tpl) => tpl.id === id)?.name ?? 'Minecraft';
  }

  function templateKind(id: string): string {
    return templates.find((tpl) => tpl.id === id)?.kind ?? 'java';
  }

  // --- User actions ---------------------------------------------------------

  async function regenerateInvite(target: ApiAdminUser): Promise<void> {
    try {
      const result = await api.regenerateInvite(target.id);
      // Show the admin the fresh link in a tiny prompt: prompt() is the
      // simplest way to give them a copyable string without another modal.
      window.prompt(t('admin.invite.ready'), result.inviteUrl);
      void loadUsers();
    } catch (err) {
      reportError(err);
    }
  }

  async function deleteUser(target: ApiAdminUser): Promise<void> {
    if (!window.confirm(t('admin.users.deleteConfirm'))) return;
    try {
      await api.deleteAdminUser(target.id);
      void loadUsers();
      void loadServers();
    } catch (err) {
      reportError(err);
    }
  }

  // --- Render ---------------------------------------------------------------

  const TAB_BASE =
    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors';

  function tabClass(target: Tab): string {
    return tab === target
      ? `${TAB_BASE} bg-falcon text-peregrine-950`
      : `${TAB_BASE} border border-peregrine-700 text-peregrine-200 hover:bg-peregrine-800`;
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {t('admin.title')}
          </h1>
          <p className="mt-1 max-w-lg text-sm text-peregrine-400">
            {t('admin.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={tabClass('users')}
          >
            {t('admin.tabUsers')}
          </button>
          <button
            type="button"
            onClick={() => setTab('servers')}
            className={tabClass('servers')}
          >
            {t('admin.tabServers')}
          </button>
        </div>
      </div>

      {tab === 'users' && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              {t('admin.users.title')}
            </h2>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
            >
              {t('admin.users.create')}
            </button>
          </div>

          {usersError && (
            <p className="mt-4 text-sm text-rose-400">
              {t('admin.users.loadError')}
            </p>
          )}

          {/* Wait for the first load before deciding between "empty" and
              "list of users", to avoid a flash of the empty state. */}
          {!usersLoaded ? null : users.length === 0 && !usersError ? (
            <div className="mt-6 rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
              {t('admin.users.empty')}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-peregrine-700">
              <table className="min-w-full divide-y divide-peregrine-800 text-sm">
                <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
                  <tr>
                    <th className="px-4 py-2">{t('admin.users.colUsername')}</th>
                    <th className="px-4 py-2">{t('admin.users.colEmail')}</th>
                    <th className="px-4 py-2">{t('admin.users.colRole')}</th>
                    <th className="px-4 py-2">{t('admin.users.colStatus')}</th>
                    <th className="px-4 py-2 text-right">
                      {t('admin.users.colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
                  {users.map((row) => {
                    const isSelf = user?.id === row.id;
                    const roleKey =
                      (`admin.role.${row.role}` as TranslationKey);
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-2 font-medium text-white">
                          {row.username}
                        </td>
                        <td className="px-4 py-2 text-peregrine-300">
                          {row.email}
                        </td>
                        <td className="px-4 py-2">{t(roleKey)}</td>
                        <td className="px-4 py-2">
                          {row.needsActivation ? (
                            <span className="rounded-full bg-falcon/15 px-2 py-0.5 text-xs text-falcon">
                              {t('admin.users.statusPending')}
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                              {t('admin.users.statusActive')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            {row.needsActivation && (
                              <button
                                type="button"
                                onClick={() => void regenerateInvite(row)}
                                className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
                              >
                                {t('admin.users.regenerate')}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => void deleteUser(row)}
                              className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {t('admin.users.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'servers' && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-white">
            {t('admin.servers.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-peregrine-400">
            {t('admin.servers.subtitle')}
          </p>

          {serversError && (
            <p className="mt-4 text-sm text-rose-400">
              {t('admin.servers.loadError')}
            </p>
          )}

          {/* Same trick on the all-servers list: wait for the first load
              before showing the empty-state. */}
          {!serversLoaded ? null : servers.length === 0 && !serversError ? (
            <div className="mt-6 rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
              {t('admin.servers.empty')}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {servers.map((server) => (
                <div key={server.id} className="space-y-1">
                  <p className="text-xs text-peregrine-400">
                    {t('admin.servers.ownerLabel')} :{' '}
                    <span className="font-medium text-peregrine-200">
                      {server.owner.username}
                    </span>
                  </p>
                  <ServerCard
                    server={server}
                    templateName={templateName(server.templateId)}
                    onAction={handleServerAction}
                    onConsole={setConsoleServer}
                    onFiles={setFilesServer}
                    onDelete={handleServerDelete}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {createOpen && (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => void loadUsers()}
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
