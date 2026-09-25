/**
 * Discover docs pages by walking `content/docs`, honouring the same
 * `meta.json` page ordering the website sidebar uses, so the PDF reads in the
 * same order and grouping as the site.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { docsRoute } from '../../src/lib/shared';

export interface PdfPage {
  /** Docs route, e.g. `/` or `/getting-started`. */
  route: string;
  /** Output file stem, e.g. `index` or `getting-started`. */
  stem: string;
  /** Frontmatter `title`, falling back to a humanised file name. */
  title: string;
  /** Enclosing folder title from `meta.json`, e.g. `Getting started`. */
  section?: string;
  /** Enclosing folder slug, e.g. `getting-started`. Undefined at the root. */
  sectionSlug?: string;
}


interface DirMeta {
  title?: string;
  pages?: string[];
}

function readMeta(dir: string): DirMeta | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as DirMeta;
  } catch {
    return undefined;
  }
}

/** Content children of a folder, ignoring metadata and partials. */
function children(dir: string): string[] {
  return readdirSync(dir).filter(
    (name) => name !== 'meta.json' && !name.startsWith('_') && !name.startsWith('.'),
  );
}

/**
 * Order a folder's children the way the page tree does: entries named in
 * `meta.json`'s `pages` in order, with `...` standing in for "everything
 * else" (sorted), and unlisted children appended last (sorted).
 *
 * `pages` lists slugs, so match them against children by slug rather than by
 * filename — comparing raw names would silently match nothing and fall back
 * to alphabetical.
 */
function orderedChildren(dir: string, meta?: DirMeta): string[] {
  const all = children(dir);
  const byslug = new Map(all.map((name) => [name.replace(/\.mdx$/, ''), name]));
  const remaining = new Set(all);
  const out: string[] = [];
  for (const slug of meta?.pages ?? []) {
    if (slug === '...') {
      for (const name of [...remaining].sort()) {
        out.push(name);
        remaining.delete(name);
      }
      continue;
    }
    const name = byslug.get(slug);
    // Slugs with no matching file are skipped, as the page tree does.
    if (name && remaining.has(name)) {
      out.push(name);
      remaining.delete(name);
    }
  }
  for (const name of [...remaining].sort()) out.push(name);
  return out;
}

/** Walk a folder in page-tree order, tagging pages with their section. */
function walk(dir: string, contentRoot: string, section?: { title: string; slug: string }): PdfPage[] {
  const pages: PdfPage[] = [];
  for (const name of orderedChildren(dir, readMeta(dir))) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const meta = readMeta(full);
      pages.push(...walk(full, contentRoot, { title: meta?.title ?? name, slug: name }));
    } else if (name.endsWith('.mdx')) {
      const route = fileToRoute(contentRoot, full);
      pages.push({
        route,
        stem: routeToStem(route),
        title: readTitle(full, name),
        ...(section ? { section: section.title, sectionSlug: section.slug } : {}),
      });
    }
  }
  return pages;
}

/**
 * Map a content file to its docs route. `index.mdx` maps to the folder route,
 * e.g. `index.mdx` -> `/`, `foo/index.mdx` -> `/foo`, `foo/bar.mdx` -> `/foo/bar`.
 *
 * Built from the same `docsRoute` the site uses, so the two can't drift.
 */
export function fileToRoute(contentRoot: string, file: string): string {
  const rel = relative(contentRoot, file)
    .replace(/\.mdx$/, '')
    .split(sep)
    .join('/');
  const parts = rel.split('/').filter((p) => p !== 'index');
  // Trailing slashes go, so `docsRoute` of `/` yields an empty prefix (the
  // guide root) and `/docs` would yield `/docs`.
  const base = docsRoute.replace(/\/+$/, '');
  return `${base}${parts.length ? `/${parts.join('/')}` : ''}`;
}

/**
 * Route `/a/b` -> stem `a-b`. The guide index has the route `/`, whose stem
 * would otherwise be empty — and an empty stem writes `.pdf`, which
 * `combine.ts` cannot load.
 */
export function routeToStem(route: string): string {
  return route.replace(/^\//, '').replaceAll('/', '-') || 'index';
}

export function discoverPages(contentDir = 'content/docs'): PdfPage[] {
  const root = resolve(process.cwd(), contentDir);
  return walk(root, root);
}

/** Frontmatter `title:`, falling back to a humanised file name. */
function readTitle(file: string, fileName: string): string {
  try {
    const raw = readFileSync(file, 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const title = frontmatter?.[1].match(/^title:\s*(.+?)\s*$/m)?.[1];
    if (title) return title.replace(/^['"]|['"]$/g, '');
  } catch {
    // fall through to the file-name fallback
  }
  const base = fileName.replace(/\.mdx$/, '');
  const words = (base === 'index' ? 'overview' : base).replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
