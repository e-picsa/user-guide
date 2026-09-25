/** Discover docs pages by scanning `content/docs` for `.mdx` files. */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface PdfPage {
  /** Docs route, e.g. `/docs` or `/docs/getting-started`. */
  route: string;
  /** Output file stem, e.g. `docs` or `docs-getting-started`. */
  stem: string;
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
    return { route, stem: routeToStem(route) };
  });
}
