/**
 * Check internal links and images in the static export (`out/`).
 *
 * Reads the built pages rather than the MDX, so it sees what readers get:
 * sidebar links, `<Card>` hrefs and `createRelativeLink` output included. Run
 * `bun run build` first. External links are skipped.
 *
 * The prerender only bakes in the default country's screenshots, so each
 * `<Screenshot name>` is also checked against every country's capture folder.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { COUNTRIES } from '../../src/lib/countries';

const OUT = 'out';
const CONTENT = 'content/docs';

/** Staged into `public/` by deploy.yml, so it is absent from a plain build. */
const DEPLOY_ONLY = new Set(['/picsa-dashboard-guide.pdf']);

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, ext);
    return path.endsWith(ext) ? [path] : [];
  });
}

/** The exported file serving a URL path, using the export's clean URLs. */
function resolveFile(path: string): string | undefined {
  const clean = path.replace(/\/$/, '');
  return [join(OUT, clean), `${join(OUT, clean)}.html`, join(OUT, clean, 'index.html')].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );
}

if (!existsSync(OUT)) {
  console.error(`links: ${OUT}/ not found. Run \`bun run build\` first.`);
  process.exit(1);
}

const documents = new Map<string, Document>();
function parse(file: string): Document {
  let document = documents.get(file);
  if (!document) {
    document = new JSDOM(readFileSync(file, 'utf8')).window.document;
    documents.set(file, document);
  }
  return document;
}

const failures = new Set<string>();
// Screenshot sidecars are copies of dashboard pages, not guide pages.
const pages = walk(OUT, '.html').filter((file) => !file.startsWith(join(OUT, 'screenshots')));

for (const file of pages) {
  const page = `/${relative(OUT, file).replace(/(index)?\.html$/, '')}`;
  const document = parse(file);
  const targets = [
    ...[...document.querySelectorAll('a[href]')].map((el) => el.getAttribute('href') ?? ''),
    ...[...document.querySelectorAll('img[src]')].map((el) => el.getAttribute('src') ?? ''),
  ];

  for (const target of targets) {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) continue;

    const url = new URL(target, `http://guide.local${page}`);
    const path = decodeURIComponent(url.pathname);
    if (DEPLOY_ONLY.has(path)) continue;

    const resolved = resolveFile(path);
    if (!resolved) {
      failures.add(`${file}: missing ${target}`);
      continue;
    }

    const id = decodeURIComponent(url.hash.slice(1));
    if (id && resolved.endsWith('.html') && !parse(resolved).getElementById(id)) {
      failures.add(`${file}: missing anchor ${target}`);
    }
  }
}

const mdxFiles = walk(CONTENT, '.mdx');
for (const file of mdxFiles) {
  const source = readFileSync(file, 'utf8');
  for (const [, name] of source.matchAll(/<Screenshot\b[^>]*?\bname="([^"]+)"/g)) {
    for (const { shotsId } of COUNTRIES) {
      const image = join('public/screenshots', shotsId, name);
      if (!existsSync(image)) failures.add(`${file}: missing ${image}`);
    }
  }
}

if (failures.size > 0) {
  console.error([...failures].sort().join('\n'));
  console.error(`\nlinks: ${failures.size} problem(s)`);
  process.exit(1);
}

console.log(`links: checked ${pages.length} pages and ${mdxFiles.length} guide sources, no problems`);
