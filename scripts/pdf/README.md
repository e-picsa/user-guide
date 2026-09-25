# PDF export

Per-page PDFs via headless Chrome (Puppeteer), plus an optional combine step
for a single guide PDF. Follows the official Fumadocs PDF guide, adapted to
this repo's `puppeteer-core` setup.

Each docs page renders as one continuous sheet at full article height (no
pagination), intended for on-screen reading — nobody prints these.

## Usage

```bash
# terminal 1: serve the docs with printing overrides (expanded accordions/tabs)
PDF_PRINT=1 bun run dev

# terminal 2: export one PDF per docs page into pdfs/
bun run pdf

# merge into a single guide (omit/reorder via pdf.config.ts)
bun run pdf:combine

# or both steps at once
bun run pdf:all
```

## Config

- `PDF_BASE_URL` (default `http://localhost:3000`), `PDF_OUT_DIR` (default
  `pdfs`), `PDF_ONLY` (comma filter on routes, e.g. `PDF_ONLY=test bun run pdf`),
  `CHROME_PATH` (shared with `scripts/screenshots/config.ts`).
- `scripts/pdf/pdf.config.ts`: `outFile`, `omit` (stems to exclude),
  `order` (explicit stem ordering; unlisted files append in filename order).
- Print chrome hiding lives in `src/app/global.css` (`@media print`); MDX
  printing overrides (Accordion/Tabs render expanded) in
  `src/components/mdx.tsx`, active only with `PDF_PRINT=1`.
