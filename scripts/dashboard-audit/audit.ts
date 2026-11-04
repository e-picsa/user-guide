/**
 * Audit the live E-PICSA Dashboard codebase against this guide.
 *
 * Compares dashboard routes (parsed statically from the dashboard Angular
 * source) with guide coverage (content/docs MDX pages + screenshot manifest
 * PAGES) and reports:
 *
 * - ADD candidates: dashboard routes with no screenshot exemplar and/or no
 *   guide page mentioning them.
 * - REMOVE candidates: manifest entries or guide references pointing at
 *   routes that no longer exist in the dashboard.
 * - FRESHNESS insight: recent dashboard git changes mapped back to routes,
 *   so editors can see which guide pages likely need a refresh.
 *
 * The dashboard evolves continuously; this script is the cheap static gate
 * before the expensive loop (recapture screenshots, re-verify markers,
 * rebuild the PDF). Pair with `SKILL.md` in this directory for the agentic
 * workflow that acts on the report.
 *
 * Run: bun scripts/dashboard-audit/audit.ts [--dashboard <path>]
 *        [--since <git-ref>] [--commits <n>] [--json <file>]
 *        [--snapshot-out <file>] [--compare <file>] [--check]
 *
 * Env: DASHBOARD_SRC (dashboard `src/app` dir), DASHBOARD_SINCE, DASHBOARD_COMMITS
 *
 * Dashboard source resolution: explicit --dashboard / DASHBOARD_SRC first,
 * then the sibling checkouts used by this repo (`../picsa-apps/...` per
 * AGENTS.md, plus the local `e-picsa` and `.t3` worktree layouts).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { PAGES } from '../screenshots/manifest';

const GUIDE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const DOCS_DIR = join(GUIDE_ROOT, 'content/docs');

interface DashboardRoute {
  route: string;
  nav?: string;
  hidden?: boolean;
  role?: string;
  redirectTo?: string;
  component?: string;
  /** Repo-relative file that declares the component, for change mapping. */
  componentFile?: string;
  source: string;
}

interface GuidePage {
  file: string;
  title: string;
  screenshots: string[];
  routeRefs: string[];
}

/** Captures that exist outside manifest PAGES (see `screenshots/run.ts` flow). */
const EXTRA_CAPTURES = new Set(['landing']);

interface Args {
  dashboard?: string;
  since?: string;
  commits: number;
  json?: string;
  snapshotOut?: string;
  compare?: string;
  check: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { commits: 30, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--dashboard') out.dashboard = next();
    else if (a === '--since') out.since = next();
    else if (a === '--commits') out.commits = Number(next());
    else if (a === '--json') out.json = next();
    else if (a === '--snapshot-out') out.snapshotOut = next();
    else if (a === '--compare') out.compare = next();
    else if (a === '--check') out.check = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: bun scripts/dashboard-audit/audit.ts [options]');
      console.log('  --dashboard <path>   dashboard src/app dir (or DASHBOARD_SRC)');
      console.log('  --since <git-ref>      only dashboard commits after this ref');
      console.log('  --commits <n>          commits to scan (default 30)');
      console.log('  --json <file>          write machine-readable report');
      console.log('  --snapshot-out <file>  write route snapshot for later --compare');
      console.log('  --compare <file>       diff current routes against a snapshot');
      console.log('  --check                exit 1 when ADD/REMOVE candidates exist (CI gate)');
      process.exit(0);
    }
  }
  if (process.env.DASHBOARD_SINCE && !out.since) out.since = process.env.DASHBOARD_SINCE;
  if (process.env.DASHBOARD_COMMITS && !argv.includes('--commits')) {
    out.commits = Number(process.env.DASHBOARD_COMMITS) || out.commits;
  }
  return out;
}

