import { useEffect, useState } from 'react';
import AuthCard from './components/AuthCard';
import { AuthProvider, useAuth } from './lib/auth';
import { LanguageProvider, useTranslation } from './lib/i18n';
import Dashboard from './pages/Dashboard';
import Invite from './pages/Invite';
import Login from './pages/Login';
import Setup from './pages/Setup';

// Match /invite/<token> in the URL. The token is a 64-char hex string,
// but we accept anything reasonable so the invite page can surface a
// proper "invalid link" message for typos.
const INVITE_PATH = /^\/invite\/([A-Za-z0-9._-]+)\/?$/;

function inviteTokenFromUrl(): string | null {
  const match = INVITE_PATH.exec(window.location.pathname);
  return match ? match[1] : null;
}

// Grace period before the full loading screen appears. The auth check is
// almost always faster than this on a healthy connection, so on a normal
// refresh nothing flashes — the user sees a single dark frame and then
// the actual screen. The branded loading screen only appears if /me is
// genuinely slow (cold backend, bad network, ...).
const LOADING_GRACE_MS = 250;

/** Shown only after the loading state has lasted past the grace period. */
function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <AuthCard>
      <p className="text-center text-sm text-peregrine-400">
        {t('common.loading')}
      </p>
    </AuthCard>
  );
}

/**
 * Picks which screen to display, based purely on the authentication state:
 *   loading        -> a short loading screen (delayed to avoid flashes)
 *   setup          -> the first-run administrator wizard
 *   authenticated  -> the dashboard
 *   otherwise      -> the login screen
 */
function CurrentScreen() {
  const { status } = useAuth();
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setShowLoading(false);
      return;
    }
    const timer = window.setTimeout(
      () => setShowLoading(true),
      LOADING_GRACE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

  switch (status) {
    case 'loading':
      // During the grace period, render nothing — the dark body
      // background is already painted, so the page looks calm rather
      // than flashy. After the grace period, fall back to the branded
      // loading screen so the user knows something is happening.
      return showLoading ? <LoadingScreen /> : null;
    case 'setup':
      return <Setup />;
    case 'authenticated':
      return <Dashboard />;
    default:
      return <Login />;
  }
}

// Root component. The providers make the language and the authentication
// state available to the whole interface. Invitation URLs short-circuit
// the auth flow: they need to be reachable even without a session.
export default function App() {
  const inviteToken = inviteTokenFromUrl();
  if (inviteToken) {
    return (
      <LanguageProvider>
        <Invite token={inviteToken} />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <CurrentScreen />
      </AuthProvider>
    </LanguageProvider>
  );
}
