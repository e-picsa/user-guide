# PDF export

Per-page PDFs via headless Chrome (Puppeteer), plus an optional combine step
for a single guide PDF. Follows the official Fumadocs PDF guide, adapted to
this repo's `puppeteer-core` setup.

Each docs page renders as one continuous sheet at full article height (no
pagination), intended for on-screen reading — nobody prints these.

## Usage

Two processes, as in CI (`.github/workflows/deploy.yml`):

```bash
# 1. build the static export with printing overrides (expanded
#    accordions/tabs). NEXT_DIST_DIR keeps this build's cache out of the
#    normal `.next`, otherwise the next build can reuse print-mode HTML.
PDF_PRINT=1 NEXT_DIST_DIR=.next-print bun run build

# 2. serve `out/` and capture it
bun run pdf:serve &
PDF_BASE_URL=http://127.0.0.1:3000 bun run pdf
```

For quick local iteration `PDF_PRINT=1 bun run start` (dev server) in one
terminal and `bun run pdf` in another works too.

`bun run pdf` exports per-page PDFs then merges them into
`pdfs/picsa-dashboard-guide.pdf`, prepended with a cover sheet and a contents
page. Contents page numbers are exact: they are derived from the real page
count of every section, so the contents sheet may grow to any length without
renumbering anything. Each contents row is a clickable link to its section.

## Order

Pages are combined in page-tree order — the same order and grouping the
website sidebar shows — by walking `content/docs` and honouring each folder's
`meta.json` `pages` array (`...` expands to the rest, sorted; unlisted files
are appended last). So reordering the sidebar reorders the PDF and the
contents page, with no changes to the scripts. A per-page PDF with no
matching docs file is appended last with a warning rather than dropped.
`order` in `pdf.config.ts` still pins stems to the front if you need an
override.

## Cover screenshot

`bun run cover-shot` captures a single dashboard screenshot for the cover,
keeping the app header and footer visible (the per-page guide screenshots
hide them) so the cover shows which deployment, user and dashboard version
the docs were captured under:

```bash
SHOTS_EMAIL=admin@picsa.app SHOTS_DEPLOYMENT=zm \
  SHOTS_DEPLOYMENT_LABEL='Zambia App' bun run cover-shot
```

It writes `public/screenshots/cover.png` and reuses the screenshot runner's
login/deployment helpers. That file is **committed**: CI has no dashboard to
capture, so it relies on the checked-in image. Re-run the capture and set the
matching `cover.shotLabel` in `pdf.config.ts` whenever the dashboard or the
documented deployment/role changes. A missing file only warns and falls back
to a text-only cover.

## Serving the export

`serve.ts` exists because `output: 'export'` cannot be served by `next start`,
and the export uses clean URLs (`out/climate/stations.html`) that a plain
file server 404s. Env: `PDF_SERVE_DIR` (default `out`), `PDF_SERVE_PORT`
(default `3000`), `PDF_SERVE_HOST` (default `127.0.0.1`).

## Publishing

CI copies `pdfs/picsa-dashboard-guide.pdf` into `public/` as both
`picsa-dashboard-guide.pdf` (linked from the docs index) and
`picsa-dashboard-guide-v<version>.pdf`, then attaches the versioned file to the
GitHub release tagged `v<version>` from `package.json`. Release assets download
without a GitHub sign-in — Actions artifacts do not, and expire after 90 days.
Bump `package.json`'s version to publish a new PDF; an existing tag's asset is
refreshed rather than duplicated.

Workflow jobs are `pdf` → `build` → (`deploy`, `release` in parallel). The
`pdf` → `build` edge is strict: a capture failure fails the run rather than
deploying a site whose download link 404s. `release` runs beside `deploy` so
the two can't block each other.

## Concurrency

`export.ts` captures pages through a small pool (`PDF_CONCURRENCY`, default 3)
over one browser. This is only safe because `settleAndMeasure` waits for
content to land (images resolved, video metadata loaded, height stable across
two consecutive measures) rather than for a fixed delay — under concurrency a
delay-based guess loses the race and returns a sheet that silently clips the
article. If you change the settle logic, compare a pooled run against a
serial one (`PDF_CONCURRENCY=1`) page by page; per-page byte sizes should match
to within PDF metadata noise.

## Config

- `PDF_BASE_URL` (default `http://localhost:3000`), `PDF_OUT_DIR` (default
  `pdfs`), `PDF_ONLY` (comma filter on route prefixes, matched on whole
  segments — e.g. `PDF_ONLY=climate` or
  `PDF_ONLY=getting-started/signing-in,translations`),
  `PDF_CONCURRENCY` (pages captured in parallel, default 3),
  `CHROME_PATH` (shared with `scripts/screenshots/config.ts`; CI installs a
  Linux Chrome and sets this, since the built-in candidates are macOS-only).
- `scripts/pdf/pdf.config.ts`: `outFile`, `omit` (stems to exclude),
  `order` (explicit stem ordering; unlisted files append in filename order),
  `cover` (title, subtitle, site URL, `screenshot` path + alt text,
  `shotLabel` naming the configuration the screenshot was captured in),
  `metadata` (author, subject). The cover screenshot is embedded as a data
  URI; if the file is missing the cover falls back to text-only with a
  warning, so the guide still builds before the capture has run.
  The combine step alone can be re-run via `bun scripts/pdf/combine.ts`.
- Print chrome hiding lives in `src/app/global.css` (`@media print`); MDX
  printing overrides (Accordion/Tabs render expanded) in
  `src/components/mdx.tsx`, active only with `PDF_PRINT=1`.