/** Locate the dashboard `src/app` dir across known checkout layouts. */
function resolveDashboardSrc(explicit?: string): { appDir: string; repoRoot: string } {
  const env = process.env.DASHBOARD_SRC;
  const candidates = [
    explicit,
    env,
    resolve(GUIDE_ROOT, '../picsa-apps/apps/picsa-apps/dashboard/src/app'),
    resolve(GUIDE_ROOT, '../../picsa-apps/apps/picsa-apps/dashboard/src/app'),
    '/Users/chrismclarke/Apps/e-picsa/picsa-apps/apps/picsa-apps/dashboard/src/app',
    '/Users/chrismclarke/.t3/worktrees/picsa-apps/apps/picsa-apps/dashboard/src/app',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const abs = resolve(c);
    if (existsSync(join(abs, 'app.routes.ts'))) {
      let repoRoot = abs;
      try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd: abs, encoding: 'utf8' }).trim();
      } catch {
        repoRoot = abs;
      }
      return { appDir: abs, repoRoot };
    }
  }
  throw new Error(
    `Dashboard source not found. Tried: ${candidates.join(', ')}. ` +
      `Pass --dashboard <path> or set DASHBOARD_SRC to the dashboard src/app dir.`,
  );
}

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/** Split a `defineFeature({...})` object body into top-level child blocks. */
function extractChildrenBlocks(body: string): string[] {
  const blocks: string[] = [];
  const idx = body.indexOf('children');
  if (idx === -1) return blocks;
  let depth = 0;
  let current = '';
  let inChildren = false;
  for (let i = idx; i < body.length; i++) {
    const ch = body[i];
    if (ch === '[' && !inChildren) {
      inChildren = true;
      depth = 1;
      current = '';
      continue;
    }
    if (!inChildren) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (depth === 0) break;
    current += ch;
    if ((ch === '}' || ch === ')') && depth === 1) {
      // end of one child object when brace depth returns to array level
    }
  }
  // Re-split collected array body into `{ ... }` objects at depth 1.
  let objDepth = 0;
  let buf = '';
  for (const ch of current) {
    if (ch === '{') objDepth++;
    if (objDepth > 0) buf += ch;
    if (ch === '}') {
      objDepth--;
      if (objDepth === 0 && buf.trim()) {
        blocks.push(buf);
        buf = '';
      }
    }
  }
  return blocks;
}

function pick(block: string, key: string): string | undefined {
  // `path` may be intentionally empty (root list pages, redirects).
  const m = block.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]*)['"]`));
  return m?.[1];
}

function hasNavHidden(block: string): boolean {
  return /nav\s*:\s*\{[^}]*hidden\s*:\s*true/.test(block);
}

function pickImportPath(block: string): string | undefined {
  const m = block.match(/import\(['"]([^'"]+)['"]\)/);
  return m?.[1];
}

function resolveComponentFile(featureDir: string, importPath: string): string | undefined {
  if (!importPath.startsWith('.')) return undefined;
  const base = resolve(featureDir, importPath);
  for (const ext of ['.ts', '.html']) {
    if (existsSync(`${base}${ext}`)) return `${base}${ext}`;
  }
  return `${base}.ts`;
}

interface FeatureChild {
  path: string;
  nav?: string;
  hidden: boolean;
  role?: string;
  redirectTo?: string;
  componentFile?: string;
}

/** Parse one `*.routes.ts` feature file into its root path + children. */
function parseFeatureFile(file: string): { root: string; children: FeatureChild[]; featureDir: string } {
  const body = read(file);
  const featureDir = dirname(file);
  const root = pick(body, 'path') ?? '';
  const children: FeatureChild[] = [];
  for (const block of extractChildrenBlocks(body)) {
    const path = pick(block, 'path');
    if (path === undefined) continue;
    children.push({
      path,
      nav: block.match(/nav\s*:\s*\{[^}]*label\s*:\s*['"]([^'"]+)['"]/)?.[1],
      hidden: hasNavHidden(block),
      role: pick(block, 'roleRequired'),
      redirectTo: pick(block, 'redirectTo'),
      componentFile: (() => {
        const imp = pickImportPath(block);
        return imp ? resolveComponentFile(featureDir, imp) : undefined;
      })(),
    });
  }
  // Features with a direct loadComponent and no children (home, stats, map).
  if (children.length === 0) {
    const imp = pickImportPath(body);
    children.push({
      path: '',
      nav: body.match(/label\s*:\s*['"]([^'"]+)['"]/)?.[1],
      hidden: false,
      role: pick(body, 'roleRequired'),
      redirectTo: undefined,
      componentFile: imp ? resolveComponentFile(featureDir, imp) : undefined,
    });
  }
  return { root, children, featureDir };
}

const FEATURE_FILES = [
  'modules/home/home.routes.ts',
  'modules/climate/climate.routes.ts',
  'modules/crop-information/crop.routes.ts',
  'modules/deployment/deployment.routes.ts',
  'modules/resources/resources.routes.ts',
  'modules/stats/stats.routes.ts',
  'modules/translations/translations.routes.ts',
  'modules/map/map.routes.ts',
];

