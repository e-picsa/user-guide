/**
 * Page manifest for dashboard screenshots.
 *
 * - `route` is the dashboard path. Output png mirrors it, e.g.
 *   `climate/station/chipata_met` -> `<identifier>/climate/station/chipata_met.png`.
 * - Param routes use hardcoded exemplars (limited subset, verified against
 *   the local docker backend for the `zm` deployment). Do not crawl arbitrary IDs.
 * - `actions` are ordered UI steps run after navigation, before capture.
 *   Omit for the default plain `goto` + capture. Includes scroll actions
 *   (`scrollTo` selector, `scrollBy` px) for explicit scroll control.
 * - `scroll` overrides the default scroll behaviour for the page:
 *   omit (or `'auto'`) to scroll the page heading out of view, `false` to
 *   capture from the top, `<px>` for a fixed offset.
 */

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
  actions?: PageAction[];
  scroll?: number | false | 'auto';
}

function p(route: string, actions?: PageAction[], href?: string, scroll?: PageEntry['scroll']): PageEntry {
  return {
    route,
    ...(href ? { href } : {}),
    ...(actions ? { actions } : {}),
    ...(scroll !== undefined ? { scroll } : {}),
  };
}

export const PAGES: PageEntry[] = [
  p('home'),
  p('climate/station'),
  // Station details has tabbed content; capture the Charts tab as the exemplar state
  p('climate/station/chipata_met', [{ waitFor: '[role="tab"]' }, { clickText: 'Charts' }, { wait: 2000 }]),
  p('climate/forecast'),
  p('climate/admin'),
  p('crop/variety'),
  // Variety ids are composite (`country/crop/variety`) and must be url-encoded to match `:id`
  p('crop/variety/zm/beans/CHAMBESHI', undefined, 'crop/variety/zm%2Fbeans%2FCHAMBESHI'),
  p('crop/variety/add'),
  p('crop/probability'),
  p('crop/probability/chadiza'),
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

/** Stable short hash of a manifest entry (route + href + actions + scroll). */
export function entryHash(entry: PageEntry): string {
  const src = JSON.stringify({
    route: entry.route,
    href: entry.href ?? null,
    actions: entry.actions ?? null,
    scroll: entry.scroll ?? null,
  });
  // fnv-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
