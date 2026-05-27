import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type ApiActivityEntry,
  type ApiServer,
} from '../../lib/api';
import {
  useTranslation,
  type TranslationKey,
} from '../../lib/i18n';

interface ActivityPageProps {
  server: ApiServer;
}

// Activity event kinds we know about. Any other kind falls back to a
// generic "did something" sentence so a future backend addition does not
// break the UI before the i18n table is updated.
const KNOWN_KINDS = new Set([
  'server.create',
  'server.start',
  'server.stop',
  'server.restart',
  'server.rename',
  'server.delete',
  'files.write',
  'files.delete',
  'files.upload',
]);

/** Translates an activity kind into the localised action sentence. */
function actionKey(kind: string): TranslationKey {
  if (KNOWN_KINDS.has(kind)) {
    return (`activity.kind.${kind}` as TranslationKey);
  }
  return 'activity.kind.unknown';
}

/** Formats an ISO date in a short, locale-aware way. */
function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

/**
 * Server activity log: the latest 100 events on this server, newest first.
 * Each row shows who did what, when, plus an optional detail string
 * (a filename for file events, the new name for renames, etc.).
 */
export default function ActivityPage({ server }: ActivityPageProps) {
  const { t, language } = useTranslation();
  const [entries, setEntries] = useState<ApiActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.listActivity(server.id);
      setEntries(result.entries);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [server.id]);

  // Reload every 8 s so newly-recorded events appear without a manual
  // refresh, but slow enough not to hammer the backend.
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">{t('activity.title')}</h2>
      <p className="mt-1 max-w-xl text-sm text-peregrine-400">
        {t('activity.subtitle')}
      </p>

      {error && (
        <p className="mt-4 text-sm text-rose-400">{t('common.errorGeneric')}</p>
      )}

      {!loaded ? null : entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
          {t('activity.empty')}
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 border-t border-peregrine-800 px-5 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-peregrine-200">
                  <span className="font-semibold text-white">
                    {entry.actorUsername ?? t('activity.system')}
                  </span>{' '}
                  {t(actionKey(entry.kind))}
                  {entry.details && (
                    <>
                      :{' '}
                      <span className="break-all font-mono text-xs text-peregrine-300">
                        {entry.details}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-peregrine-500">
                  {formatWhen(entry.createdAt, language)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
