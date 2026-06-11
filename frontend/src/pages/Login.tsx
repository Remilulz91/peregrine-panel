import { useState, type FormEvent } from 'react';
import AuthCard from '../components/AuthCard';
import Field from '../components/Field';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

type Stage = 'credentials' | 'mfa';
type MfaMode = 'code' | 'recovery';

/**
 * Two-stage login screen:
 *   1. username + password
 *   2. if the backend says `requiresMfa`, we switch to the 6-digit code
 *      view (with a link to switch to a recovery code if the user has
 *      lost their authenticator).
 */
export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const [stage, setStage] = useState<Stage>('credentials');

  // v0.26.0+: if the user was kicked off because a new login happened
  // elsewhere, the API layer wrote this flag in sessionStorage. We pick
  // it up once on mount and clear it so the message only appears once.
  const [kicked, setKicked] = useState<boolean>(() => {
    try {
      const flag = sessionStorage.getItem('peregrine_kicked') === '1';
      if (flag) sessionStorage.removeItem('peregrine_kicked');
      return flag;
    } catch {
      return false;
    }
  });

  // Credentials stage
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // MFA stage
  const [mfaMode, setMfaMode] = useState<MfaMode>('code');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);

  async function handleCredentials(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCredentialsError(null);
    setKicked(false);
    setBusy(true);
    try {
      const result = await api.login({ username, password });
      if ('requiresMfa' in result && result.requiresMfa) {
        // Two-step: switch to the MFA view. The pending cookie has been
        // set by the backend already.
        setStage('mfa');
        setCode('');
        setRecoveryCode('');
        setMfaError(null);
        return;
      }
      // Single-step: we already have the session cookie.
      signIn(result.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCredentialsError(t('login.errorInvalid'));
      } else {
        setCredentialsError(t('common.errorGeneric'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMfa(event: FormEvent): Promise<void> {
    event.preventDefault();
    setMfaError(null);
    setBusy(true);
    try {
      const body =
        mfaMode === 'code'
          ? { code: code.trim() }
          : { recoveryCode: recoveryCode.trim() };
      const result = await api.mfaVerify(body);
      signIn(result.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMfaError(t('login.mfa.errorInvalid'));
      } else {
        setMfaError(
          err instanceof ApiError ? err.message : t('common.errorGeneric'),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'mfa') {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold text-white">
          {t('login.mfa.title')}
        </h1>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('login.mfa.subtitle')}
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleMfa}>
          {mfaMode === 'code' ? (
            <Field
              id="mfa-code"
              label={t('login.mfa.codeLabel')}
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))
              }
            />
          ) : (
            <Field
              id="mfa-recovery"
              label={t('login.mfa.recoveryLabel')}
              type="text"
              required
              autoComplete="one-time-code"
              value={recoveryCode}
              onChange={(e) =>
                setRecoveryCode((e.target as HTMLInputElement).value)
              }
            />
          )}

          {mfaError && <p className="text-sm text-rose-400">{mfaError}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t('common.pleaseWait') : t('login.mfa.submit')}
          </button>

          <button
            type="button"
            onClick={() => {
              setMfaMode(mfaMode === 'code' ? 'recovery' : 'code');
              setMfaError(null);
            }}
            className="block w-full text-center text-xs font-medium text-peregrine-400 transition-colors hover:text-peregrine-200"
          >
            {mfaMode === 'code'
              ? t('login.mfa.useRecovery')
              : t('login.mfa.useCode')}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-lg font-semibold text-white">{t('login.title')}</h1>
      <p className="mt-1 text-sm text-peregrine-400">{t('login.subtitle')}</p>

      <form className="mt-5 space-y-4" onSubmit={handleCredentials}>
        <Field
          id="username"
          label={t('login.usernameLabel')}
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="password"
          label={t('login.passwordLabel')}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {kicked && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {t('login.sessionKicked')}
          </div>
        )}
        {credentialsError && (
          <p className="text-sm text-rose-400">{credentialsError}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? t('common.pleaseWait') : t('login.submit')}
        </button>
      </form>
    </AuthCard>
  );
}
