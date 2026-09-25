/**
 * Merge the per-page PDFs from `bun run pdf` into a single combined guide.
 * Pages can be omitted or reordered via `scripts/pdf/pdf.config.ts`.
 *
 * A cover sheet and a contents page (with exact page numbers derived from the
 * real page counts of every section) are rendered via headless Chrome and
 * prepended. Contents rows are linked to their sections, and document
 * properties are set on the combined guide.
 *
 * Env: PDF_PAGES_DIR (default `pdfs/pages`, must match the export step).
 *
 * Run: bun run pdf (runs export + combine)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import puppeteer from 'puppeteer-core';

import { resolveChromePath } from '../screenshots/config';
import { discoverPages } from './pages';
import { pdfCombineConfig } from './pdf.config';
import { contentsHtml, CONTENTS_ROW_SELECTOR, coverHtml, type ContentsEntry } from './sheets';
import { renderTallSheet, SHEET_VIEWPORT } from './print';

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function repoVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Dashboard build the screenshots were captured from, read from the capture
 * manifests in `public/screenshots/<id>/manifest.json` (captures are
 * version-keyed, see `scripts/screenshots/run.ts`).
 *
 * This is the build the screenshots came from, not necessarily a released
 * dashboard tag — the guide says so on the cover so nobody reads it as "this
 * guide is for dashboard X" when X was still in development.
 */
function screenshotBuild(): string | undefined {
  const dir = resolve(process.cwd(), 'public/screenshots');
  if (!existsSync(dir)) return undefined;

  const versions = new Set<string>();
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'manifest.json');
    if (!existsSync(file)) continue;
    try {
      const { dashboardVersion } = JSON.parse(readFileSync(file, 'utf8')) as {
        dashboardVersion?: string;
      };
      if (dashboardVersion) versions.add(dashboardVersion);
    } catch {
      // An unreadable manifest shouldn't fail the guide; the build is a note.
    }
  }

  if (!versions.size) return undefined;
  if (versions.size > 1) {
    console.warn(`screenshots span multiple dashboard builds: ${[...versions].sort().join(', ')}`);
  }
  return [...versions].sort().join(', ');
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/**
 * Load the cover screenshot as a data URI. Embedding beats a file:// URL
 * because `setContent` has no base URL to resolve against. A missing file is
 * a warning, not a failure — the guide must still build before
 * `bun run shots:zm-admin` has ever run.
 */
function loadCoverScreenshot(path?: string, alt?: string): { dataUri: string; alt: string } | undefined {
  if (!path) return undefined;
  const file = resolve(process.cwd(), path);
  const type = MIME[extname(file).toLowerCase()];
  if (!type) {
    console.warn(`cover screenshot: unsupported image type for ${path}, skipping`);
    return undefined;
  }
  if (!existsSync(file)) {
    console.warn(`cover screenshot not found: ${path} (run the screenshot capture first), skipping`);
    return undefined;
  }
  return { dataUri: `data:${type};base64,${readFileSync(file).toString('base64')}`, alt: alt ?? '' };
}

/**
 * Make each contents row a clickable link to its section.
 *
 * pdf-lib has no API for link annotations, so the annotation dictionaries are
 * built directly. Each row carries its target page in `data-page`, so the
 * link follows the rendered row rather than assuming rows and entries line up
 * one-to-one. Rectangles come from the rendered layout in CSS px, which convert
 * to points at 72/96 dpi, flipped about the page's vertical centre because PDF
 * user space puts the origin at the bottom-left.
 */
