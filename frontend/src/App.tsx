import AuthCard from './components/AuthCard';
import { AuthProvider, useAuth } from './lib/auth';
import { LanguageProvider, useTranslation } from './lib/i18n';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Setup from './pages/Setup';

/** Shown briefly while the authentication state is being checked. */
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
 *   loading        -> a short loading screen
 *   setup          -> the first-run administrator wizard
 *   authenticated  -> the dashboard
 *   otherwise      -> the login screen
 */
function CurrentScreen() {
  const { status } = useAuth();
  switch (status) {
    case 'loading':
      return <LoadingScreen />;
    case 'setup':
      return <Setup />;
    case 'authenticated':
      return <Dashboard />;
    default:
      return <Login />;
  }
}

// Root component. The providers make the language and the authentication
// state available to the whole interface.
export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CurrentScreen />
      </AuthProvider>
    </LanguageProvider>
  );
}
