import { useSyncExternalStore } from 'react';

/**
 * Tiny path-based router. See pages/ServerDetail.tsx for the tab story.
 */

/** Every screen the URL can resolve to. */
export type Route =
  | { name: 'home' }
  | { name: 'server'; id: string; tab: ServerTab }
  | { name: 'invite'; token: string }
  | { name: 'unknown' };

/** Tabs available inside the server-detail page. */
export type ServerTab =
  | 'console'
  | 'files'
  | 'network'
  | 'backups'
  | 'subusers'
  | 'settings'
  | 'activity';

const SERVER_TABS: readonly ServerTab[] = [
  'console',
  'files',
  'network',
  'backups',
  'subusers',
  'settings',
  'activity',
];

const SERVER_PATH = /^\/servers\/([A-Za-z0-9-]+)(?:\/([a-z]+))?\/?$/;
const INVITE_PATH = /^\/invite\/([A-Za-z0-9._-]+)\/?$/;

function asServerTab(value: string | undefined): ServerTab {
  if (value && (SERVER_TABS as readonly string[]).includes(value)) {
    return value as ServerTab;
  }
  return 'console';
}

/** Parses a pathname into a typed Route value. */
export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') {
    return { name: 'home' };
  }
  const invite = INVITE_PATH.exec(pathname);
  if (invite) {
    return { name: 'invite', token: invite[1] };
  }
  const server = SERVER_PATH.exec(pathname);
  if (server) {
    return { name: 'server', id: server[1], tab: asServerTab(server[2]) };
  }
  return { name: 'unknown' };
}

const NAVIGATION_EVENT = 'peregrine:navigate';

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener(NAVIGATION_EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(NAVIGATION_EVENT, callback);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

/** React hook that returns the current route and re-renders on changes. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return parseRoute(pathname);
}

/** Navigates to the given path, updates the URL with pushState. */
export function navigate(to: string): void {
  if (window.location.pathname === to) {
    return;
  }
  window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

/** Convenience builder for the server-detail URL. */
export function serverPath(id: string, tab?: ServerTab): string {
  return tab && tab !== 'console' ? `/servers/${id}/${tab}` : `/servers/${id}`;
}
