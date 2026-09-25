/**
 * Export each docs page to a per-page PDF via headless Chrome
 * (per the official Fumadocs PDF guide, adapted to this repo's
 * `puppeteer-core` + shared Chrome resolution).
 *
 * The server must be running with printing overrides enabled so
 * collapsible/tabbed content renders expanded:
 *
 *   terminal 1: PDF_PRINT=1 bun run start
 *   terminal 2: bun run pdf
 *
 * Each page becomes one continuous sheet (see print.ts) — these PDFs are for
 * on-screen reading, nobody prints them. They are scratch input for the
 * combine step (see combine.ts), not a deliverable, so they live in their own
 * directory away from the published guide.
 *
 * Env: PDF_BASE_URL (default `http://localhost:3000`),
 * PDF_PAGES_DIR (default `pdfs/pages`), PDF_ONLY (comma filter on route
 * prefixes, e.g. `PDF_ONLY=climate,getting-started/signing-in`),
 * PDF_CONCURRENCY (pages captured in parallel, default 3),
 * CHROME_PATH (see scripts/screenshots/config.ts).
 *
 * Run: bun run pdf
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

import { resolveChromePath } from '../screenshots/config';
import { discoverPages } from './pages';
import { renderTallSheet, SHEET_VIEWPORT } from './print';

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

/** Wait for the docs server to answer, so a just-started server isn't a race. */
async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) {
        await res.arrayBuffer();
        return;
      }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Delete per-page PDFs left behind by a previous run, so a page renamed or
 * removed from `content/docs` can't linger and be merged into the guide as an
 * orphan (combine.ts only warns about those).
 *
 * Unlinks the matching files rather than removing the directory: this dir is
 * caller-supplied via `PDF_PAGES_DIR`, so the widest possible blast radius is
 * the `*.pdf` files in it and nothing else.
 */
function clearStalePages(dir: string): number {
  const stale = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
  for (const f of stale) rmSync(join(dir, f), { force: true });
  return stale.length;
}

async function main(): Promise<void> {
  const baseUrl = env('PDF_BASE_URL', 'http://localhost:3000');
  const pagesDir = resolve(process.cwd(), env('PDF_PAGES_DIR', 'pdfs/pages'));
  const all = discoverPages();
  // Match on whole route segments, not raw substrings: routes sit at the site
  // root (`/climate`), so a substring filter would also catch unrelated pages
  // (`/resources/files` matching a filter of `files` is intended, but `climate`
  // must not match a hypothetical `/x/climate/...`, nor vice versa).
  const only = (process.env.PDF_ONLY ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  const pages = only.length
    ? all.filter((p) => {
        const segments = p.route.split('/').filter(Boolean);
        return only.some((f) => {
          const want = f.split('/').filter(Boolean);
          return (
            want.length > 0 &&
            want.length <= segments.length &&
            want.every((seg, i) => segments[i] === seg)
          );
        });
      })
    : all;
  if (!pages.length) throw new Error('No docs pages found to export');

  mkdirSync(pagesDir, { recursive: true });
  // Only a full run makes every existing file stale; a `PDF_ONLY` run
  // re-exports a subset and must leave the rest of the current output alone.
  if (!only.length) {
    const removed = clearStalePages(pagesDir);
    if (removed) console.log(`Removed ${removed} stale per-page PDF(s) from a previous run`);
  }
  await waitForServer(baseUrl);
  console.log(`Exporting ${pages.length} page(s) from ${baseUrl} to ${pagesDir}`);

  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    // Pages are captured concurrently: rendering is the slowest phase and each
    // page is independent, so a small pool cuts the wall clock roughly in
    // half. Keep it modest — a full-height sheet is a large buffer per page.
    const concurrency = Math.max(1, Number(env('PDF_CONCURRENCY', '3')));
    let next = 0;
    const worker = async (): Promise<void> => {
      for (let i = next++; i < pages.length; i = next++) {
        const { route, stem } = pages[i];
        const page = await browser.newPage();
        // Viewport width matches the sheet width so the measured content height
        // is accurate.
        await page.setViewport(SHEET_VIEWPORT);
        try {
          await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0', timeout: 60_000 });
          const { buffer, height } = await renderTallSheet(page, { label: route });
          writeFileSync(join(pagesDir, `${stem}.pdf`), buffer);
          console.log(`OK ${route} -> ${stem}.pdf (${height}px tall)`);
        } finally {
          await page.close();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, worker));
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