function linkContentsRows(
  merged: PDFDocument,
  contentsPageIndex: number,
  rects: RowRect[] | undefined,
  sheetHeightPx: number,
): number {
  if (!rects?.length) return 0;
  const contentsPage = merged.getPage(contentsPageIndex);
  const annots: ReturnType<PDFDocument['context']['register']>[] = [];

  for (const r of rects) {
    // r.page is a 1-based printed page number = 0-based index + 1.
    const target = merged.getPage(r.page - 1);
    if (!target) continue;
    const toPt = (px: number) => Number((px * 0.75).toFixed(2));
    const x1 = toPt(r.left);
    const x2 = toPt(r.left + r.width);
    const yTop = toPt(sheetHeightPx - r.top);
    const yBottom = toPt(sheetHeightPx - (r.top + r.height));
    const dict = merged.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      // No visible border: the row already reads as a link.
      Border: [0, 0, 0],
      Rect: [x1, yBottom, x2, yTop],
      // Jump to the top of the target page.
      Dest: [target.ref, PDFName.of('XYZ'), null, null, null],
      F: 4,
    });
    annots.push(merged.context.register(dict));
  }

  if (annots.length) {
    contentsPage.node.set(PDFName.of('Annots'), merged.context.obj(annots));
  }
  return annots.length;
}

