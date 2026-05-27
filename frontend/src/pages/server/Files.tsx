import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  api,
  ApiError,
  type ApiFileEntry,
  type ApiServer,
} from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

interface FilesPageProps {
  server: ApiServer;
}

interface EditingFile {
  path: string;
  content: string;
}

/** Joins a directory and an entry name into a path. */
function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/** Returns the parent directory of a path. */
function parentOf(dir: string): string {
  const trimmed = dir.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index <= 0 ? '/' : trimmed.slice(0, index);
}

/** Formats a byte count into a short human-readable size. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File manager for one server, displayed as the "Files" tab of the
 * server-detail page. Browse directories, edit text files in-place,
 * upload and delete entries — protected on the backend against
 * path-traversal attacks.
 */
export default function FilesPage({ server }: FilesPageProps) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<ApiFileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingFile | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDir = useCallback(
    async (dirPath: string) => {
      setError(null);
      try {
        const result = await api.listFiles(server.id, dirPath);
        setEntries(result.entries);
        setCurrentPath(dirPath);
      } catch {
        setError(t('files.loadError'));
      }
    },
    [server.id, t],
  );

  useEffect(() => {
    void loadDir('/');
  }, [loadDir]);

  async function openEntry(entry: ApiFileEntry): Promise<void> {
    const full = joinPath(currentPath, entry.name);
    if (entry.type === 'directory') {
      void loadDir(full);
      return;
    }
    try {
      const result = await api.readFile(server.id, full);
      setEditing({ path: full, content: result.content });
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
  }

  async function handleSave(): Promise<void> {
    if (!editing) return;
    setBusy(true);
    try {
      await api.writeFile(server.id, editing.path, editing.content);
      setEditing(null);
      await loadDir(currentPath);
    } catch {
      window.alert(t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: ApiFileEntry): Promise<void> {
    if (!window.confirm(t('files.deleteConfirm'))) return;
    try {
      await api.deleteFile(server.id, joinPath(currentPath, entry.name));
    } catch {
      window.alert(t('common.errorGeneric'));
    }
    await loadDir(currentPath);
  }

  async function handleUpload(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadFile(server.id, currentPath, file);
      await loadDir(currentPath);
    } catch {
      window.alert(t('common.errorGeneric'));
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  if (editing) {
    return (
      <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
        <div className="flex items-center justify-between border-b border-peregrine-800 px-5 py-3">
          <p className="truncate font-mono text-sm text-white">{editing.path}</p>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
          >
            {t('files.back')}
          </button>
        </div>
        <textarea
          value={editing.content}
          onChange={(e) =>
            setEditing({ path: editing.path, content: e.target.value })
          }
          spellCheck={false}
          className="m-0 flex-1 resize-none bg-peregrine-950 px-4 py-3 font-mono text-xs leading-relaxed text-peregrine-200 outline-none"
        />
        <div className="flex justify-end border-t border-peregrine-800 p-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t('common.pleaseWait') : t('files.save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
      <div className="flex items-center justify-between gap-3 border-b border-peregrine-800 px-5 py-3">
        <p className="truncate font-mono text-xs text-peregrine-300">
          {currentPath}
        </p>
        <label className="cursor-pointer rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800">
          {busy ? t('files.uploading') : t('files.upload')}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => void handleUpload(e)}
          />
        </label>
      </div>

      <div className="flex-1 overflow-auto">
        {currentPath !== '/' && (
          <button
            type="button"
            onClick={() => void loadDir(parentOf(currentPath))}
            className="flex w-full items-center border-b border-peregrine-800 px-5 py-2.5 text-left text-sm text-falcon transition-colors hover:bg-peregrine-800"
          >
            ../ {t('files.parent')}
          </button>
        )}

        {error && <p className="px-5 py-4 text-sm text-rose-400">{error}</p>}

        {!error && entries.length === 0 && (
          <p className="px-5 py-4 text-sm text-peregrine-400">
            {t('files.empty')}
          </p>
        )}

        {entries.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center gap-3 border-b border-peregrine-800 px-5 py-2.5"
          >
            <button
              type="button"
              onClick={() => void openEntry(entry)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={`truncate text-sm ${
                  entry.type === 'directory'
                    ? 'text-falcon'
                    : 'text-peregrine-200'
                }`}
              >
                {entry.name}
                {entry.type === 'directory' ? '/' : ''}
              </span>
              {entry.type === 'file' && (
                <span className="shrink-0 text-xs text-peregrine-500">
                  {formatSize(entry.size)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(entry)}
              className="shrink-0 text-xs font-medium text-rose-400 transition-colors hover:text-rose-300"
            >
              {t('server.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
