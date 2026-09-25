/**
 * Capture 720p screenshots of dashboard pages for the user guide.
 *
 * Flow: logged-out landing capture -> login (seed creds) -> deployment select
 * -> client-side navigate each manifest page -> viewport screenshot.
 *
 * Env: SHOTS_BASE_URL, SHOTS_EMAIL, SHOTS_PASSWORD, SHOTS_DEPLOYMENT,
 * SHOTS_DEPLOYMENT_LABEL, SHOTS_ID, SHOTS_OUT_DIR, SHOTS_ONLY (comma filter),
 * SHOTS_SCROLL (auto|off|<px>), CHROME_PATH.
 *
 * Run: bun scripts/screenshots/run.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

import { loadConfig, resolveChromePath, type ScrollDefault } from './config';
import { diffAgainstFile } from './diff';
import {
  extractContentHtml,
  extractMeta,
  META_LIMITS,
  type ScreenshotMeta,
} from './extract';
import { entryHash, PAGES, routeToFile, type PageAction, type PageEntry } from './manifest';

/**
 * Evaluate a serializable extraction function inside the page.
 * `extract.ts` functions are written in TypeScript but run in the dashboard's
 * plain-JS context, so they are transpiled (types stripped) and invoked via a
 * self-contained call string. All args must be JSON-serializable, and the
 * function must not reference module scope (guarded by `shots:verify`).
 */
export function buildEvalCall(fn: (...args: any[]) => unknown, ...args: unknown[]): string {
  const js = transpileModule(fn.toString(), {
    compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.None },
  })
    .outputText.replace(/^\s*export\s+/, '')
    // transpile prologue cannot sit inside the parenthesised call below
    .replace(/^(\s*['"]use strict['"];\s*)+/, '');
  return `(${js})(${args.map((a) => JSON.stringify(a) ?? 'undefined').join(',')})`;
}

export async function evaluateInPage<R>(
  page: Page,
  fn: (...args: any[]) => R,
  ...args: unknown[]
): Promise<R> {
  return (await page.evaluate(buildEvalCall(fn, ...args))) as R;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Status = 'captured' | 'reused' | 'unchanged' | 'skipped' | 'failed';

interface Result {
  route: string;
  file: string;
  status: Status;
  detail?: string;
  /** Dashboard version the png was captured at. */
  version?: string;
  /** Manifest entry hash the png was captured with. */
  hash?: string;
  capturedAt?: string;
}

interface PrevManifest {
  identifier: string;
  dashboardVersion: string;
  results: Result[];
}

function loadPrevManifest(outRoot: string): PrevManifest | null {
  const path = join(outRoot, 'manifest.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PrevManifest;
    if (!parsed || !Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Dashboard version for staleness checks. Prefers the version rendered by the
 * running instance (`dashboard-footer`), falls back to the picsa-apps checkout
 * the local server is served from.
 */
async function getDashboardVersion(page: Page): Promise<string> {
  try {
    const text = await page.evaluate(() => document.querySelector('dashboard-footer')?.innerHTML ?? '');
    const m = text.match(/(\d+\.\d+\.\d+)/);
    if (m) return m[1];
  } catch {
    // fall through to repo source
  }
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), '../picsa-apps/package.json'), 'utf8')) as {
      version?: string;
    };
    if (pkg.version) return pkg.version;
  } catch {
    // unknown
  }
  return 'unknown';
}

async function clientNavigate(page: Page, route: string): Promise<void> {
  const target = `/${route}`.replace(/\/+/g, '/');
  await page.evaluate((t) => {
    history.pushState({}, '', t);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, target);
  await page.waitForFunction((t) => window.location.pathname === t, { timeout: 10_000 }, target);
}

/** Settle: network quiet + fixed delay for charts/maps + kill animations. */
export async function settle(page: Page): Promise<void> {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
  await sleep(1500);
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}',
  });
}

/** Hide fixed app chrome (toolbar/footer) — identical across pages, adds no per-page value. */
async function hideChrome(page: Page, selectors: string[]): Promise<void> {
  if (!selectors.length) return;
  await page.addStyleTag({ content: selectors.map((s) => `${s}{display:none!important}`).join('\n') });
  await sleep(300);
}

interface CaptureOutcome {
  /** True when the png was (re)written, false when the previous file was kept. */
  wrote: boolean;
  /** Changed-pixel ratio vs previous file, null when no baseline existed. */
  ratio: number | null;
}

/**
 * Screenshot to `file`, keeping the previous png when the diff is within
 * `threshold` so unchanged pages don't bloat git history.
 */
