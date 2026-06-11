import { useEffect, useState } from 'react';
import AuthCard from './components/AuthCard';
import { AuthProvider, useAuth } from './lib/auth';
import { LanguageProvider, useTranslation } from './lib/i18n';
import { navigate, useRoute } from './lib/router';
import Account from './pages/Account';
import Dashboard from './pages/Dashboard';
import Invite from './pages/Invite';
import Login from './pages/Login';
import ServerDetail from './pages/ServerDetail';
import Setup from './pages/Setup';

const LOADING_GRACE_MS = 250;

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
      return showLoading ? <LoadingScreen /> : null;
    case 'setup':
      return <Setup />;
    case 'authenticated':
      if (route.name === 'server') {
        return <ServerDetail id={route.id} tab={route.tab} />;
      }
      if (route.name === 'account') {
        return <Account />;
      }
      return <Dashboard />;
    default:
      return <Login />;
  }
}

/**
 * sessionStorage key used by `AppRoot` to detect a fresh tab session
 * (v0.25.0+). The value persists across F5 refreshes but is wiped when
 * the user closes the tab — exactly the boundary we want.
 */
const SESSION_KEY = 'peregrine_session_started';

function AppRoot() {
  const route = useRoute();

  // v0.25.0+: when the user closes the panel on, say, `/servers/abc/console`
  // and reopens the browser later, the navigator restores that URL. We
  // prefer to land them on the Dashboard, so the first mount of a fresh
  // tab session forcibly redirects to `/` (the invite route is exempt
  // since it's a public, link-driven landing page). An F5 in the same
  // tab keeps `sessionStorage` populated and therefore stays on the
  // current page.
  useEffect(() => {
    if (route.name === 'invite') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    sessionStorage.setItem(SESSION_KEY, '1');
    if (window.location.pathname !== '/') {
      navigate('/');
    }
    // We intentionally want this effect to run ONCE per tab session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

export default function App() {
  return (
    <LanguageProvider>
      <AppRoot />
    </LanguageProvider>
  );
}
