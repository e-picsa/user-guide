/**
 * Page manifest for dashboard screenshots.
 *
 * - `route` is the dashboard path. Output png mirrors it unless `out` pins a
 *   stable path, e.g. `climate/station/masvingo_airport_met` with
 *   `out: 'climate/station-details.png'`.
 * - Param routes use per-deployment exemplars (`EXEMPLARS`, limited subset
 *   verified against the local docker backend seed CSVs). Do not crawl
 *   arbitrary IDs. `pagesFor(deploymentId)` throws for unconfigured
 *   deployments — add their exemplars rather than capturing 404s.
 * - `out` keeps the guide's `<Screenshot name>` stable across countries:
 *   every deployment captures its own exemplar to the same file stem, so
 *   shared MDX needs no per-country fork.
 * - `EXTRACT_VERSION` (from `extract.ts`) is folded into hashes so extraction
 *   changes refresh all sidecars.
 * - `actions` are ordered UI steps run after navigation, before capture.
 *   Omit for the default plain `goto` + capture. Includes scroll actions
 *   (`scrollTo` selector, `scrollBy` px) for explicit scroll control.
 * - `scroll` overrides the default scroll behaviour for the page:
 *   omit (or `'auto'`) to scroll the page heading out of view, `false` to
 *   capture from the top, `<px>` for a fixed offset.
 */

import { EXTRACT_VERSION } from './extract';

export type PageAction =
  | { click: string }
  | { clickText: string }
  | { wait: number }
  | { waitFor: string }
  | { scrollTo: string }
  | { scrollBy: number };

export interface PageEntry {
  route: string;
  /** Actual URL when it differs from route (e.g. pre-encoded params). */
  href?: string;
  /**
   * Stable output png path, overriding the route-mirrored default. Required
   * for param routes whose exemplar IDs differ per deployment, so each
   * country's capture lands on the file the shared guide references.
   */
  out?: string;
  actions?: PageAction[];
  scroll?: number | false | 'auto';
}

function p(
  route: string,
  actions?: PageAction[],
  href?: string,
  scroll?: PageEntry['scroll'],
  out?: string,
): PageEntry {
  return {
    route,
    ...(href ? { href } : {}),
    ...(out ? { out } : {}),
    ...(actions ? { actions } : {}),
    ...(scroll !== undefined ? { scroll } : {}),
  };
}

/**
 * Per-deployment exemplars for param routes. Verified against
 * `apps/picsa-server/supabase/data/*.csv` in the dashboard repo:
 * - `station` must be a `station_id` in `climate_stations_rows.csv` for that
 *   country *with* a data row in `climate_station_data_rows.csv` (the Charts
 *   tab capture needs real chart data).
 * - `variety` is a composite `country/crop/variety` id from `crop_data_rows.csv`.
 * - `probabilityLocation` is a `location_id` in `crop_data_downscaled_rows.csv`.
 */
export interface DeploymentExemplars {
  station: string;
  variety: string;
  probabilityLocation: string;
}

export const EXEMPLARS: Record<string, DeploymentExemplars> = {
  zm: { station: 'chipata_met', variety: 'zm/beans/CHAMBESHI', probabilityLocation: 'chadiza' },
  zw: { station: 'masvingo_airport_met', variety: 'zw/maize/SC-555', probabilityLocation: 'masvingo' },
  mw: { station: 'kasungu', variety: 'mw/beans/BUNDA-93', probabilityLocation: 'kasungu' },
};

/** URL-encode a composite variety id (`zw/maize/SC-555`) to match `:id`. */
function varietyHref(variety: string): string {
  return `crop/variety/${variety.split('/').map(encodeURIComponent).join('%2F')}`;
}

// Station details has tabbed content; capture the Charts tab with the first
// chart card selected so an actual chart renders
const STATION_DETAILS_ACTIONS: PageAction[] = [
  { waitFor: '[role="tab"]' },
  { clickText: 'Charts' },
  { wait: 2000 },
  { click: '.chart-list .chart-button' },
  { wait: 2500 },
];

/** Manifest pages for a deployment, with its exemplars baked into param routes. */
export function pagesFor(deploymentId: string): PageEntry[] {
  const ex = EXEMPLARS[deploymentId];
  if (!ex) {
    throw new Error(
      `No screenshot exemplars configured for deployment "${deploymentId}". ` +
        `Add an entry to EXEMPLARS in scripts/screenshots/manifest.ts ` +
        `(station + variety + probabilityLocation, verified against the seed CSVs).`,
    );
  }
  return [
    p('home'),
    p('climate/station'),
    p(`climate/station/${ex.station}`, STATION_DETAILS_ACTIONS, undefined, undefined, 'climate/station-details.png'),
    p('climate/forecast'),
    p('climate/admin'),
    p('crop/variety'),
    p(
      `crop/variety/${ex.variety}`,
      undefined,
      varietyHref(ex.variety),
      undefined,
      'crop/variety-details.png',
    ),
    p('crop/variety/add'),
    p('crop/probability'),
    p(`crop/probability/${ex.probabilityLocation}`, undefined, undefined, undefined, 'crop/probability-details.png'),
    p('crop/admin'),
    p('resources/files'),
    p('resources/files/dff5c161-3541-44a4-8326-0affafd26812'),
    p('resources/files/create'),
    p('resources/links'),
    p('resources/links/zmdWhatsapp'),
    p('resources/links/create'),
    p('resources/collections'),
    // NOTE: no `resources/collections/:id` exemplar, zm deployment has no collections rows
    p('resources/collections/create'),
    p('resources/farmer-videos'),
    p('translations/list'),
    p('translations/import'),
    // NOTE: no `translations/edit/:id` exemplar, list rows do not navigate to details
    p('profile'),
    p('stats'),
    p('deployment'),
    p('deployment/permissions'),
    p('map-admin'),
    p('privacy-policy'),
    p('terms-of-service'),
  ];
}

/** Map a dashboard route to a relative png path, preserving nesting. */
export function routeToFile(route: string): string {
  const safe = (seg: string) => seg.replace(/[^A-Za-z0-9\-_.]/g, '_');
  const parts = route
    .split('/')
    .filter(Boolean)
    .map(safe);
  if (parts.length === 0) return 'landing.png';
  return `${parts.join('/')}.png`;
}

/** Output png path for an entry: pinned `out`, else route-mirrored. */
export function entryToFile(entry: PageEntry): string {
  return entry.out ?? routeToFile(entry.route);
}

/** Stable short hash of a manifest entry (route + href + out + actions + scroll + extractor). */
export function entryHash(entry: PageEntry): string {
  const src = JSON.stringify({
    route: entry.route,
    href: entry.href ?? null,
    out: entry.out ?? null,
    actions: entry.actions ?? null,
    scroll: entry.scroll ?? null,
    extract: EXTRACT_VERSION,
  });
  // fnv-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
