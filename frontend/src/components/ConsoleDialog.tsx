import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ApiServer } from '../lib/api';
import { useTranslation } from '../lib/i18n';

// Keeps the console output from growing without bound.
const MAX_OUTPUT_CHARS = 60000;

interface ConsoleDialogProps {
  server: ApiServer;
  onClose: () => void;
}

/** Modal showing a server's live console, with a command input. */
export default function ConsoleDialog({ server, onClose }: ConsoleDialogProps) {
  const { t } = useTranslation();
  const [output, setOutput] = useState('');
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  // Open the websocket, subscribe to this server's console, and stream it.
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('console:subscribe', server.id);
    });
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
    };
  }, [server.id, t]);

  // Keep the output scrolled to the bottom as new lines arrive.
  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const cmd = command.trim();
    if (!cmd || !socketRef.current) {
      return;
    }
    socketRef.current.emit('console:command', {
      serverId: server.id,
      command: cmd,
    });
    setOutput((prev) => prev + `\n> ${cmd}\n`);
    setCommand('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-peregrine-800 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">
              {server.name}
            </h2>
            <p className="text-xs text-peregrine-400">
              {connected ? t('console.connected') : t('console.connecting')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
          >
            {t('common.close')}
          </button>
        </div>

        <pre
          ref={outputRef}
          className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-peregrine-950 px-4 py-3 font-mono text-xs leading-relaxed text-peregrine-200"
        >
          {output || t('console.waiting')}
        </pre>

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
      </div>
    </div>
  );
}
