/**
 * Merge the per-page PDFs from `bun run pdf` into a single combined guide.
 * Pages can be omitted or reordered via `scripts/pdf/pdf.config.ts`.
 *
 * Env: PDF_OUT_DIR (default `pdfs`, must match the export step).
 *
 * Run: bun run pdf:combine
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

import { pdfCombineConfig } from './pdf.config';

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), env('PDF_OUT_DIR', 'pdfs'));
  if (!existsSync(outDir)) {
    throw new Error(`No per-page PDFs found in ${outDir}. Run \`bun run pdf\` first.`);
  }
  const { omit = [], order = [], outFile } = pdfCombineConfig;
  const outPath = resolve(process.cwd(), outFile);
  // Never merge the combined output back into itself on repeat runs.
  const outStem =
    dirname(outPath) === outDir ? basename(outPath).slice(0, -'.pdf'.length) : null;
  const stems = readdirSync(outDir)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => f.slice(0, -'.pdf'.length))
    .filter((s) => s !== outStem)
    .sort();
  const omitted = new Set(omit);
  const included = stems.filter((s) => !omitted.has(s));
  const unknown = [...omitted].filter((s) => !stems.includes(s));
  if (unknown.length) console.warn(`omit entries with no matching PDF: ${unknown.join(', ')}`);
  const ordered = [
    ...order.filter((s) => included.includes(s)),
    ...included.filter((s) => !order.includes(s)),
  ];
  if (!ordered.length) throw new Error('Nothing to combine: all per-page PDFs are omitted');

  const merged = await PDFDocument.create();
  for (const stem of ordered) {
    const src = await PDFDocument.load(readFileSync(join(outDir, `${stem}.pdf`)));
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const p of copied) merged.addPage(p);
    console.log(`+ ${stem}.pdf (${src.getPageCount()} page(s))`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await merged.save());
  console.log(`Wrote ${outPath} (${merged.getPageCount()} pages from ${ordered.length} file(s))`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
