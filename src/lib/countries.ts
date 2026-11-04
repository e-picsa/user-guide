/**
 * Country registry for per-country user guides.
 *
 * Each country renders the same shared boilerplate from `content/docs/`,
 * but resolves screenshots (and later, text tokens and page overwrites)
 * to its own deployment. Admin captures only for now (`<code>-admin`);
 * role-specific variants (e.g. `-user`) are a later concern.
 */
export interface CountryConfig {
  /** URL + deployment code, e.g. `zm`, `zw`. */
  code: string;
  /** Display name, e.g. `Zambia`. */
  name: string;
  /** Dashboard deployment label, e.g. `Zambia App`. */
  deploymentLabel: string;
  /** Screenshot identifier, e.g. `zm-admin` -> `public/screenshots/zm-admin/...`. */
  shotsId: string;
  /** Short picker blurb. */
  description: string;
}

export const COUNTRIES: CountryConfig[] = [
  {
    code: 'zm',
    name: 'Zambia',
    deploymentLabel: 'Zambia App',
    shotsId: 'zm-admin',
    description: 'Guide with screenshots from the Zambia deployment.',
  },
  {
    code: 'zw',
    name: 'Zimbabwe',
    deploymentLabel: 'Zimbabwe App',
    shotsId: 'zw-admin',
    description: 'Guide with screenshots from the Zimbabwe deployment.',
  },
];

/**
 * Build-time default country (`NEXT_PUBLIC_GUIDE_COUNTRY`, else `zm`).
 * The static prerender bakes this country's screenshots into the HTML; the
 * client upgrades to `?country=` → localStorage after mount. A Zimbabwe
 * print/PDF build sets `NEXT_PUBLIC_GUIDE_COUNTRY=zw`.
 */
function resolveDefaultCountry(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_GUIDE_COUNTRY ?? '').trim().toLowerCase();
  if (fromEnv && COUNTRIES.some((c) => c.code === fromEnv)) return fromEnv;
  return 'zm';
}

export const DEFAULT_COUNTRY = resolveDefaultCountry();

/** localStorage key for the remembered country choice. */
export const COUNTRY_STORAGE_KEY = 'picsa_guide_country';

export function getCountry(code: string | undefined | null): CountryConfig | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code);
}

export function isCountryCode(code: string | undefined | null): boolean {
  return getCountry(code) !== undefined;
}
