/**
 * Shared single-sheet PDF rendering for the pdf scripts.
 *
 * A sheet is printed at an explicit height instead of a fixed paper size so
 * a scrolling article becomes one continuous page (no pagination, no gaps
 * mid-content). Screen measurement under-reports print layout height, so
 * every render is verified and grown until it genuinely fits one sheet.
 */
import { PDFDocument } from 'pdf-lib';
import type { Page } from 'puppeteer-core';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A4 width, so the sheet width and the measuring viewport agree. */
export const SHEET_WIDTH = '8.27in';
export const SHEET_VIEWPORT = { width: 794, height: 600 };

export async function measureHeight(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
      ) + 2,
  );
}

/**
 * Scroll through the page so lazily-loaded images expand, then measure until
 * the height is stable. Without this the measurement lags behind the printed
 * height and content spills onto a second sheet.
 */
export async function settleAndMeasure(page: Page): Promise<number> {
  await page.evaluate(async () => {
    const step = Math.max(1, Math.floor(document.documentElement.scrollHeight / 10));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
  let height = await measureHeight(page);
  for (let i = 0; i < 5; i++) {
    await sleep(500);
    const next = await measureHeight(page);
    if (next <= height) return height;
    height = next;
  }
  return height;
}

export interface SheetResult {
  buffer: Buffer;
  height: number;
  pages: number;
}

/**
 * Render the current page as a single continuous sheet, growing the height
 * and retrying while content still spills. `settle` scrolls lazy content in
 * first (needed for article pages, pointless for generated front sheets).
 */
export async function renderTallSheet(
  page: Page,
  opts: { settle?: boolean; label?: string } = {},
): Promise<SheetResult> {
  let height = Math.ceil(opts.settle === false ? await measureHeight(page) : await settleAndMeasure(page));
  for (let attempt = 0; attempt < 4; attempt++) {
    const pdf = await page.pdf({
      width: SHEET_WIDTH,
      height: `${height}px`,
      printBackground: true,
    });
    const doc = await PDFDocument.load(pdf);
    if (doc.getPageCount() === 1) {
      return { buffer: Buffer.from(pdf), height, pages: 1 };
    }
    const grown = Math.ceil(height * doc.getPageCount() * 1.05);
    console.warn(
      `${opts.label ?? 'sheet'} spilled onto ${doc.getPageCount()} sheets at ${height}px, growing to ${grown}px`,
    );
    height = grown;
  }
  throw new Error(
    `${opts.label ?? 'sheet'} could not be fitted to a single sheet after 4 attempts (last height ${height}px)`,
  );
}
