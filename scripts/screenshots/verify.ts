/**
 * Offline verification for the screenshot tooling. No dashboard server needed.
 *
 * Checks entry hashing, pixel diffing, and the browser-serialization
 * round-trip + behaviour of the extract.ts functions against fixture HTML.
 *
 * Run: bun run shots:verify
 */
import { JSDOM } from 'jsdom';
import { PNG } from 'pngjs';

import { diffAgainstFile } from './diff';
import { extractContentHtml, extractMeta, META_LIMITS, type ScreenshotMeta } from './extract';
import { entryHash, PAGES } from './manifest';
import { buildEvalCall } from './run';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
  if (!cond) failures++;
}

// --- entry hashes -----------------------------------------------------------
check('hash stable', entryHash({ route: 'home' }) === entryHash({ route: 'home' }));
check(
  'hash sensitive to actions',
  entryHash({ route: 'x', actions: [{ wait: 1 }] }) !== entryHash({ route: 'x' }),
);
check(
  'hash sensitive to scroll',
  entryHash({ route: 'x', scroll: false }) !== entryHash({ route: 'x', scroll: 10 }),
);
check('hash sensitive to href', entryHash({ route: 'x', href: 'y' }) !== entryHash({ route: 'x' }));
check(
  `all ${PAGES.length} page hashes unique`,
  new Set(PAGES.map(entryHash)).size === PAGES.length,
);

