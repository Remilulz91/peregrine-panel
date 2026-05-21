import { LanguageProvider } from './lib/i18n';
import Home from './pages/Home';

// Root component of the application.
// Phase 0: a single page (the home page). Routing between several pages
// (login, dashboard, etc.) will be added in Phase 1.
//
// The LanguageProvider makes the bilingual (English / French) system
// available to the whole interface.
export default function App() {
  return (
    <LanguageProvider>
      <Home />
    </LanguageProvider>
  );
}