/** Parse `profile.module.ts` RouterModule.forChild paths (not a feature file). */
function parseProfileModule(appDir: string): DashboardRoute[] {
  const file = join(appDir, 'modules/profile/profile.module.ts');
  if (!existsSync(file)) return [];
  const body = read(file);
  const out: DashboardRoute[] = [];
  const re = /path\s*:\s*['"]([^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const sub = m[1];
    const route = sub ? `profile/${sub}` : 'profile';
    const after = body.slice(m.index, m.index + 400);
    out.push({
      route,
      component: pickImportPath(after)?.split('/').pop(),
      componentFile: (() => {
        const imp = pickImportPath(after);
        return imp ? resolveComponentFile(join(appDir, 'modules/profile'), imp) : undefined;
      })(),
      source: 'modules/profile/profile.module.ts',
    });
  }
  return out;
}

function parseDashboard(appDir: string): DashboardRoute[] {
  const routes: DashboardRoute[] = [];
  for (const rel of FEATURE_FILES) {
    const file = join(appDir, rel);
    if (!existsSync(file)) {
      console.warn(`warn: feature file missing: ${rel}`);
      continue;
    }
    const { root, children } = parseFeatureFile(file);
    for (const c of children) {
      const route = [root, c.path].filter((s) => s !== '').join('/') || root;
      routes.push({
        route,
        nav: c.nav,
        hidden: c.hidden || undefined,
        role: c.role,
        redirectTo: c.redirectTo,
        component: c.componentFile?.split('/').pop(),
        componentFile: c.componentFile,
        source: rel,
      });
    }
  }
  routes.push(...parseProfileModule(appDir));
  for (const legal of ['privacy-policy', 'terms-of-service']) {
    routes.push({ route: legal, source: 'app.routes.ts' });
  }
  // De-dupe (e.g. crop/variety/add vs variety/:id share a component on purpose).
  const seen = new Set<string>();
  return routes.filter((r) => (seen.has(r.route) ? false : (seen.add(r.route), true)));
}

/**
 * Pattern `climate/station/:stationId` matches concrete `climate/station/x`.
 * A trailing `:param` also absorbs extra segments: `crop/variety/:id`
 * matches the composite exemplar `crop/variety/zm/beans/CHAMBESHI`, whose id
 * is `country/crop/variety` in a single segment.
 */
function patternMatches(pattern: string, concrete: string): boolean {
  const p = pattern.split('/');
  const c = concrete.split('/');
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      if (i === p.length - 1) return i < c.length;
      if (c[i] === undefined) return false;
      continue;
    }
    if (p[i] !== c[i]) return false;
  }
  return p.length === c.length;
}

function listMdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listMdxFiles(p));
    else if (e.endsWith('.mdx')) out.push(p);
  }
  return out.sort();
}

const SHOT_RE = /\/screenshots\/(([A-Za-z0-9_-]+)\/([A-Za-z0-9_\-./%]+))\.png/g;
/**
 * Bare dashboard route mentions in prose. The lookbehind excludes
 * guide-internal relative links (`./climate/stations`, `../...`) and
 * already-absolute paths, so only standalone route mentions are treated as
 * dashboard references.
 */
const ROUTE_RE = /(?<![.\w/])(climate|crop|resources|translations|deployment|profile|stats|map-admin|home)\/[A-Za-z0-9_/%:.-]*/g;

function parseGuidePage(file: string): GuidePage {
  const body = read(file);
  const title = body.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? file;
  // Screenshots keep the identifier prefix (`zm-admin/climate/station`) so the
  // png can be checked on disk; route matching strips the first segment.
  const screenshots = [...body.matchAll(SHOT_RE)].map((m) => decodeURIComponent(m[1]));
  const prose = body.replace(SHOT_RE, '');
  const routeRefs = [...new Set([...prose.matchAll(ROUTE_RE)].map((m) => m[0].replace(/[.,);:]+$/, '')))];
  return { file: relative(GUIDE_ROOT, file), title, screenshots, routeRefs };
}

/** Screenshot subpath `zm-admin/climate/station` -> dashboard route `climate/station`. */
function shotToRoute(shot: string): string {
  return decodeURIComponent(shot.split('/').slice(1).join('/'));
}

