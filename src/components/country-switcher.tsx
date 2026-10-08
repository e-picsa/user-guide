'use client';
import { COUNTRIES } from '@/lib/countries';
import { useCountry } from './country-context';

/**
 * Country picker in the guide header bar. Switching persists to localStorage
 * and mirrors into `?country=` (omitted for the default country), so the URL
 * stays shareable without a country path segment.
 */
export function CountrySwitcher() {
  const { country, setCountryCode } = useCountry();

  return (
    <label className="flex items-center gap-2 text-sm text-fd-muted-foreground">
      <span className="hidden sm:inline">Country</span>
      <select
        aria-label="Country"
        value={country.code}
        onChange={(e) => setCountryCode(e.target.value)}
        className="rounded-md border border-fd-border bg-fd-background px-2 py-1 text-sm text-fd-foreground"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
