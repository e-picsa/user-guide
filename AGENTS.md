# Agent Guide for PICSA User Guide

Fumadocs (Next.js) documentation site. Screenshots are captured from the live
E-PICSA Dashboard Angular app, not from this repo.

## Naming: "E-PICSA Dashboard"

Always name the product **E-PICSA Dashboard** — never "PICSA Dashboard", "the
PICSA dashboard", "E-PicSA" or "PicSA Dashboard". Applies to MDX frontmatter
(`title`, `description`), page copy, `<Screenshot alt>` text, PDF metadata
(`scripts/pdf/pdf.config.ts`) and release notes. Subsequent references on a page
may use the lowercase generic "the dashboard" (e.g. "reloads the dashboard"),
but the first mention on a page should be the full product name.

Two deliberate exceptions, both derived from the dashboard app itself rather
than written by us — do not "fix" them:

- The app's `<title>`/browser title is `PICSA Dashboard`, so screenshot sidecar
  `public/screenshots/**/*.json` record `"title": "PICSA Dashboard"` (asserted
  by the fixture in `scripts/screenshots/verify.ts`).
- Bare "PICSA" is still correct for the org, the field apps ("the PICSA field
  apps") and PDF metadata `author: 'PICSA'`.

## Site structure

The guide is served from the **site root** — there is no `/docs` prefix. The
docs catch-all is `src/app/[[...slug]]/page.tsx` and `docsRoute` in
`src/lib/shared.ts` is `/`, which is the single source of truth for the
`loader()` `baseUrl` (and so for the sidebar, `createRelativeLink` links, the
search index and `llms.txt`). `scripts/pdf/pages.ts` derives its routes from
that same constant, so the site and the PDF exporter cannot drift.

- `docsImageRoute` (`/og/docs`) and `docsContentRoute` (`/llms.mdx/docs`) are
  deliberately *not* at the root — they are the OG image and markdown-source
  routes, and are unrelated to `docsRoute`.
- There is no `proxy.ts`: Proxy is unsupported with `output: 'export'`, so the
  markdown-content negotiation it provided never ran in production. The
  `MarkdownCopyButton` / `ViewOptionsPopover` link straight at
  `docsContentRoute` instead.
- `next.config.mjs` keeps `basePath` unset — see the note there before adding
  one.

## Relation to dashboard app

- Dashboard source: `../picsa-apps/apps/picsa-apps/dashboard/src/app/`
- Dashboard route definitions: `../picsa-apps/apps/picsa-apps/dashboard/src/app/app.routes.ts`
  with per-feature routes colocated at `modules/*/*.routes.ts` via `defineFeature`
  (`../picsa-apps/apps/picsa-apps/dashboard/src/app/utils/route-utils.ts`).
- Dashboard runs locally on `http://localhost:4200`
  (`yarn start:dashboard` from `../picsa-apps`). All screenshot tooling targets
  this instance exclusively; no prod (`https://dashboard.picsa.app`) captures.
- Dashboard auth is Supabase email/password
  (`../picsa-apps/libs/shared/src/services/core/supabase/services/supabase-auth.service.ts`).
  Local docker backend (`../picsa-apps/apps/picsa-server/supabase/seed.sql`) seeds:
  `admin@picsa.app` / `admin@picsa.app` and `user@picsa.app` / `user@picsa.app`.
- Active deployment persists in `localStorage` key `picsa_dashboard_deployment`
  (`../picsa-apps/apps/picsa-apps/dashboard/src/app/modules/deployment/deployment.service.ts`).
  Role-gated routes redirect to `/` without the required `picsa_roles` for that
  deployment (`modules/auth/guards/auth-role.guard.ts`).

## Screenshot standards (720p)

- Viewport `1280x720`, `deviceScaleFactor: 1`, viewport-only captures
  (`animations: 'disabled'`, wait for `networkidle` + settle for charts/maps).
- Default scroll removes the page heading (`h1`/`h2` scrolled fully out of
  `div.page`, the app scroll container); per-route `scroll` override or
  `scrollTo`/`scrollBy` actions when needed (`SHOTS_SCROLL=off` to disable).
- Output path mirrors the dashboard route, including resolved params, e.g.
  route `/climate/station/chipata_met` -> `<identifier>/climate/station/chipata_met.png`.
  Never use abstract labels like `station-details.png`.
- Top-level identifier is `<deployment>-<role>`, e.g.
  `screenshots/zm-admin/...` (login as `admin@picsa.app`) or
  `screenshots/mw-user/...` (login as `user@picsa.app`).
  One identifier per run; future credentials get new identifiers, no shared folders.
- `:id`-style routes use a hardcoded exemplar list (limited subset only), e.g.
  a known station ID per deployment. Do not crawl arbitrary IDs.
- Routes may declare custom `actions` (ordered UI steps before capture, e.g.
  click a tab/button). Only for explicitly listed routes; default is plain
  `goto` + capture.
- Screenshot runner + page manifest live in this repo
  (`scripts/screenshots/run.ts`, `manifest.ts`, `config.ts`;
  `bun run shots:zm-admin`, `bun run shots:mw-user`);
  dashboard repo is never modified for docs captures.
- Captures are version-keyed: each identifier's `manifest.json` records the
  dashboard version + per-page entry hash. Repeat runs `reuse` up-to-date
  pngs and recapture only stale ones (`SHOTS_FORCE=1` recaptures all).
- Fixed app chrome (`mat-toolbar`, `dashboard-footer`) is hidden before capture;
  only the sidebar is kept for context (`SHOTS_HIDE_CHROME=off` to keep all).
- Recaptured pngs are pixel-compared and only rewritten when reasonably
  different (`SHOTS_DIFF_THRESHOLD`, default 1%), keeping git history clean.
- Each screenshot ships with agent-readable sidecars (same stem): `.json`
  metadata (headings, interactive elements with viewport bboxes, table
  headers + first rows, nav, dialogs) and cleaned `.html` content
  (`SHOTS_META=off` to disable). `extract.ts` functions run in-page and must
  stay self-contained; `bun run shots:verify` guards them offline.

## Annotation marker alignment

Guide pages annotate screenshots with `<Screenshot>` (`src/components/screenshot.tsx`,
fuchsia numbered badges positioned by percentage + auto key). Badges must sit
on their target element at every viewport width. There is no global offset to
apply — misalignment always comes from bad coordinates, so follow this process:

- **Derive, never eyeball.** Sidecar bboxes are viewport-relative CSS px
  extracted _after_ scroll + capture, 1:1 with png pixels at 1280x720
  (`deviceScaleFactor: 1`). Marker centre = bbox centre:
  `x = (bbox.x + bbox.width / 2) / 12.8`, `y = (bbox.y + bbox.height / 2) / 7.2`.
  Query the `.json` sidecar for the target element (buttons, tabs
  `[role="tab"]`, inputs, headers all carry bboxes).
- **Only mark what is in frame.** Auto-scroll routinely pushes the `h1`/`h2`
  and top action buttons (`Add *`, `Refresh Data`) above the viewport
  (negative bbox `y`), and controls like `Export JSON`, `Save Profile`,
  Copy/Export sit below the fold (`y > 720`). Check every target's bbox first;
  describe off-screen controls in body text or a `<Callout>` instead of marking
  them. Keep badges clear of edges (badge is 28px; avoid `y > ~95`).
- **Know the bbox gaps.** Tables, maps, search fields and home-page cards
  expose no element bboxes (cards aren't `button`/`a`; tables record headers
  and rows as text only). For these, estimate from the png (sidebar is
  `0–203px`, i.e. `0–16%`), then verify with the overlay step — never ship an
  estimate unverified.
- **Verify with composites.** `bun run overlay:check`
  (`scripts/screenshots/overlay-check.ts`) parses markers out of the MDX and
  draws crosshaired badges onto the pngs under `$TMPDIR/shots-overlay/`
  (`legend.json` maps badge colour order to labels). Review every composite,
  adjust MDX coordinates, re-run until each badge centre sits on its element,
  then `bun run build` + `bun run lint`.
- **Re-verify after any recapture.** Layout, scroll position or seed-data
  changes silently move elements; `overlay:check` is the gate before
  committing marker or screenshot updates. Convention is badge centred _on_
  the target (small controls get covered); do not nudge centres off-element
  for aesthetics.
- **Never style a marker with `box-shadow`/`shadow-*` or `ring-*`.** Chrome
  rasterises blurred shadows in the PDF pipeline without the
  `border-radius` clip, printing a grey box around each badge. The white ring
  must be a real `border`; any screen-only depth goes in the
  `@media screen` block in `src/app/global.css` (`.screenshot-marker-badge`),
  which print never sees. Verify with the `PDF_PRINT=1 NEXT_DIST_DIR=.next-print
bun run build` + `bun run pdf:serve` + `PDF_ONLY=<route> bun run pdf` flow (see
  `scripts/pdf/README.md`) before changing badge styling.

## PDF publishing

- The guide PDF is generated in CI on every push to `main` and published twice:
  copied into `public/` (served at `/picsa-user-guide.pdf`, linked from
  `content/docs/index.mdx`) and attached to the GitHub release tagged
  `v<package.json version>`. Bump the version to publish a new release; an
  existing tag's asset is refreshed. Release assets download without sign-in,
  Actions artifacts don't — never switch the site link to an artifact URL.
- `PDF_PRINT` is build-time only (`src/components/mdx.tsx`), so the PDF needs
  its own build: `PDF_PRINT=1 NEXT_DIST_DIR=.next-print bun run build`, served
  by `scripts/pdf/serve.ts` (the static export uses clean URLs, so
  `next start` and plain file servers don't work). Never drop the
  `NEXT_DIST_DIR` override — the print build's cache would leak expanded
  accordions/tabs into the deployed site.
- CI jobs are `pdf` -> `build` -> (`deploy`, `release` in parallel); the
  `pdf` -> `build` edge is strict so a capture failure never deploys a site
  with a 404 download link.
- Pages are captured concurrently (`PDF_CONCURRENCY`, default 3), which is only
  safe while `settleAndMeasure` waits for content to land instead of for a
  fixed delay. Re-verify a pooled run against `PDF_CONCURRENCY=1` (per-page
  sizes should match) if you touch `scripts/pdf/print.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
