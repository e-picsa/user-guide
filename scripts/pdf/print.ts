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

/**
 * Resolve once every <img> has loaded or failed. The cover embeds its
 * screenshot as a data URI, which decodes asynchronously — measuring before
 * that reports a height that excludes the image and clips it.
 */
export async function awaitImages(page: Page): Promise<void> {
  await page
    .evaluate(() =>
      Promise.all(
        [...document.images].map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener('load', r, { once: true });
                img.addEventListener('error', r, { once: true });
              }),
        ),
      ),
    )
    .catch(() => undefined);
}

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
 * Resolve once every <video> has at least metadata. A video with no metadata
 * has no intrinsic size, so measuring before it loads under-reports height and
 * the sheet clips.
 */
export async function awaitMedia(page: Page): Promise<void> {
  await page
    .evaluate(() =>
      Promise.all(
        [...document.querySelectorAll('video')].map(
          (v) =>
            (v as HTMLVideoElement).readyState >= 1
              ? null
              : new Promise((r) => {
                  v.addEventListener('loadedmetadata', r, { once: true });
                  v.addEventListener('error', r, { once: true });
                }),
        ),
      ),
    )
    .catch(() => undefined);
}

/**
 * Scroll through the page so lazily-loaded images expand, then wait for that
 * content to land and measure until the height is stable. Without this the
 * measurement lags behind the printed height and content spills onto a second
 * sheet.
 *
 * Stability is checked by re-confirming the media above rather than by a fixed
 * delay: with pages captured concurrently, a time-based guess loses the race
 * and silently returns a short sheet that clips content.
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
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => undefined);

  let height = 0;
  for (let i = 0; i < 20; i++) {
    await awaitImages(page);
    await awaitMedia(page);
    const next = await measureHeight(page);
    // Two consecutive identical measures means the lazy content has landed.
    if (next === height) return height;
    height = next;
    await sleep(500);
  }
  return height;
}

/** Fraction of headroom added to the measured height on the first attempt. */
const HEADROOM = 1.04;
/** Smallest headroom, for very short sheets where 4% is sub-pixel. */
const MIN_HEADROOM_PX = 24;

export interface SheetResult {
  buffer: Buffer;
  height: number;
  pages: number;
}

/**
 * Render the current page as a single continuous sheet, growing the height
 * and retrying while content still spills. `settle` scrolls lazy content in
 * first (needed for article pages, pointless for generated front sheets).
 *
 * Screen measurement sits within a hair of print layout height, so the first
 * attempt already carries a little headroom: without it, a sub-pixel
 * overflow paginates a second sheet and the retry has to guess, which
 * overshoots badly and leaves the sheet mostly empty.
 */
export async function renderTallSheet(
  page: Page,
  opts: { settle?: boolean; label?: string } = {},
): Promise<SheetResult> {
  const measured = Math.ceil(
    opts.settle === false
      ? (await awaitImages(page), await measureHeight(page))
      : await settleAndMeasure(page),
  );
  let height = Math.ceil(measured * HEADROOM) + MIN_HEADROOM_PX;
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
    // Grow gently: the overshoot was almost never a full extra page's worth.
    const grown = Math.ceil(Math.max(height * 1.15, height + 400));
    console.warn(
      `${opts.label ?? 'sheet'} spilled onto ${doc.getPageCount()} sheets at ${height}px, growing to ${grown}px`,
    );
    height = grown;
  }
  throw new Error(
    `${opts.label ?? 'sheet'} could not be fitted to a single sheet after 4 attempts (last height ${height}px)`,
  );
}