async function capture(page: Page, file: string, threshold: number | null): Promise<CaptureOutcome> {
  const buffer = await page.screenshot();
  let ratio: number | null = null;
  if (threshold !== null) {
    const diff = diffAgainstFile(file, buffer);
    ratio = diff?.ratio ?? null;
    if (diff && diff.ratio <= threshold) return { wrote: false, ratio };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
  return { wrote: true, ratio };
}

/** Dashboard page scroll container (the only element with meaningful overflow). */
const SCROLL_CONTAINER = 'div.page';

/**
 * Default scroll: move the page heading out of view so captures start at
 * content. Per-page `scroll` overrides: `false` keeps top, `<px>` is fixed.
 */
async function applyScroll(page: Page, entry: PageEntry, fallback: ScrollDefault): Promise<number> {
  const mode: ScrollDefault =
    entry.scroll === undefined
      ? fallback
      : entry.scroll === false
        ? { mode: 'off' }
        : entry.scroll === 'auto'
          ? { mode: 'auto' }
          : { mode: 'px', value: entry.scroll };
  if (mode.mode === 'off') return scrollToTop(page);
  if (mode.mode === 'px') return scrollToPx(page, mode.value);
  return scrollHeaderOutOfView(page);
}

async function scrollToTop(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLElement | null;
    if (!c) return 0;
    c.scrollTop = 0;
    return 0;
  }, SCROLL_CONTAINER);
}

async function scrollToPx(page: Page, px: number): Promise<number> {
  return page.evaluate(
    (sel, y) => {
      const c = document.querySelector(sel) as HTMLElement | null;
      if (!c) return 0;
      c.scrollTop = y;
      return c.scrollTop;
    },
    SCROLL_CONTAINER,
    px,
  );
}

async function scrollByPx(page: Page, dy: number): Promise<number> {
  return page.evaluate(
    (sel, y) => {
      const c = document.querySelector(sel) as HTMLElement | null;
      if (!c) return 0;
      c.scrollBy(0, y);
      return c.scrollTop;
    },
    SCROLL_CONTAINER,
    dy,
  );
}

async function scrollSelectorIntoView(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel, target) => {
      const c = document.querySelector(sel) as HTMLElement | null;
      const el = c?.querySelector(target) ?? document.querySelector(target);
      if (!c || !el) throw new Error(`scroll target not found: ${target}`);
      el.scrollIntoView({ block: 'start' });
      return c.scrollTop;
    },
    SCROLL_CONTAINER,
    selector,
  );
}

/** Scroll just past the page heading so it is fully out of view. */
async function scrollHeaderOutOfView(page: Page): Promise<number> {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLElement | null;
    if (!c) return 0;
    const heading = c.querySelector('h1, h2');
    if (!heading) {
      c.scrollTop = 0;
      return 0;
    }
    const cRect = c.getBoundingClientRect();
    const hRect = heading.getBoundingClientRect();
    c.scrollTop = Math.max(0, c.scrollTop + (hRect.bottom - cRect.top) + 2);
    return c.scrollTop;
  }, SCROLL_CONTAINER);
}

async function runAction(page: Page, action: PageAction): Promise<void> {
  if ('wait' in action) {
    await sleep(action.wait);
    return;
  }
  if ('waitFor' in action) {
    await page.waitForSelector(action.waitFor, { timeout: 15_000 });
    return;
  }
  if ('click' in action) {
    await page.waitForSelector(action.click, { timeout: 15_000 });
    await page.click(action.click);
    await sleep(1000);
    return;
  }
  if ('scrollTo' in action) {
    await page.waitForSelector(action.scrollTo, { timeout: 15_000 });
    await scrollSelectorIntoView(page, action.scrollTo);
    await sleep(500);
    return;
  }
  if ('scrollBy' in action) {
    await scrollByPx(page, action.scrollBy);
    await sleep(500);
    return;
  }
  const found = await page.evaluate((text) => {
    // Dashboard content lives in mat-sidenav-content (no <main> element)
    const root = document.querySelector('mat-sidenav-content') ?? document;
    const els = [...root.querySelectorAll('button, a, [role="tab"]')];
    const m = els.find((el) => (el as HTMLElement).innerText?.includes(text));
    if (!m) return false;
    (m as HTMLElement).click();
    return true;
  }, action.clickText);
  if (!found) throw new Error(`clickText not found: ${action.clickText}`);
  await sleep(1000);
}

export async function login(page: Page, baseUrl: string, email: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0', timeout: 60_000 });
  await sleep(2500);
  const emailInput = await page.$('input[type="email"]');
  if (!emailInput) return; // already authed (persistent context reuse)
  await page.$eval('input[type="email"]', (el) => (el as HTMLInputElement).focus());
  await page.keyboard.type(email);
  await page.$eval('input[type="password"]', (el) => (el as HTMLInputElement).focus());
  await page.keyboard.type(password);
  for (const b of await page.$$('button')) {
    const t = await page.evaluate((el) => el.innerText.trim(), b);
    if (/^login$/i.test(t)) {
      await b.click();
      break;
    }
  }
  await sleep(5000);
}

