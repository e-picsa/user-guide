'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DEFAULT_COUNTRY, getCountry, type CountryConfig } from '@/lib/countries';
import {
  adoptQueryCountry,
  resolveCountryCode,
  serverCountryCode,
  setActiveCountryCode,
  subscribeCountry,
} from '@/lib/country-store';

interface CountryContextValue {
  country: CountryConfig;
  setCountryCode: (code: string) => void;
}

const fallback = getCountry(DEFAULT_COUNTRY) ?? {
  code: DEFAULT_COUNTRY,
  name: DEFAULT_COUNTRY,
  deploymentLabel: DEFAULT_COUNTRY,
  shotsId: `${DEFAULT_COUNTRY}-admin`,
  description: '',
};

const CountryContext = createContext<CountryContextValue>({
  country: fallback,
  setCountryCode: setActiveCountryCode,
});

export function useCountry(): CountryContextValue {
  return useContext(CountryContext);
}

/**
 * Provides the active country to client components (e.g. `Screenshot`,
 * `CountrySwitcher`). Resolution is `?country=` → localStorage → build
 * default via `useSyncExternalStore`, so the static prerender (default
 * country) hydrates without mismatch and upgrades on the client.
 */
export function CountryProvider({ children }: { children: ReactNode }) {
  const code = useSyncExternalStore(subscribeCountry, resolveCountryCode, serverCountryCode);

  useEffect(() => {
    adoptQueryCountry();
  }, []);

  const value = useMemo<CountryContextValue>(
    () => ({
      country: getCountry(code) ?? fallback,
      setCountryCode: setActiveCountryCode,
    }),
    [code],
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}
