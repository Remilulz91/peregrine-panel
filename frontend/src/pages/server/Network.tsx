import { useState } from 'react';
import type { ApiServer, ApiTemplate } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

interface NetworkPageProps {
  server: ApiServer;
  /** The matching template, used to surface the protocol. */
  template: ApiTemplate | null;
}

// Single row for one piece of connection info, with an optional Copy button.
function InfoRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — the user can still select the text.
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-peregrine-800 px-5 py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-peregrine-500">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-sm text-white">{value}</p>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
        >
          {copied ? t('network.copied') : t('network.copy')}
        </button>
      )}
    </div>
  );
}

/**
 * Network / connection details for a server. Shows the host, port and
 * protocol, plus a copy-paste-ready connection string (host:port for
 * Minecraft Java, host:port for Bedrock too).
 */
export default function NetworkPage({ server, template }: NetworkPageProps) {
  const { t } = useTranslation();
  // The host the user connects to is the public URL's hostname — that's
  // exactly what the admin configured in APP_URL. window.location.hostname
  // works for both panel-on-domain and panel-on-IP setups.
  const host = window.location.hostname;
  // Minecraft Java is TCP, Bedrock is UDP — that's the only thing the
  // template tells us about networking, and it's stable.
  const protocol = template?.kind === 'bedrock' ? 'udp' : 'tcp';
  const connection = `${host}:${server.port}`;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">{t('network.title')}</h2>
      <p className="mt-1 max-w-xl text-sm text-peregrine-400">
        {t('network.subtitle')}
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
        <InfoRow label={t('network.address')} value={host} copyable />
        <InfoRow label={t('network.port')} value={String(server.port)} />
        <InfoRow label={t('network.protocol')} value={protocol.toUpperCase()} />
        <InfoRow
          label={t('network.connectionString')}
          value={connection}
          copyable
        />
      </div>
    </section>
  );
}
