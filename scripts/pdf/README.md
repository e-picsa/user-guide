# PDF export

Per-page PDFs via headless Chrome (Puppeteer), plus an optional combine step
for a single guide PDF. Follows the official Fumadocs PDF guide, adapted to
this repo's `puppeteer-core` setup.

Each docs page renders as one continuous sheet at full article height (no
pagination), intended for on-screen reading — nobody prints these.

## Usage

```bash
# terminal 1: serve the docs with printing overrides (expanded accordions/tabs)
PDF_PRINT=1 bun run start

# terminal 2: export per-page PDFs into pdfs/ and merge into the guide
bun run pdf
```

`bun run pdf` exports per-page PDFs then merges them into
`pdfs/picsa-user-guide.pdf`, prepended with a cover sheet and a contents
page. Contents page numbers are exact: they are derived from the real page
count of every section, so the contents sheet may grow to any length without
renumbering anything. Each contents row is a clickable link to its section.

## Config

- `PDF_BASE_URL` (default `http://localhost:3000`), `PDF_OUT_DIR` (default
  `pdfs`), `PDF_ONLY` (comma filter on routes, e.g. `PDF_ONLY=test bun run pdf`),
  `CHROME_PATH` (shared with `scripts/screenshots/config.ts`).
- `scripts/pdf/pdf.config.ts`: `outFile`, `omit` (stems to exclude),
  `order` (explicit stem ordering; unlisted files append in filename order),
  `cover` (title, subtitle, site URL, `screenshot` path + alt text),
  `metadata` (author, subject). The cover screenshot is embedded as a data
  URI; if the file is missing the cover falls back to text-only with a
  warning, so the guide still builds before the screenshot capture has run.
  The combine step alone can be re-run via `bun scripts/pdf/combine.ts`.
- Print chrome hiding lives in `src/app/global.css` (`@media print`); MDX
  printing overrides (Accordion/Tabs render expanded) in
  `src/components/mdx.tsx`, active only with `PDF_PRINT=1`.
