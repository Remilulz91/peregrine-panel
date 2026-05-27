import { useEffect, useState } from 'react';
import AuthCard from './components/AuthCard';
import { AuthProvider, useAuth } from './lib/auth';
import { LanguageProvider, useTranslation } from './lib/i18n';
import { useRoute } from './lib/router';
import Dashboard from './pages/Dashboard';
import Invite from './pages/Invite';
import Login from './pages/Login';
import ServerDetail from './pages/ServerDetail';
import Setup from './pages/Setup';

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
 * Picks which screen to display, based on the URL and the authentication
 * state. The router runs OUTSIDE the AuthProvider so the invite page is
 * reachable without a session.
 */
function CurrentScreen() {
  const { status } = useAuth();
  const route = useRoute();
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
      // than flashy.
      return showLoading ? <LoadingScreen /> : null;
    case 'setup':
      return <Setup />;
    case 'authenticated':
      if (route.name === 'server') {
        return <ServerDetail id={route.id} tab={route.tab} />;
      }
      return <Dashboard />;
    default:
      return <Login />;
  }
}

/** Root component below the language provider. */
function AppRoot() {
  const route = useRoute();
  // The invitation page must work without a session, so it bypasses the
  // AuthProvider entirely.
  if (route.name === 'invite') {
    return <Invite token={route.token} />;
  }
  return (
    <AuthProvider>
      <CurrentScreen />
    </AuthProvider>
  );
}

// Root component. The LanguageProvider wraps everything so even the
// invite page is bilingual.
export default function App() {
  return (
    <LanguageProvider>
      <AppRoot />
    </LanguageProvider>
  );
}