interface GitChange {
  hash: string;
  date: string;
  subject: string;
  files: string[];
}

function gitChanges(repoRoot: string, appDir: string, since: string | undefined, n: number): GitChange[] {
  const relApp = relative(repoRoot, appDir);
  const range = since ? `${since}..HEAD` : `HEAD~${n}..HEAD`;
  let raw: string;
  try {
    raw =
      execSync(
        `git log --date=short --pretty=format:'@@@ %h %ad %s' --name-only ${range} -- ${relApp}`,
        { cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      );
  } catch {
    return [];
  }
  const changes: GitChange[] = [];
  let cur: GitChange | null = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@@ ')) {
      const [, hash, date, ...subj] = line.split(' ');
      cur = { hash, date, subject: subj.join(' '), files: [] };
      changes.push(cur);
    } else if (cur && line.trim()) {
      cur.files.push(line.trim());
    }
  }
  return changes;
}

/** Map a changed dashboard file back to the route(s) it likely affects. */
function filesToRoutes(routes: DashboardRoute[], repoRoot: string, files: string[]): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    const abs = resolve(repoRoot, f);
    for (const r of routes) {
      if (!r.componentFile) continue;
      // Same component directory (covers .ts/.html/.scss edits together).
      if (dirname(abs) === dirname(r.componentFile)) hits.add(r.route);
      else if (abs === r.componentFile) hits.add(r.route);
    }
    // Feature-level changes (routes/nav/guards) affect every route in the file.
    const m = f.match(/dashboard\/src\/app\/modules\/([^/]+)\//);
    if (m && /routes\.ts|module\.ts|guard/.test(f)) {
      for (const r of routes) {
        if (r.source.includes(`modules/${m[1]}/`)) hits.add(r.route);
      }
    }
  }
  return [...hits].sort();
}

interface Finding {
  kind: 'ADD' | 'REMOVE' | 'STALE_REF' | 'FRESHNESS';
  route: string;
  detail: string;
  guideFiles?: string[];
}

