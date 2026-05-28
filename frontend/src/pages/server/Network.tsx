import { useEffect, useState } from 'react';
import { api, type ApiServer, type ApiTemplate } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

interface NetworkPageProps {
  server: ApiServer;
  template: ApiTemplate | null;
}

function InfoRow({
  label,
  value,
  copyable,
  mono = true,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — user can still select the text
    }
  }

  const rowClass =
    'flex items-center justify-between gap-4 border-t border-peregrine-800 px-5 py-3 first:border-t-0';
  const valueClass = 'mt-0.5 truncate text-sm text-white ' + (mono ? 'font-mono' : '');

  return (
    <div className={rowClass}>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-peregrine-500">{label}</p>
        <p className={valueClass}>{value}</p>
      </div>
      {copyable ? (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
        >
          {copied ? t('network.copied') : t('network.copy')}
        </button>
      ) : null}
    </div>
  );
}

interface SftpConfig {
  enabled: boolean;
  port: number;
  username: string;
  mfaEnabled: boolean;
}

function SftpDetails({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<SftpConfig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .sftpConfig()
      .then((data) => {
        if (!cancelled) setCfg(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !cfg) return null;

  const host = window.location.hostname;
  const fullUsername = cfg.username + '.' + serverId;
  const sftpUrl =
    'sftp://' + encodeURIComponent(fullUsername) + '@' + host + ':' + cfg.port;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{t('sftp.title')}</h2>
      <p className="mt-1 max-w-xl text-sm text-peregrine-400">{t('sftp.subtitle')}</p>

      {!cfg.enabled ? (
        <p className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          {t('sftp.disabled')}
        </p>
      ) : (
        <>
          {cfg.mfaEnabled ? (
            <p className="mt-4 rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
              {t('sftp.mfaWarning')}
            </p>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
            <InfoRow label={t('sftp.host')} value={host} copyable />
            <InfoRow label={t('sftp.port')} value={String(cfg.port)} copyable />
            <InfoRow label={t('sftp.username')} value={fullUsername} copyable />
            <InfoRow
              label={t('sftp.password')}
              value={t('sftp.passwordValue')}
              mono={false}
            />
          </div>

          <p className="mt-3 text-xs text-peregrine-500">{t('sftp.hint')}</p>

          <a
            href={sftpUrl}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-peregrine-700 bg-peregrine-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-peregrine-700"
          >
            {t('sftp.launch')}
          </a>
        </>
      )}
    </section>
  );
}

export default function NetworkPage({ server, template }: NetworkPageProps) {
  const { t } = useTranslation();
  const host = window.location.hostname;
  const protocol = template?.kind === 'bedrock' ? 'udp' : 'tcp';
  const connection = host + ':' + String(server.port);

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-white">{t('network.title')}</h2>
        <p className="mt-1 max-w-xl text-sm text-peregrine-400">{t('network.subtitle')}</p>

        <div className="mt-5 overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
          <InfoRow label={t('network.address')} value={host} copyable />
          <InfoRow label={t('network.port')} value={String(server.port)} />
          <InfoRow label={t('network.protocol')} value={protocol.toUpperCase()} />
          <InfoRow label={t('network.connectionString')} value={connection} copyable />
        </div>
      </section>

      <SftpDetails serverId={server.id} />
    </>
  );
}
