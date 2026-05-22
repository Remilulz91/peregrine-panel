import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type ApiUser } from './api';

/** The possible states of the application's authentication. */
export type AuthStatus =
  | 'loading'
  | 'setup'
  | 'unauthenticated'
  | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  /** Re-checks the authentication state with the backend. */
  refresh: () => Promise<void>;
  /** Records a freshly logged-in user (after setup or login). */
  signIn: (user: ApiUser) => void;
  /** Logs the current user out. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the authentication state for the whole interface and shares it
 * through React context. On mount it asks the backend whether the
 * first-run setup is needed and whether a user is already logged in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { setupRequired } = await api.setupRequired();
      if (setupRequired) {
        setUser(null);
        setStatus('setup');
        return;
      }
      const { user: current } = await api.me();
      setUser(current);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback((current: ApiUser) => {
    setUser(current);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(
    () => ({ status, user, refresh, signIn, signOut }),
    [status, user, refresh, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to read the authentication state from any component. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
