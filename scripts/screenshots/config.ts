/** Shared config for the dashboard screenshot runner. All values overridable via env. */
import { accessSync, constants as fsConstants } from 'node:fs';

/** Default scroll behaviour for captures (overridable per page in manifest). */
export type ScrollDefault = { mode: 'auto' } | { mode: 'off' } | { mode: 'px'; value: number };

export interface ShotsConfig {
  /** Dashboard instance under capture. Local dev only. */
  baseUrl: string;
  /** Seed user email (password is same as email for local docker seeds). */
  email: string;
  password: string;
  /** Deployment id persisted to `picsa_dashboard_deployment` localStorage. */
  deploymentId: string;
  /** Label shown in the deployment picker, clicked after login. */
  deploymentLabel: string;
  /** Top-level output identifier, e.g. `zm-admin`, `mw-user`. */
  identifier: string;
  /** Output root (route-mirrored pngs land in `<outDir>/<identifier>/...`). */
  outDir: string;
  viewport: { width: number; height: number };
  /** Page scroll before capture. `auto` scrolls the page heading out of view. */
  scroll: ScrollDefault;
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadConfig(): ShotsConfig {
  return {
    baseUrl: env('SHOTS_BASE_URL', 'http://localhost:4200'),
    email: env('SHOTS_EMAIL', 'admin@picsa.app'),
    password: env('SHOTS_PASSWORD', env('SHOTS_EMAIL', 'admin@picsa.app')),
    deploymentId: env('SHOTS_DEPLOYMENT', 'zm'),
    deploymentLabel: env('SHOTS_DEPLOYMENT_LABEL', 'Zambia App'),
    identifier: env('SHOTS_ID', 'zm-admin'),
    outDir: env('SHOTS_OUT_DIR', 'public/screenshots'),
    viewport: { width: 1280, height: 720 },
    scroll: parseScrollDefault(env('SHOTS_SCROLL', 'auto')),
  };
}

/**
 * Parse SHOTS_SCROLL: `auto` (scroll page heading out of view), `off`/`0`
 * (capture from top), or `<px>` fixed offset.
 */
function parseScrollDefault(raw: string): ScrollDefault {
  const v = raw.trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return { mode: 'off' };
  if (v === 'auto' || v === '') return { mode: 'auto' };
  const px = Number(v);
  if (Number.isFinite(px) && px >= 0) return { mode: 'px', value: px };
  throw new Error(`Invalid SHOTS_SCROLL="${raw}", expected auto|off|<px>`);
}

/** Resolve a Chrome executable: explicit env first, then puppeteer browser cache. */
export function resolveChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-134.0.6998.35/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      accessSync(p, fsConstants.X_OK);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(
    `No Chrome executable found. Set CHROME_PATH. Tried: ${candidates.join(', ')}`,
  );
}
