import { useSyncExternalStore } from 'react';

/**
 * Router mínimo basado en el hash (#/ruta?param=x). GitHub Pages no sabe
 * redirigir rutas a index.html, así que el hash es lo más robusto y además
 * funciona offline con el service worker.
 */

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = '/' + (pathPart ?? '').split('/').filter(Boolean).join('/');
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(queryPart) };
}

let current = parseHash();
const listeners = new Set<() => void>();

window.addEventListener('hashchange', () => {
  current = parseHash();
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function href(path: string, query?: Record<string, string>): string {
  const q = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `#${path}${q}`;
}

export function navigate(path: string, query?: Record<string, string>): void {
  window.location.hash = href(path, query).slice(1);
}