function audit(
  routes: DashboardRoute[],
  pages: GuidePage[],
  manifestRoutes: string[],
  changes: GitChange[],
  repoRoot: string,
): { findings: Finding[]; covered: Map<string, string[]> } {
  const findings: Finding[] = [];
  const covered = new Map<string, string[]>();

  // Invert guide coverage: dashboard route pattern -> MDX files.
  const livePatterns = routes.filter((r) => !r.redirectTo && r.route !== '**').map((r) => r.route);
  for (const pattern of livePatterns) {
    const refs: string[] = [];
    for (const p of pages) {
      const hitShot = p.screenshots.some((s) => {
        const r = shotToRoute(s);
        return patternMatches(pattern, r) || r === pattern;
      });
      const hitRef = p.routeRefs.some((ref) => patternMatches(pattern, ref) || ref === pattern);
      if (hitShot || hitRef) refs.push(p.file);
    }
    covered.set(pattern, refs);
  }

  const manifestSet = new Set(manifestRoutes);
  for (const r of routes) {
    if (r.redirectTo || r.route === '**') continue;
    const hasShot = [...manifestSet].some((m) => patternMatches(r.route, m) || m === r.route);
    const guideRefs = covered.get(r.route) ?? [];
    // Param routes share their detail page; only flag when neither the
    // pattern exemplar nor the parent list page covers them.
    if (!hasShot) {
      findings.push({
        kind: 'ADD',
        route: r.route,
        detail: `no screenshot exemplar in manifest PAGES${guideRefs.length ? '' : ' and no guide page mentions it'}`,
        guideFiles: guideRefs,
      });
    } else if (guideRefs.length === 0) {
      // Create/edit/detail routes are often described in the parent list
      // page's prose ("Add Variety…") without naming the route or embedding
      // its screenshot — point at that page so the fix is a small explicit
      // mention, not a new page.
      const parent = r.route.split('/').slice(0, -1).join('/');
      const parentRefs = parent ? (covered.get(parent) ?? []) : [];
      findings.push({
        kind: 'ADD',
        route: r.route,
        detail:
          parentRefs.length > 0
            ? `has screenshot but no explicit route reference — likely described in ${parentRefs.join(', ')} (covers \`${parent}\`); add an explicit mention or embed the editor screenshot`
            : 'has screenshot but no guide page references it — consider documenting or marking intentionally undocumented',
        guideFiles: parentRefs,
      });
    }
  }

  // REMOVE candidates: manifest entries for routes that no longer exist.
  for (const m of manifestSet) {
    const known = livePatterns.some((p) => patternMatches(p, m) || p === m);
    if (!known) {
      findings.push({ kind: 'REMOVE', route: m, detail: 'manifest PAGES entry has no matching dashboard route — route may have been removed' });
    }
  }

  // STALE_REF: guide prose/screenshots pointing at dead routes or missing files.
  const knownRef = (ref: string): boolean =>
    EXTRA_CAPTURES.has(ref) ||
    livePatterns.some((pt) => patternMatches(pt, ref) || pt === ref) ||
    manifestRoutes.some((m) => m === ref || patternMatches(m, ref));
  for (const p of pages) {
    for (const ref of p.routeRefs) {
      if (!knownRef(ref)) {
        findings.push({ kind: 'STALE_REF', route: ref, detail: `referenced by ${p.file} but no dashboard route matches`, guideFiles: [p.file] });
      }
    }
    for (const shot of p.screenshots) {
      const ref = shotToRoute(shot);
      if (!knownRef(ref)) {
        findings.push({ kind: 'STALE_REF', route: ref, detail: `screenshot in ${p.file} matches no dashboard route or manifest exemplar`, guideFiles: [p.file] });
      }
      const diskPath = join(GUIDE_ROOT, 'public/screenshots', `${shot}.png`);
      if (!existsSync(diskPath)) {
        findings.push({ kind: 'STALE_REF', route: ref, detail: `screenshot in ${p.file} has no png on disk (${relative(GUIDE_ROOT, diskPath)} missing — recapture needed)`, guideFiles: [p.file] });
      }
    }
  }

  // FRESHNESS: recent dashboard commits mapped to routes -> guide files.
  const seenFresh = new Set<string>();
  for (const c of changes) {
    const affected = filesToRoutes(routes, repoRoot, c.files);
    if (affected.length === 0) continue;
    for (const route of affected) {
      const key = `${c.hash}:${route}`;
      if (seenFresh.has(key)) continue;
      seenFresh.add(key);
      const guideFiles = covered.get(route) ?? [];
      findings.push({
        kind: 'FRESHNESS',
        route,
        detail: `${c.date} ${c.hash} ${c.subject} — ${c.files.length} file(s); check ${guideFiles.length ? guideFiles.join(', ') : 'whether a guide page is needed'}`,
        guideFiles,
      });
    }
  }
  return { findings, covered };
}

