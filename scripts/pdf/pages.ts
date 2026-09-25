/** Discover docs pages by scanning `content/docs` for `.mdx` files. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface PdfPage {
  /** Docs route, e.g. `/docs` or `/docs/getting-started`. */
  route: string;
  /** Output file stem, e.g. `docs` or `docs-getting-started`. */
  stem: string;
  /** Frontmatter `title`, falling back to the stem. */
  title: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (name.endsWith('.mdx') && !name.startsWith('_')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Map a content file to its docs route. `index.mdx` maps to the folder route,
 * e.g. `index.mdx` -> `/docs`, `foo/index.mdx` -> `/docs/foo`,
 * `foo/bar.mdx` -> `/docs/foo/bar`.
 */
export function fileToRoute(contentRoot: string, file: string): string {
  const rel = relative(contentRoot, file)
    .replace(/\.mdx$/, '')
    .split(sep)
    .join('/');
  const parts = rel.split('/').filter((p) => p !== 'index');
  return `/docs${parts.length ? `/${parts.join('/')}` : ''}`;
}

/** Route `/docs/a/b` -> stem `docs-a-b`. */
export function routeToStem(route: string): string {
  return route.replace(/^\//, '').replaceAll('/', '-');
}

export function discoverPages(contentDir = 'content/docs'): PdfPage[] {
  const root = resolve(process.cwd(), contentDir);
  return walk(root).map((file) => {
    const route = fileToRoute(root, file);
    return { route, stem: routeToStem(route), title: readTitle(file) };
  });
}

/** Frontmatter `title:` value, falling back to the file's route stem. */
function readTitle(file: string): string {
  try {
    const raw = readFileSync(file, 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const title = frontmatter?.[1].match(/^title:\s*(.+?)\s*$/m)?.[1];
    if (title) return title.replace(/^['"]|['"]$/g, '');
  } catch {
    // fall through to stem fallback
  }
  return routeToStem(fileToRoute(resolve(process.cwd(), 'content/docs'), file));
}