/** A contents row's target page and position on the rendered sheet, in CSS px. */
interface RowRect {
  /** 1-based printed page number this row links to. */
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RenderedSheet {
  buffer: Buffer;
  /** Rendered height in CSS px; absent for fixed-size sheets. */
  height?: number;
  /** Bounding boxes of `rowSelector` matches, in CSS px. */
  rects?: RowRect[];
}

/**
 * Render an HTML string to a PDF buffer, sized to its content (one
 * continuous sheet, growing if the screen measurement under-reports print
 * height). When `rowSelector` is given, the laid-out position of each match
 * is returned so link annotations can be attached afterwards.
 */
async function renderSheet(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  html: string,
  opts: { label: string; rowSelector?: string },
): Promise<RenderedSheet> {
  const page = await browser.newPage();
  try {
    await page.setViewport(SHEET_VIEWPORT);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // Measure after layout, in the same DOM the print pass renders from.
    const rects = opts.rowSelector
      ? await page.evaluate((sel) => {
          return [...document.querySelectorAll(sel)].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              page: Number((el as HTMLElement).dataset.page ?? 0),
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
            };
          });
        }, opts.rowSelector)
      : undefined;
    const { buffer, height } = await renderTallSheet(page, { settle: false, label: opts.label });
    return { buffer, height, rects };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const pagesDir = resolve(process.cwd(), env('PDF_PAGES_DIR', 'pdfs/pages'));
  if (!existsSync(pagesDir)) {
    throw new Error(`No per-page PDFs found in ${pagesDir}. Run \`bun run pdf\` first.`);
  }
  const { omit = [], order = [], outFile, cover, metadata } = pdfCombineConfig;
  const outPath = resolve(process.cwd(), outFile);
  // Never merge the combined output (or sheet scratch files) back into itself.
  // The pages dir is separate from `outFile` by default, so this only bites if
  // `PDF_PAGES_DIR` has been pointed at the combined file's own directory.
  const outStem =
    dirname(outPath) === pagesDir ? basename(outPath).slice(0, -'.pdf'.length) : null;
  const onDisk = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => f.slice(0, -'.pdf'.length))
    .filter((s) => s !== outStem && !s.startsWith('_'));

  // Page-tree order (from `meta.json`) rather than filename order, so the PDF
  // matches the website sidebar. Files with no matching docs page are appended
  // so a stray PDF is never silently dropped from the guide.
  const allPages = discoverPages();
  const catalog = new Map(allPages.map((p) => [p.stem, p]));
  const treeStems = allPages.filter((p) => onDisk.includes(p.stem)).map((p) => p.stem);
  const orphans = onDisk.filter((s) => !catalog.has(s));
  if (orphans.length) console.warn(`PDFs with no matching docs page, appended last: ${orphans.join(', ')}`);

  const omitted = new Set(omit);
  const unknownOmit = [...omitted].filter((s) => !onDisk.includes(s));
  if (unknownOmit.length) console.warn(`omit entries with no matching PDF: ${unknownOmit.join(', ')}`);
  const included = new Set([...treeStems, ...orphans].filter((s) => !omitted.has(s)));
  // `order` still pins stems to the front, e.g. to lead with a summary page.
  const ordered = [
    ...order.filter((s) => included.has(s)),
    ...[...treeStems, ...orphans].filter((s) => included.has(s) && !order.includes(s)),
  ];
  if (!ordered.length) throw new Error('Nothing to combine: all per-page PDFs are omitted');

  const titleFor = (stem: string): string => catalog.get(stem)?.title ?? stem;
  const sectionFor = (stem: string): string | undefined => catalog.get(stem)?.section;

  // Load doc PDFs first so contents page numbers derive from real page
  // counts. Cover is page 1; contents follows, so docs start after both.
  const docs: { stem: string; doc: PDFDocument }[] = [];
  for (const stem of ordered) {
    const src = await PDFDocument.load(readFileSync(join(pagesDir, `${stem}.pdf`)));
    docs.push({ stem, doc: src });
    console.log(`+ ${stem}.pdf (${src.getPageCount()} page(s))`);
  }
  /** Contents entries numbered from `start`. */
  const entriesFrom = (start: number) => {
    let page = start;
    return docs.map(({ stem, doc }) => {
      const entry = { title: titleFor(stem), page, section: sectionFor(stem) };
      page += doc.getPageCount();
      return entry;
    });
  };

  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  let coverDoc: PDFDocument;
  let contentsDoc: PDFDocument;
  let contentsEntries: ContentsEntry[] = [];
  let contentsRects: RowRect[] | undefined;
  let contentsHeightPx = 0;
  try {
    const date = new Date().toISOString().slice(0, 10);
    const coverSheet = await renderSheet(
      browser,
      coverHtml({
        title: cover.title,
        subtitle: cover.subtitle,
        siteUrl: cover.siteUrl,
        version: repoVersion(),
        date,
        dashboardBuild: screenshotBuild(),
        shotLabel: cover.shotLabel,
        screenshot: loadCoverScreenshot(cover.screenshot, cover.screenshotAlt),
      }),
      { label: 'cover' },
    );
    // The contents sheet's own length shifts every page number it prints, so
    // render it twice: once to learn its length, once with real numbers.
    // Digit widths barely change between passes, so the length is stable; if
    // it ever isn't, fail rather than print wrong numbers.
    const coverDocFinal = await PDFDocument.load(coverSheet.buffer);
    const probe = await PDFDocument.load(
      (await renderSheet(browser, contentsHtml(entriesFrom(0)), { label: 'contents' }))
        .buffer,
    );
    contentsEntries = entriesFrom(coverDocFinal.getPageCount() + probe.getPageCount() + 1);
    const finalSheet = await renderSheet(browser, contentsHtml(contentsEntries), {
      label: 'contents',
      rowSelector: CONTENTS_ROW_SELECTOR,
    });
    const contentsDocFinal = await PDFDocument.load(finalSheet.buffer);
    if (contentsDocFinal.getPageCount() !== probe.getPageCount()) {
      throw new Error(
        `contents sheet length changed between passes (${probe.getPageCount()} -> ${contentsDocFinal.getPageCount()}); page numbers would be wrong`,
      );
    }
    contentsRects = finalSheet.rects;
    contentsHeightPx = finalSheet.height ?? 0;
    coverDoc = coverDocFinal;
    contentsDoc = contentsDocFinal;
  } finally {
    await browser.close();
  }

  const merged = await PDFDocument.create();
  // cover, then contents, then the docs in configured order.
  for (const src of [coverDoc, contentsDoc]) {
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
  }
  for (const { doc } of docs) {
    for (const p of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(p);
  }

  const linkCount = linkContentsRows(
    merged,
    coverDoc.getPageCount(),
    contentsRects,
    contentsHeightPx,
  );
  if (linkCount !== contentsEntries.length) {
    console.warn(
      `only ${linkCount}/${contentsEntries.length} contents rows could be linked to their section`,
    );
  }

  merged.setTitle(cover.subtitle ? `${cover.title} ${cover.subtitle}` : cover.title);
  merged.setAuthor(metadata.author);
  merged.setSubject(metadata.subject);
  merged.setCreationDate(new Date());
  // pdf-lib stamps Producer/ModDate itself on save, so don't set them here.

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await merged.save());
  console.log(
    `Wrote ${outPath} (${merged.getPageCount()} pages from ${ordered.length} file(s), ${linkCount} contents links)`,
  );
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
