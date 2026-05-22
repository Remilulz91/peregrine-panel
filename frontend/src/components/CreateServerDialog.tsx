import { useState, type FormEvent } from 'react';
import Field from './Field';
import { api, type ApiTemplate } from '../lib/api';
import { useTranslation } from '../lib/i18n';

// Memory amounts (in MB) offered when creating a server.
const MEMORY_OPTIONS = [1024, 2048, 4096, 8192];

// CPU limits (in cores) offered when creating a server.
const CPU_OPTIONS = [1, 2, 4];

const SELECT_CLASS =
  'w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon';

interface CreateServerDialogProps {
  templates: ApiTemplate[];
  onClose: () => void;
  onCreated: () => void;
}

/** Modal dialog for creating a new game server. */
export default function CreateServerDialog({
  templates,
  onClose,
  onCreated,
}: CreateServerDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [version, setVersion] = useState('LATEST');
  const [memoryMb, setMemoryMb] = useState(2048);
  const [cpuLimit, setCpuLimit] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createServer({
        name,
        templateId,
        minecraftVersion: version,
        memoryMb,
        cpuLimit,
      });
      onCreated();
    } catch {
      setError(t('create.error'));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">{t('create.title')}</h2>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <Field
            id="srv-name"
            label={t('create.nameLabel')}
            type="text"
            required
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <label
              htmlFor="srv-template"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('create.templateLabel')}
            </label>
            <select
              id="srv-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={SELECT_CLASS}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Field
              id="srv-version"
              label={t('create.versionLabel')}
              type="text"
              maxLength={32}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            <p className="mt-1 text-xs text-peregrine-600">
              {t('create.versionHint')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="srv-memory"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('create.memoryLabel')}
              </label>
              <select
                id="srv-memory"
                value={memoryMb}
                onChange={(e) => setMemoryMb(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {MEMORY_OPTIONS.map((mb) => (
                  <option key={mb} value={mb}>
                    {mb / 1024} GB
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="srv-cpu"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('create.cpuLabel')}
              </label>
              <select
                id="srv-cpu"
                value={cpuLimit}
                onChange={(e) => setCpuLimit(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {CPU_OPTIONS.map((cores) => (
                  <option key={cores} value={cores}>
                    {cores}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-peregrine-700 px-4 py-2 text-sm font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('create.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
