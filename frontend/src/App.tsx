import { useEffect, useState } from 'react';
import AuthCard from './components/AuthCard';
import { AuthProvider, useAuth } from './lib/auth';
import { LanguageProvider, useTranslation } from './lib/i18n';
import { useRoute } from './lib/router';
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

export default function App() {
  return (
    <LanguageProvider>
      <AppRoot />
    </LanguageProvider>
  );
}
