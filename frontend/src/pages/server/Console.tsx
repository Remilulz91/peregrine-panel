import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import PlayerList from '../../components/PlayerList';
import LiveStats from '../../components/LiveStats';
import { hasPermission, PERM, type ApiServer } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

const MAX_OUTPUT_CHARS = 60000;

interface ConsolePageProps {
  server: ApiServer;
  /** Whether the underlying template supports commands (false for Bedrock). */
  commandsEnabled: boolean;
  /** What the viewer can do on this server. */
  myPermissions: string[];
}

/**
 * Live console for one server. The command input is hidden when:
 *   - the template does not support commands (Bedrock), OR
 *   - the viewer does not hold the `console.send` permission.
 *
 * Two effects are deliberately kept separate:
 *   1. socket lifecycle (open on mount, close on unmount)
 *   2. (re-)subscribe to the server's logs every time `server.status`
 *      changes — this fixes the long-standing bug where the live
 *      output stayed blank when the user opened Console while the
 *      server was stopped and then clicked Start: Docker's
 *      `logs --follow` on a stopped container returns and ends right
 *      away, so the original stream was already dead by the time the
 *      container actually booted.
 */
export default function ConsolePage({
  server,
  commandsEnabled,
  myPermissions,
}: ConsolePageProps) {
  const { t } = useTranslation();
  const [output, setOutput] = useState('');
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const canSend = commandsEnabled && hasPermission(myPermissions, PERM.CONSOLE_SEND);

  // --- 1. Socket lifecycle ------------------------------------------------
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('console:output', (text: string) => {
      setOutput((prev) => (prev + text).slice(-MAX_OUTPUT_CHARS));
    });
    socket.on('console:error', () => {
      setOutput((prev) => prev + `\n[${t('console.error')}]\n`);
    });
    socket.on('connect_error', () => setConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // No `t` here: re-mounting the socket on language change would lose
    // the running output. Translations are read fresh inside the handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2. (Re-)subscribe to this server's logs ----------------------------
  //
  // We subscribe whenever:
  //   - the socket becomes connected, OR
  //   - server.id changes (different server picked), OR
  //   - server.status changes (e.g. user just started the server).
  //
  // The backend's `console:subscribe` handler is idempotent: it detaches
  // any previous attachment for the same socket before opening a new
  // logs stream, so re-emitting is safe.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;
    socket.emit('console:subscribe', server.id);
  }, [connected, server.id, server.status]);

  // Autoscroll on new output.
  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const cmd = command.trim();
    if (!cmd || !socketRef.current) return;
    socketRef.current.emit('console:command', {
      serverId: server.id,
      command: cmd,
    });
    setOutput((prev) => prev + `\n> ${cmd}\n`);
    setCommand('');
  }

  // Footer message: explain WHY commands are unavailable, when they are.
  let footer: 'commands' | 'viewOnly' | 'noPerm';
  if (canSend) footer = 'commands';
  else if (!commandsEnabled) footer = 'viewOnly';
  else footer = 'noPerm';

  return (
    <div className="space-y-4">
      {/* v0.16.0+: live player list, polled every 30 s. Hidden for
          Bedrock and any template without RCON support. */}
      <PlayerList
        serverId={server.id}
        serverRunning={server.status === 'RUNNING'}
        myPermissions={myPermissions}
      />

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,260px]">
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
      <div className="flex items-center justify-between border-b border-peregrine-800 px-5 py-2.5">
        <p className="text-xs text-peregrine-400">
          {connected ? t('console.connected') : t('console.connecting')}
        </p>
      </div>

      <pre
        ref={outputRef}
        className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-peregrine-950 px-4 py-3 font-mono text-xs leading-relaxed text-peregrine-200"
      >
        {output || t('console.waiting')}
      </pre>

      {footer === 'commands' && (
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 border-t border-peregrine-800 p-3"
        >
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t('console.placeholder')}
            className="flex-1 rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon"
          />
          <button
            type="submit"
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
          >
            {t('console.send')}
          </button>
        </form>
      )}

      {footer === 'viewOnly' && (
        <p className="border-t border-peregrine-800 p-3 text-center text-xs text-peregrine-500">
          {t('console.viewOnly')}
        </p>
      )}

      {footer === 'noPerm' && (
        <p className="border-t border-peregrine-800 p-3 text-center text-xs text-peregrine-500">
          {t('console.noSendPermission')}
        </p>
      )}
    </div>

    {/* v0.21.0+: live CPU / RAM / Uptime sidebar. Shows "Offline"
        widgets when the server is not RUNNING. */}
    <LiveStats
      serverId={server.id}
      serverRunning={server.status === 'RUNNING'}
      cpuLimit={server.cpuLimit}
    />
    </div>
    </div>
  );
}
