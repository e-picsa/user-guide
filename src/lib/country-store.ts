/**
 * Client-side active-country store.
 *
 * Guides live at clean paths (`/climate/stations` — no country segment), so
 * the active country is resolved in the browser as
 * `?country=` → localStorage → build default. All reads here are pure
 * (no writes during render); persistence happens in event handlers and a
 * mount-only adopt step, keeping `useSyncExternalStore` hydration-safe and
 * the `set-state-in-effect` lint rule satisfied.
 */
import { COUNTRIES, COUNTRY_STORAGE_KEY, DEFAULT_COUNTRY } from './countries';

function isKnown(code: string | null | undefined): code is string {
  return !!code && COUNTRIES.some((c) => c.code === code);
}

function readQueryCountry(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('country');
    return isKnown(q) ? q : null;
  } catch {
    return null;
  }
}

function readStoredCountry(): string | null {
  try {
    const s = window.localStorage.getItem(COUNTRY_STORAGE_KEY);
    return isKnown(s) ? s : null;
  } catch {
    return null;
  }
}

/** Resolution order: `?country=` → localStorage → build default. Pure reads only. */
export function resolveCountryCode(): string {
  if (typeof window === 'undefined') return DEFAULT_COUNTRY;
  return readQueryCountry() ?? readStoredCountry() ?? DEFAULT_COUNTRY;
}

/** Server/prerender snapshot — the build default's screenshots are baked into static HTML. */
export function serverCountryCode(): string {
  return DEFAULT_COUNTRY;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeCountry(listener: Listener): () => void {
  listeners.add(listener);
  const onExternal = (): void => {
    emit();
  };
  window.addEventListener('storage', onExternal);
  window.addEventListener('popstate', onExternal);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onExternal);
    window.removeEventListener('popstate', onExternal);
  };
}

/**
 * Persist a `?country=` arrival into localStorage so later in-site
 * navigation (whose links carry no query) keeps the country. Called once on
 * mount — no React state involved.
 */
export function adoptQueryCountry(): void {
  const q = readQueryCountry();
  if (!q) return;
  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, q);
  } catch {
    // ignore
  }
  emit();
}

/**
 * Switch country: persists, reflects in the URL (`?country=`, omitted for
 * the default so its links stay pristine and shareable as-is), and notifies
 * subscribers. Call from event handlers only.
 */
export function setActiveCountryCode(code: string): void {
  if (!isKnown(code)) return;
  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, code);
    const url = new URL(window.location.href);
    if (code === DEFAULT_COUNTRY) url.searchParams.delete('country');
    else url.searchParams.set('country', code);
    window.history.replaceState(null, '', url);
  } catch {
    // ignore
  }
  emit();
}