export async function selectDeployment(page: Page, label: string, id: string): Promise<boolean> {
  const clicked = await page.evaluate((text) => {
    const m = [...document.querySelectorAll('button, a')].find((el) =>
      (el as HTMLElement).innerText.trim().startsWith(text),
    );
    if (m) {
      (m as HTMLElement).click();
      return true;
    }
    return false;
  }, label);
  if (!clicked) return false;
  try {
    await page.waitForFunction((exp) => localStorage.getItem('picsa_dashboard_deployment') === exp, { timeout: 20_000 }, id);
    await sleep(2000);
    return true;
  } catch {
    // User has no membership: picker stays on request-access, nothing is stored
    return false;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const only = (process.env.SHOTS_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const force = ['1', 'true', 'yes'].includes((process.env.SHOTS_FORCE ?? '').toLowerCase());
  const pages = only.length ? PAGES.filter((p) => only.some((f) => p.route.includes(f))) : PAGES;
  const outRoot = join(config.outDir, config.identifier);
  const prev = force ? null : loadPrevManifest(outRoot);
  const prevByRoute = new Map((prev?.results ?? []).map((r) => [r.route, r]));
  const results: Result[] = [];
  const landingRoute = '(logged-out) home';
  let dashboardVersion = prev?.dashboardVersion ?? 'unknown';

  /** Reuse a previous png when version + entry hash match and the files exist. */
  function reused(route: string, file: string, hash: string): Result | null {
    if (force || only.length || dashboardVersion === 'unknown') return null;
    const p = prevByRoute.get(route);
    if (!p || (p.status !== 'captured' && p.status !== 'reused' && p.status !== 'unchanged')) return null;
    if (p.version !== dashboardVersion || p.hash !== hash) return null;
    if (!existsSync(p.file ? resolve(p.file) : file)) return null;
    if (config.meta && !metaFilesExist(file)) return null;
    return {
      route,
      file: p.file || file,
      status: 'reused',
      detail: `up to date at v${dashboardVersion} (hash ${hash})`,
      version: p.version,
      hash: p.hash,
      capturedAt: p.capturedAt,
    };
  }

  /** Sibling metadata paths for a png file. */
  function metaPaths(pngFile: string): { json: string; html: string } {
    const stem = pngFile.replace(/\.png$/, '');
    return { json: `${stem}.json`, html: `${stem}.html` };
  }

  function metaFilesExist(pngFile: string): boolean {
    const { json, html } = metaPaths(pngFile);
    return existsSync(json) && existsSync(html);
  }

  /**
   * Collect + write the .json metadata and .html content snapshot siblings.
   * Failures never fail the capture itself.
   */
  async function writeMeta(
    page: Page,
    routeKey: string,
    pngFile: string,
    capturedAt: string,
  ): Promise<void> {
    if (!config.meta) return;
    try {
      const meta: ScreenshotMeta = await evaluateInPage(
        page,
        extractMeta,
        routeKey,
        config.identifier,
        dashboardVersion,
        capturedAt,
        config.viewport.width,
        config.viewport.height,
        META_LIMITS,
      );
      const html = await evaluateInPage(page, extractContentHtml);
      const { json, html: htmlPath } = metaPaths(pngFile);
      mkdirSync(dirname(json), { recursive: true });
      writeFileSync(json, `${JSON.stringify(meta, null, 2)}\n`);
      writeFileSync(htmlPath, html);
    } catch (e) {
      console.warn(`meta failed for ${routeKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720'],
  });
  try {
    // Logged-out landing state (fresh context, no auth)
    const landingCtx = await browser.createBrowserContext();
    const landingPage = await landingCtx.newPage();
    await landingPage.setViewport({ ...config.viewport, deviceScaleFactor: 1 });
    const landingFile = join(outRoot, 'landing.png');
    const landingHash = entryHash({ route: landingRoute });
    try {
      await landingPage.goto(`${config.baseUrl}/home`, { waitUntil: 'networkidle0', timeout: 60_000 });
      await settle(landingPage);
      dashboardVersion = await getDashboardVersion(landingPage);
      const hit = reused(landingRoute, landingFile, landingHash);
      if (hit) {
        results.push(hit);
      } else {
        await hideChrome(landingPage, config.hideChrome);
        const { wrote, ratio } = await capture(landingPage, landingFile, config.diffThreshold);
        const at = wrote ? new Date().toISOString() : (prevByRoute.get(landingRoute)?.capturedAt ?? new Date().toISOString());
        await writeMeta(landingPage, landingRoute, landingFile, at);
        results.push({
          route: landingRoute,
          file: landingFile,
          status: wrote ? 'captured' : 'unchanged',
          detail: wrote ? undefined : `matches previous (${((ratio ?? 0) * 100).toFixed(2)}% changed)`,
          version: dashboardVersion,
          hash: landingHash,
          capturedAt: at,
        });
      }
    } catch (e) {
      results.push({ route: landingRoute, file: '', status: 'failed', detail: String(e) });
    }
    await landingCtx.close();

    const page = await browser.newPage();
    await page.setViewport({ ...config.viewport, deviceScaleFactor: 1 });
    await login(page, config.baseUrl, config.email, config.password);
    const hasDeployment = await selectDeployment(page, config.deploymentLabel, config.deploymentId);
    if (!hasDeployment) {
      // No membership for this deployment: capture the request-access state and skip the rest.
      // Grant access (as admin via /deployment/permissions, or join a public deployment) then re-run.
      await settle(page);
      await hideChrome(page, config.hideChrome);
      const file = join(outRoot, 'no-access.png');
      const { wrote } = await capture(page, file, config.diffThreshold);
      await writeMeta(page, '(deployment select)', file, new Date().toISOString());
      results.push({ route: '(deployment select)', file, status: wrote ? 'captured' : 'unchanged', detail: 'user has no access, request-access state', version: dashboardVersion });
      for (const entry of pages) {
        results.push({ route: entry.route, file: '', status: 'skipped', detail: 'no deployment access for user' });
      }
    } else {
      for (const entry of pages) {
        const file = join(outRoot, routeToFile(entry.route));
        const hash = entryHash(entry);
        const hit = reused(entry.route, file, hash);
        if (hit) {
          results.push(hit);
          continue;
        }
        const href = entry.href ?? entry.route;
        try {
          await clientNavigate(page, href);
          await settle(page);
          // Role guard bounce: non-home target landing on /home means no access.
          // Retry once (a redirect may have been in flight from the previous page).
          if (entry.route !== 'home' && new URL(page.url()).pathname === '/home') {
            await clientNavigate(page, href);
            await settle(page);
          }
          if (entry.route !== 'home' && new URL(page.url()).pathname === '/home') {
            results.push({ route: entry.route, file, status: 'skipped', detail: 'redirected to /home (guard or missing data)' });
            continue;
          }
          for (const action of entry.actions ?? []) await runAction(page, action);
          await settle(page);
          await hideChrome(page, config.hideChrome);
          const scrolled = await applyScroll(page, entry, config.scroll);
          const { wrote, ratio } = await capture(page, file, config.diffThreshold);
          const at = wrote ? new Date().toISOString() : (prevByRoute.get(entry.route)?.capturedAt ?? new Date().toISOString());
          await writeMeta(page, entry.route, file, at);
          if (wrote) {
            results.push({
              route: entry.route,
              file,
              status: 'captured',
              detail: `scrollTop=${scrolled}${ratio !== null ? `, ${(ratio * 100).toFixed(2)}% changed` : ''}`,
              version: dashboardVersion,
              hash,
              capturedAt: at,
            });
          } else {
            results.push({
              route: entry.route,
              file,
              status: 'unchanged',
              detail: `matches previous (${((ratio ?? 0) * 100).toFixed(2)}% changed), scrollTop=${scrolled}`,
              version: dashboardVersion,
              hash,
              capturedAt: at,
            });
          }
        } catch (e) {
          results.push({ route: entry.route, file, status: 'failed', detail: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }

  // Merge with previous manifest so SHOTS_ONLY subset runs preserve other pages.
  // Full runs prune results for routes no longer in the manifest.
  const knownRoutes = new Set([landingRoute, '(deployment select)', ...PAGES.map((p) => p.route)]);
  const merged = new Map<string, Result>();
  if (prev && only.length) {
    for (const r of prev.results) merged.set(r.route, r);
  } else if (prev && !only.length) {
    for (const r of prev.results) {
      if (knownRoutes.has(r.route)) merged.set(r.route, r);
    }
  }
  for (const r of results) merged.set(r.route, r);
  const finalResults = [...merged.values()];
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(
    join(outRoot, 'manifest.json'),
    `${JSON.stringify({ identifier: config.identifier, dashboardVersion, generatedAt: new Date().toISOString(), results: finalResults }, null, 2)}\n`,
  );
  const counts = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(`dashboard v${dashboardVersion} | ${counts('captured')} captured, ${counts('reused')} reused, ${counts('unchanged')} unchanged, ${counts('skipped')} skipped, ${counts('failed')} failed`);
  for (const r of results) console.log(`${r.status.toUpperCase().padEnd(9)} ${r.route}${r.detail ? ` (${r.detail})` : ''}`);
  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length) {
    console.error(`${failed.length} page(s) failed`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