function toMarkdown(
  routes: DashboardRoute[],
  manifestRoutes: string[],
  pages: GuidePage[],
  findings: Finding[],
  changes: GitChange[],
  dashboardLabel: string,
): string {
  const by = (k: Finding['kind']) => findings.filter((f) => f.kind === k);
  const lines: string[] = [];
  lines.push('# Dashboard audit');
  lines.push('');
  lines.push(`- Dashboard source: \`${dashboardLabel}\``);
  lines.push(`- Dashboard routes: ${routes.length} (${routes.filter((r) => r.redirectTo).length} redirects)`);
  lines.push(`- Manifest exemplars: ${manifestRoutes.length}`);
  lines.push(`- Guide pages: ${pages.length}`);
  lines.push(`- Recent dashboard commits scanned: ${changes.length}`);
  lines.push('');
  const add = by('ADD');
  const remove = by('REMOVE');
  const stale = by('STALE_REF');
  const fresh = by('FRESHNESS');
  lines.push(`## ADD candidates (${add.length}) — dashboard pages with no guide coverage`);
  lines.push('');
  if (!add.length) lines.push('None. Every live route has a screenshot exemplar and a guide mention.');
  for (const f of add) lines.push(`- \`${f.route}\` — ${f.detail}`);
  lines.push('');
  lines.push(`## REMOVE candidates (${remove.length}) — captures for routes that no longer exist`);
  lines.push('');
  if (!remove.length) lines.push('None. Every manifest entry matches a live dashboard route.');
  for (const f of remove) lines.push(`- \`${f.route}\` — ${f.detail}`);
  lines.push('');
  lines.push(`## Stale references (${stale.length}) — guide mentions of unknown routes`);
  lines.push('');
  if (!stale.length) lines.push('None.');
  for (const f of stale) lines.push(`- \`${f.route}\` — ${f.detail}`);
  lines.push('');
  lines.push(`## Freshness (${fresh.length}) — recent dashboard changes by route`);
  lines.push('');
  if (!fresh.length) {
    lines.push('No recent dashboard commits mapped to a route. The guide is probably current — or the dashboard checkout is stale.');
  } else {
    // Collapse per route, newest first (git log order is newest first).
    const perRoute = new Map<string, Finding[]>();
    for (const f of fresh) perRoute.set(f.route, [...(perRoute.get(f.route) ?? []), f]);
    for (const [route, fs] of [...perRoute.entries()].sort()) {
      lines.push(`### \`${route}\``);
      // Guide page for this route, if any.
      for (const f of fs.slice(0, 5)) lines.push(`- ${f.detail}`);
      if (fs.length > 5) lines.push(`- …and ${fs.length - 5} more commit(s)`);
      lines.push('');
    }
  }
  lines.push('## All dashboard routes');
  lines.push('');
  lines.push('| route | nav | role | screenshot | guide |');
  lines.push('| --- | --- | --- | --- | --- |');
  return lines.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const { appDir, repoRoot } = resolveDashboardSrc(args.dashboard);
  const routes = parseDashboard(appDir);
  const manifestRoutes = PAGES.map((p) => p.route);
  const pages = listMdxFiles(DOCS_DIR).map(parseGuidePage);
  const changes = gitChanges(repoRoot, appDir, args.since, args.commits);
  const { findings } = audit(routes, pages, manifestRoutes, changes, repoRoot);

  if (args.snapshotOut) {
    const snap = {
      capturedAt: new Date().toISOString(),
      dashboard: appDir,
      routes: routes.map((r) => ({ route: r.route, role: r.role ?? null, component: r.component ?? null, source: r.source })),
    };
    writeFileSync(resolve(args.snapshotOut), `${JSON.stringify(snap, null, 2)}\n`);
    console.log(`snapshot written: ${args.snapshotOut}`);
  }
  if (args.compare) {
    const snap = JSON.parse(readFileSync(resolve(args.compare), 'utf8')) as { routes: { route: string }[] };
    const before = new Set(snap.routes.map((r) => r.route));
    const now = new Set(routes.map((r) => r.route));
    const added = [...now].filter((r) => !before.has(r));
    const removed = [...before].filter((r) => !now.has(r));
    console.log(`\n# Snapshot diff vs ${args.compare}`);
    console.log(`added (${added.length}): ${added.map((r) => `\`${r}\``).join(', ') || '—'}`);
    console.log(`removed (${removed.length}): ${removed.map((r) => `\`${r}\``).join(', ') || '—'}`);
  }

  const md = toMarkdown(routes, manifestRoutes, pages, findings, changes, appDir);
  // Append the route table rows after the header (built last so findings read first).
  const rows = routes.map((r) => {
    if (r.redirectTo) return `| \`${r.route}\` | → ${r.redirectTo} | ${r.role ?? ''} | n/a (redirect) | n/a (redirect) |`;
    const shot = manifestRoutes.some((m) => patternMatches(r.route, m) || m === r.route) ? 'yes' : 'NO';
    const guideHit = pages.some((p) =>
      p.routeRefs.some((ref) => patternMatches(r.route, ref) || ref === r.route) ||
      p.screenshots.some((s) => {
        const sr = shotToRoute(s);
        return patternMatches(r.route, sr) || sr === r.route;
      }),
    )
      ? 'yes'
      : 'NO';
    const nav = r.redirectTo ? `→ ${r.redirectTo}` : (r.nav ?? (r.hidden ? '(hidden)' : ''));
    return `| \`${r.route}\` | ${nav} | ${r.role ?? ''} | ${shot} | ${guideHit} |`;
  });
  console.log(`${md}\n${rows.join('\n')}`);

  if (args.json) {
    writeFileSync(
      resolve(args.json),
      `${JSON.stringify({ dashboard: appDir, routes, manifestRoutes, pages, findings, changes }, null, 2)}\n`,
    );
    console.error(`report written: ${args.json}`);
  }

  const blockers = findings.filter((f) => f.kind === 'ADD' || f.kind === 'REMOVE').length;
  if (args.check && blockers > 0) {
    console.error(`\ncheck failed: ${blockers} ADD/REMOVE candidate(s). See report above.`);
    process.exit(1);
  }
}

main();
