/**
 * Serve the static export (`out/`) so `scripts/pdf/export.ts` can capture it.
 *
 * `next build` with `output: 'export'` cannot be served by `next start`, and a
 * plain file server 404s every route: the export uses clean URLs
 * (`out/climate/stations.html`), never extensionless files. This resolves
 * `/a/b` -> `a/b`, `a/b.html`, `a/b/index.html`.
 *
 * Env: PDF_SERVE_DIR (default `out`), PDF_SERVE_PORT (default `3000`),
 * PDF_SERVE_HOST (default `127.0.0.1`).
 *
 * Exits immediately if the directory holds no `index.html`, so a wrong
 * PDF_SERVE_DIR fails at start instead of looking like a hung capture.
 *
 * Run: bun scripts/pdf/serve.ts
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/** Existing file for a request path, or null. */
function resolveFile(root: string, pathname: string): string | null {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  // Reject traversal outside the export dir.
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(root + sep)) return null;

  const candidates = rel
    ? [target, `${target}.html`, resolve(target, 'index.html')]
    : [resolve(root, 'index.html')];

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/** Existing regular file, or null — `existsSync` can't tell directories from files. */
function existingFile(path: string): string | null {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

function main(): void {
  const root = resolve(process.cwd(), process.env.PDF_SERVE_DIR ?? 'out');
  const port = Number(process.env.PDF_SERVE_PORT ?? 3000);
  const host = process.env.PDF_SERVE_HOST ?? '127.0.0.1';

  // Fail loudly instead of accepting connections that 404 everything: the
  // usual cause is building the wrong directory (a custom `distDir` relocates
  // the whole `output: 'export'` directory, see next.config.mjs).
  if (!existingFile(resolve(root, 'index.html'))) {
    console.error(
      `No index.html in ${root}. Build the export first (PDF_PRINT=1 bun run build), ` +
        `or point PDF_SERVE_DIR at it.`
    );
    process.exit(1);
  }

  const notFound = existingFile(resolve(root, '404.html'));

  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', `http://${host}:${port}`);
    const file = resolveFile(root, pathname) ?? notFound;

    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      // The export is regenerated per run; never let a stale sheet be captured.
      'cache-control': 'no-store',
    });
    // Without this handler an unreadable file (race with a rebuild, vanished
    // route) throws out of the request handler and takes the whole server
    // down, so the next capture silently times out instead of failing.
    const stream = createReadStream(file);
    stream.on('error', (e) => {
      console.error(`Failed reading ${file}: ${e.message}`);
      res.destroy();
    });
    stream.pipe(res);
  });

  server.listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}`);
  });
}

if (import.meta.main) {
  main();
}
