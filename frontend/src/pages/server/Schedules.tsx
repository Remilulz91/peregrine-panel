import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import {
  api,
  ApiError,
  type ApiSchedule,
  type ApiServer,
  type ScheduleInput,
} from '../../lib/api';
import {
  useTranslation,
  type TranslationKey,
} from '../../lib/i18n';

interface SchedulesPageProps {
  server: ApiServer;
}

type Frequency = 'hourly' | 'daily' | 'weekly';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formats hour+minute as "HH:MM" for display. */
function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** Formats an ISO timestamp in a short locale-aware way. */
function formatWhen(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

interface FormDialogProps {
  serverId: string;
  initial: ApiSchedule | null;
  onClose: () => void;
  onSaved: () => void;
}

function FormDialog({ serverId, initial, onClose, onSaved }: FormDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [frequency, setFrequency] = useState<Frequency>(
    initial?.frequency ?? 'daily',
  );
  const [hour, setHour] = useState<number>(initial?.hour ?? 3);
  const [minute, setMinute] = useState<number>(initial?.minute ?? 0);
  const [dayOfWeek, setDayOfWeek] = useState<number>(
    initial?.dayOfWeek ?? 1,
  );
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const body: ScheduleInput = {
      name: name.trim(),
      frequency,
      hour,
      minute,
      dayOfWeek,
      enabled,
    };
    try {
      if (initial) {
        await api.updateSchedule(serverId, initial.id, body);
      } else {
        await api.createSchedule(serverId, body);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {initial ? t('schedules.form.editTitle') : t('schedules.form.title')}
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="sch-name"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('schedules.form.name')}
            </label>
            <input
              id="sch-name"
              type="text"
              required
              maxLength={48}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
            />
          </div>

          <div>
            <label
              htmlFor="sch-freq"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('schedules.form.frequency')}
            </label>
            <select
              id="sch-freq"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
            >
              <option value="hourly">{t('schedules.freq.hourly')}</option>
              <option value="daily">{t('schedules.freq.daily')}</option>
              <option value="weekly">{t('schedules.freq.weekly')}</option>
            </select>
          </div>

          {/* Day-of-week is only relevant for weekly */}
          {frequency === 'weekly' && (
            <div>
              <label
                htmlFor="sch-day"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('schedules.form.day')}
              </label>
              <select
                id="sch-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {t((`schedules.day.${d}` as TranslationKey))}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time: HH:MM. Hourly only uses the minute part. */}
          <div>
            <label
              htmlFor="sch-time"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('schedules.form.time')}
            </label>
            <input
              id="sch-time"
              type="time"
              required
              value={formatTime(hour, minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':');
                setHour(Number(h));
                setMinute(Number(m));
              }}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-peregrine-200">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-falcon"
            />
            {t('schedules.form.enabled')}
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('schedules.form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Renders a human-readable description of a schedule's recurrence,
 * pulling everything from the i18n table so it's bilingual.
 */
function frequencyDescription(
  schedule: ApiSchedule,
  t: (key: TranslationKey) => string,
): string {
  const time = formatTime(schedule.hour, schedule.minute);
  if (schedule.frequency === 'hourly') {
    return t('schedules.freq.hourly.desc').replace(
      '{minute}',
      String(schedule.minute),
    );
  }
  if (schedule.frequency === 'daily') {
    return t('schedules.freq.daily.desc').replace('{time}', time);
  }
  const dayKey = (`schedules.day.${schedule.dayOfWeek}` as TranslationKey);
  return t('schedules.freq.weekly.desc')
    .replace('{day}', t(dayKey))
    .replace('{time}', time);
}

/**
 * Schedules tab: list of recurring tasks (currently only "create
 * backup"), with create / edit / delete / run-now actions and an
 * inline enabled toggle.
 */
export default function SchedulesPage({ server }: SchedulesPageProps) {
  const { t, language } = useTranslation();
  const [schedules, setSchedules] = useState<ApiSchedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiSchedule | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listSchedules(server.id);
      setSchedules(result.schedules);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [server.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(schedule: ApiSchedule): Promise<void> {
    try {
      await api.updateSchedule(server.id, schedule.id, {
        name: schedule.name,
        frequency: schedule.frequency,
        hour: schedule.hour,
        minute: schedule.minute,
        dayOfWeek: schedule.dayOfWeek,
        enabled: !schedule.enabled,
      });
      void load();
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
  }

  async function handleRunNow(schedule: ApiSchedule): Promise<void> {
    if (!window.confirm(t('schedules.runConfirm'))) return;
    try {
      await api.runScheduleNow(server.id, schedule.id);
      void load();
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
  }

  async function handleDelete(schedule: ApiSchedule): Promise<void> {
    if (!window.confirm(t('schedules.deleteConfirm'))) return;
    try {
      await api.deleteSchedule(server.id, schedule.id);
      void load();
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t('schedules.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-peregrine-400">
            {t('schedules.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
        >
          {t('schedules.create')}
        </button>
      </div>

      {error && (
        <p className="text-sm text-rose-400">{t('schedules.loadError')}</p>
      )}

      {!loaded ? null : schedules.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
          {t('schedules.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-peregrine-700">
          <table className="min-w-full divide-y divide-peregrine-800 text-sm">
            <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
              <tr>
                <th className="px-4 py-2">{t('schedules.colName')}</th>
                <th className="px-4 py-2">{t('schedules.colFrequency')}</th>
                <th className="px-4 py-2">{t('schedules.colNext')}</th>
                <th className="px-4 py-2">{t('schedules.colLast')}</th>
                <th className="px-4 py-2">{t('schedules.colEnabled')}</th>
                <th className="px-4 py-2 text-right">
                  {t('schedules.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-medium text-white">{s.name}</td>
                  <td className="px-4 py-2 text-xs text-peregrine-300">
                    {frequencyDescription(s, t)}
                  </td>
                  <td className="px-4 py-2 text-xs text-peregrine-300">
                    {formatWhen(s.nextRunAt, language, '—')}
                  </td>
                  <td className="px-4 py-2 text-xs text-peregrine-300">
                    {formatWhen(s.lastRunAt, language, t('schedules.never'))}
                  </td>
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-peregrine-300">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() => void handleToggle(s)}
                        className="h-4 w-4 accent-falcon"
                      />
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRunNow(s)}
                        className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
                      >
                        {t('schedules.runNow')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTarget(s)}
                        className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
                      >
                        {t('schedules.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(s)}
                        className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                      >
                        {t('schedules.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <FormDialog
          serverId={server.id}
          initial={null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => void load()}
        />
      )}

      {editTarget && (
        <FormDialog
          serverId={server.id}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => void load()}
        />
      )}
    </section>
  );
}
