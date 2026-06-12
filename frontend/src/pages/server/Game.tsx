import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
  type ApiGameSettings,
  type ApiGameSettingsWarning,
  type ApiServer,
  type ApiTemplate,
} from '../../lib/api';
import { useTranslation, type TranslationKey } from '../../lib/i18n';
import PlayerAccessLists from '../../components/PlayerAccessLists';

interface GamePageProps {
  server: ApiServer;
  template: ApiTemplate | null;
  myPermissions: string[];
}

const GAMEMODES: ApiGameSettings['gamemode'][] = [
  'survival',
  'creative',
  'adventure',
  'spectator',
];
const DIFFICULTIES: ApiGameSettings['difficulty'][] = [
  'peaceful',
  'easy',
  'normal',
  'hard',
];

/**
 * Game settings tab (v0.18.0+). Reads the editable subset of
 * `server.properties` and lets the user change MOTD, gamemode,
 * difficulty, PvP, online-mode, white-list, max-players and
 * view-distance. Changes are written to the file on disk —
 * applied at the next server restart.
 *
 * The tab is intentionally Java-only: Bedrock uses the same
 * filename but a different schema, and shipping a Bedrock editor
 * that pretends to work would be worse than the explicit notice
 * we show below.
 */
export default function GamePage({
  server,
  template,
  myPermissions,
}: GamePageProps) {
  const { t } = useTranslation();
  const canEdit = hasPermission(myPermissions, PERM.SETTINGS_RENAME);
  const isJava = template?.kind === 'java';

  const [settings, setSettings] = useState<ApiGameSettings | null>(null);
  const [warnings, setWarnings] = useState<ApiGameSettingsWarning[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number>(0);

  useEffect(() => {
    if (!isJava) return;
    let cancelled = false;
    setLoadError(null);
    api
      .getGameSettings(server.id)
      .then((result) => {
        if (!cancelled) {
          setSettings(result.settings);
          setWarnings(result.warnings);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : t('common.errorGeneric'),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isJava, server.id, t]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.updateGameSettings(server.id, settings);
      setSettings(result.settings);
      // Saving rewrites the managed keys with valid values, so any
      // pre-existing typos are now gone — clear the warning banner.
      setWarnings([]);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!isJava) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{t('game.title')}</h2>
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5 text-sm text-peregrine-300">
          {t('game.javaOnly')}
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{t('game.title')}</h2>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-300">
          {loadError}
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{t('game.title')}</h2>
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5 text-sm text-peregrine-400">
          {t('common.pleaseWait')}
        </div>
      </section>
    );
  }

  const disabled = !canEdit || saving;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('game.title')}</h2>
        <p className="mt-1 text-sm text-peregrine-400">{t('game.subtitle')}</p>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold text-amber-300">{t('game.warningsTitle')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90">
            {warnings.map((w, i) => (
              <li key={i}>
                {t(
                  ('game.warningRow.' + w.reason) as TranslationKey,
                )
                  .replace('{key}', w.key)
                  .replace('{rawValue}', w.rawValue)
                  .replace('{fallback}', w.fallback)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-200/80">{t('game.warningsHint')}</p>
        </div>
      )}

      {!canEdit && (
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-4 text-sm text-peregrine-400">
          {t('game.noPermission')}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* MOTD */}
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <label htmlFor="motd-input" className="text-sm font-semibold text-white">
            {t('game.motd')}
          </label>
          <input
            id="motd-input"
            type="text"
            maxLength={200}
            value={settings.motd}
            disabled={disabled}
            onChange={(e) => setSettings({ ...settings, motd: e.target.value })}
            className="mt-3 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Two-column grid for the dropdowns + max players + view distance. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
            <label
              htmlFor="gamemode-select"
              className="text-sm font-semibold text-white"
            >
              {t('game.gamemode')}
            </label>
            <select
              id="gamemode-select"
              value={settings.gamemode}
              disabled={disabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  gamemode: e.target.value as ApiGameSettings['gamemode'],
                })
              }
              className="mt-3 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
            >
              {GAMEMODES.map((g) => (
                <option key={g} value={g}>
                  {t(`game.gamemode.${g}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
            <label
              htmlFor="difficulty-select"
              className="text-sm font-semibold text-white"
            >
              {t('game.difficulty')}
            </label>
            <select
              id="difficulty-select"
              value={settings.difficulty}
              disabled={disabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  difficulty: e.target.value as ApiGameSettings['difficulty'],
                })
              }
              className="mt-3 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {t(`game.difficulty.${d}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
            <label
              htmlFor="max-players-input"
              className="text-sm font-semibold text-white"
            >
              {t('game.maxPlayers')}
            </label>
            <input
              id="max-players-input"
              type="number"
              min={1}
              max={200}
              step={1}
              value={settings.maxPlayers}
              disabled={disabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxPlayers: Math.max(
                    1,
                    Math.min(200, parseInt(e.target.value, 10) || 1),
                  ),
                })
              }
              className="mt-3 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
            <label
              htmlFor="view-distance-input"
              className="text-sm font-semibold text-white"
            >
              {t('game.viewDistance')}
            </label>
            <input
              id="view-distance-input"
              type="number"
              min={3}
              max={32}
              step={1}
              value={settings.viewDistance}
              disabled={disabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  viewDistance: Math.max(
                    3,
                    Math.min(32, parseInt(e.target.value, 10) || 10),
                  ),
                })
              }
              className="mt-3 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5 space-y-4">
          <Toggle
            id="pvp-toggle"
            label={t('game.pvp')}
            checked={settings.pvp}
            disabled={disabled}
            onChange={(v) => setSettings({ ...settings, pvp: v })}
          />
          <Toggle
            id="white-list-toggle"
            label={t('game.whiteList')}
            checked={settings.whiteList}
            disabled={disabled}
            onChange={(v) => setSettings({ ...settings, whiteList: v })}
          />
          <Toggle
            id="online-mode-toggle"
            label={t('game.onlineMode')}
            checked={settings.onlineMode}
            disabled={disabled}
            onChange={(v) => setSettings({ ...settings, onlineMode: v })}
          />
          {!settings.onlineMode && (
            <p className="text-xs text-rose-300">{t('game.onlineModeWarning')}</p>
          )}
        </div>

        {/* Footer: save button + status messages. */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t('common.pleaseWait') : t('game.save')}
          </button>
          <span className="text-xs text-peregrine-500">{t('game.requiresRestart')}</span>
        </div>
        {saveError && <p className="text-sm text-rose-400">{saveError}</p>}
        {savedAt > 0 && !saveError && (
          <p className="text-sm text-emerald-400">{t('game.saved')}</p>
        )}
      </form>

      {/* v0.29.0+: whitelist / ops / bans, also Java-only. */}
      <PlayerAccessLists serverId={server.id} myPermissions={myPermissions} />
    </section>
  );
}

interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ id, label, checked, disabled, onChange }: ToggleProps) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center justify-between gap-3 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <span className="text-sm text-white">{label}</span>
      <span className="relative">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="block h-6 w-11 rounded-full bg-peregrine-700 transition-colors peer-checked:bg-falcon" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