// --- pixel diff (synthetic) --------------------------------------------------
function solid(w: number, h: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
const W = 1280;
const H = 720;
const base = solid(W, H, 250, 250, 250);
const same = diffAgainstFile('/tmp/shots-verify-base.png', base);
check('missing baseline -> null (treat as changed)', same === null);

const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync('/tmp/shots-verify', { recursive: true });
writeFileSync('/tmp/shots-verify/base.png', base);
const dSame = diffAgainstFile('/tmp/shots-verify/base.png', base);
check('identical -> ratio 0', dSame !== null && dSame.ratio === 0);

const changed = PNG.sync.read(base);
for (let y = 0; y < 100; y++) {
  for (let x = 0; x < 100; x++) {
    const i = (W * y + x) * 4;
    changed.data[i] = 200;
    changed.data[i + 1] = 0;
    changed.data[i + 2] = 0;
  }
}
const dChanged = diffAgainstFile('/tmp/shots-verify/base.png', PNG.sync.write(changed));
check('100x100 change detected below 2%', dChanged !== null && dChanged.ratio > 0 && dChanged.ratio < 0.02);
check('dimension change -> null', diffAgainstFile('/tmp/shots-verify/base.png', solid(800, 600, 1, 2, 3)) === null);

// --- extraction against fixture HTML ----------------------------------------
const FIXTURE = `<!doctype html><html><head><title>PICSA Dashboard</title>
<style>.x{color:red}</style><script>console.log(1)</script></head><body>
<mat-toolbar><span>Zambia App</span></mat-toolbar>
<mat-sidenav>
  <a href="/home">Home</a>
  <a href="/climate/station">Station Data</a>
  <a href="/hidden" hidden>Hidden Link</a>
</mat-sidenav>
<div class="page">
  <h2 _ngcontent-abc="x" ng-reflect-title="y">Climate Data Admin</h2>
  <h2>Climate Data Admin</h2>
  <button><mat-icon>refresh</mat-icon>Refresh All</button>
  <a href="/home"><mat-icon>home</mat-icon><span>Home</span></a>
  <button aria-label="Close dialog">X</button>
  <button style="display:none">Invisible</button>
  <a href="/climate/station/chipata_met">CHIPATA MET</a>
  <input type="email" placeholder="Search Data" />
  <input type="hidden" value="secret" />
  <div role="tab">Charts</div>
  <div aria-hidden="true"><button>Ghost</button></div>
  <table class="data-table">
    <thead><tr><th>Name</th><th>Updated At</th></tr></thead>
    <tbody>
      <tr><td>CHIPATA MET</td><td>Sep 22, 2026</td></tr>
      <tr><td>CHOMA MET</td><td>Sep 24, 2026</td></tr>
      <tr><td>ISOKA MET</td><td>Sep 24, 2026</td></tr>
      <tr><td>KABWE MET</td><td>Sep 24, 2026</td></tr>
    </tbody>
  </table>
</div>
<div role="dialog" aria-label="Request Access"><h3>Request Access</h3></div>
</body></html>`;

const dom = new JSDOM(FIXTURE, { url: 'http://localhost:4200/climate/admin' });
(globalThis as any).document = dom.window.document;
(globalThis as any).window = dom.window;

function runSerialized<T>(fn: (...args: any[]) => T, ...args: unknown[]): T {
  // Same path as the runner: transpile, build the call string, eval it.
  // eval is intentional here — it proves the string parses and executes.
  return eval(buildEvalCall(fn, ...args)) as T;
}

const meta = runSerialized<ScreenshotMeta>(
  extractMeta,
  'climate/admin',
  'zm-admin',
  '5.13.1',
  '2026-01-01T00:00:00.000Z',
  1280,
  720,
  META_LIMITS,
);
check('meta route/url/title', meta.route === 'climate/admin' && meta.title === 'PICSA Dashboard');
check('meta headings deduped', meta.headings.length === 1 && meta.headings[0].text === 'Climate Data Admin');
check(
  'interactive finds button, link, input, tab',
  meta.interactive.some((e) => e.text === 'Refresh All') &&
    meta.interactive.some((e) => e.text === 'Home' && e.kind === 'link') &&
    meta.interactive.some((e) => e.kind === 'link' && e.href === '/climate/station/chipata_met') &&
    meta.interactive.some((e) => e.kind === 'input' && (e.label ?? '').startsWith('input:email')) &&
    meta.interactive.some((e) => e.kind === 'tab' && e.text === 'Charts'),
);
check('icon ligatures excluded from labels', !meta.interactive.some((e) => /refreshHome|homeHome/.test(e.text)));
check(
  'hidden elements excluded',
  !meta.interactive.some((e) => /Invisible|Ghost|secret/.test(e.text)),
);
check(
  'table headers + first rows + total count',
  meta.tables.length === 1 &&
    meta.tables[0].headers.join(',') === 'Name,Updated At' &&
    meta.tables[0].rows.length === 3 &&
    meta.tables[0].rows[0][0] === 'CHIPATA MET' &&
    meta.tables[0].rowCount === 4,
);
check(
  'nav from sidenav, hidden excluded',
  meta.nav.some((n) => n.label === 'Home' && n.href === '/home') &&
    !meta.nav.some((n) => /Hidden/.test(n.label)),
);
check('dialog captured', meta.dialogs.length === 1 && meta.dialogs[0].text === 'Request Access');
check(
  'bbox shape present',
  ['x', 'y', 'width', 'height'].every((k) => k in (meta.interactive[0]?.bbox ?? {})),
);

const html = runSerialized<string>(extractContentHtml);
check('html keeps table content', html.includes('CHIPATA MET') && html.includes('<table'));
check('html strips script/style', !html.includes('<script') && !html.includes('<style'));
check(
  'html strips angular attrs, keeps classes',
  !html.includes('_ngcontent') && !html.includes('ng-reflect') && html.includes('class="data-table"'),
);

// --- content html scoped to routed component, not app shell ------------------
const SHELL_FIXTURE = `<body><mat-toolbar>App Header</mat-toolbar>
<mat-sidenav-content><mat-sidenav><a href="/home">Home</a></mat-sidenav>
<div><router-outlet></router-outlet><section class="routed-page"><h2>Routed</h2></section></div>
</mat-sidenav-content></body>`;
const shellDom = new JSDOM(SHELL_FIXTURE, { url: 'http://localhost:4200/home' });
(globalThis as any).document = shellDom.window.document;
(globalThis as any).window = shellDom.window;
const shellHtml = runSerialized<string>(extractContentHtml);
check(
  'html scoped to routed component',
  shellHtml.includes('Routed') && !shellHtml.includes('App Header') && !shellHtml.includes('mat-sidenav'),
);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('ALL VERIFY CHECKS PASSED');
