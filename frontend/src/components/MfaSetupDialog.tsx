import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, ApiError } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface MfaSetupDialogProps {
  onClose: () => void;
  /** Called when MFA has been activated, so the parent can refresh `/me`. */
  onActivated: () => void;
}

type Step = 'qr' | 'recovery';

/**
 * Three-step wizard:
 *   1. Server hands out a fresh secret + otpauth URI; we render the QR
 *      code locally and let the user paste the code their app shows.
 *   2. On a valid first code, the server activates MFA and returns the
 *      recovery codes — shown once, never stored anywhere visible again.
 *   3. The user confirms they've saved the codes and the dialog closes.
 *
 * The secret stays in component state until step 2 succeeds, so a tab
 * close mid-setup leaves nothing on the server side.
 */
export default function MfaSetupDialog({
  onClose,
  onActivated,
}: MfaSetupDialogProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('qr');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpAuthUri, setOtpAuthUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // Fetch the secret + render the QR on mount. Failures bubble up as
  // the generic error banner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const setup = await api.mfaSetup();
        if (cancelled) return;
        setSecret(setup.secret);
        setOtpAuthUri(setup.otpAuthUri);
        // White QR on a transparent-ish dark background reads well in
        // the panel theme. `qrcode` returns a data: URL we can drop
        // straight into an <img>.
        const dataUrl = await QRCode.toDataURL(setup.otpAuthUri, {
          width: 220,
          margin: 1,
          color: { dark: '#ffffff', light: '#0b0f17' },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : t('common.errorGeneric'),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleActivate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!secret) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.mfaEnable(secret, code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setStep('recovery');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDone(): void {
    onActivated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('account.mfa.setup.title')}
        </h2>

        {step === 'qr' && (
          <form onSubmit={handleActivate} className="mt-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {t('account.mfa.setup.step1Title')}
              </h3>
              <p className="mt-1 text-sm text-peregrine-400">
                {t('account.mfa.setup.step1Body')}
              </p>
              <div className="mt-3 flex flex-col items-center gap-3">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code"
                    width={220}
                    height={220}
                    className="rounded-xl border border-peregrine-700"
                  />
                ) : (
                  <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-peregrine-700 bg-peregrine-950 text-xs text-peregrine-500">
                    {t('common.loading')}
                  </div>
                )}
                {secret && (
                  <div className="w-full">
                    <p className="text-[10px] uppercase tracking-wider text-peregrine-500">
                      {t('account.mfa.setup.secretLabel')}
                    </p>
                    <input
                      readOnly
                      value={secret}
                      onFocus={(e) => e.currentTarget.select()}
                      className="mt-1 w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 font-mono text-xs text-white outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">
                {t('account.mfa.setup.step2Title')}
              </h3>
              <p className="mt-1 text-sm text-peregrine-400">
                {t('account.mfa.setup.step2Body')}
              </p>
              <label
                htmlFor="mfa-code"
                className="mt-3 mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('account.mfa.setup.codeLabel')}
              </label>
              <input
                id="mfa-code"
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-center font-mono text-lg tracking-widest text-white outline-none focus:border-falcon"
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || !secret || code.length !== 6}
                className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? t('common.pleaseWait') : t('account.mfa.setup.activate')}
              </button>
            </div>
            {/* Hidden field with the otpauth URI so power users can copy
                it via DevTools if they want — saves them re-scanning. */}
            <input type="hidden" value={otpAuthUri ?? ''} readOnly />
          </form>
        )}

        {step === 'recovery' && (
          <div className="mt-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              {t('account.mfa.setup.step3Title')}
            </h3>
            <p className="text-sm text-peregrine-400">
              {t('account.mfa.setup.step3Body')}
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded-xl border border-falcon/30 bg-falcon/5 p-3 font-mono text-xs">
              {recoveryCodes.map((rc) => (
                <li key={rc} className="text-center text-falcon">
                  {rc}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDone}
                className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
              >
                {t('account.mfa.setup.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
