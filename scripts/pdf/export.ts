/**
 * Export each docs page to a per-page PDF via headless Chrome
 * (per the official Fumadocs PDF guide, adapted to this repo's
 * `puppeteer-core` + shared Chrome resolution).
 *
 * The dev server must be running with printing overrides enabled so
 * collapsible/tabbed content renders expanded:
 *
 *   terminal 1: PDF_PRINT=1 bun run dev
 *   terminal 2: bun run pdf
 *
 * Env: PDF_BASE_URL (default `http://localhost:3000`),
 * PDF_OUT_DIR (default `pdfs`), PDF_ONLY (comma filter on routes),
 * CHROME_PATH (see scripts/screenshots/config.ts).
 *
 * Run: bun run pdf
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

import { resolveChromePath } from '../screenshots/config';
import { discoverPages } from './pages';

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function main(): Promise<void> {
  const baseUrl = env('PDF_BASE_URL', 'http://localhost:3000');
  const outDir = resolve(process.cwd(), env('PDF_OUT_DIR', 'pdfs'));
  const only = (process.env.PDF_ONLY ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const all = discoverPages();
  const pages = only.length ? all.filter((p) => only.some((f) => p.route.includes(f))) : all;
  if (!pages.length) throw new Error('No docs pages found to export');

  mkdirSync(outDir, { recursive: true });
  console.log(`Exporting ${pages.length} page(s) from ${baseUrl} to ${outDir}`);

  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const { route, stem } of pages) {
      const page = await browser.newPage();
      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0', timeout: 60_000 });
        await page.pdf({
          path: join(outDir, `${stem}.pdf`),
          format: 'A4',
          printBackground: true,
        });
        console.log(`OK ${route} -> ${stem}.pdf`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
