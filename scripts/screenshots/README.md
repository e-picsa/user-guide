# Dashboard screenshots (720p)

Captures `http://localhost:4200` (dashboard dev server, `yarn start:dashboard`
from `../picsa-apps`) into `public/screenshots/<identifier>/`, with output
paths mirroring dashboard routes.

## Runs

```bash
# Zambia deployment as seeded admin (full access incl. role-gated pages)
bun run shots:zm-admin

# Malawi deployment as seeded basic user (whatever access that user has)
bun run shots:mw-user

# Iterate on a subset only (comma-separated route filters)
SHOTS_ONLY=climate/station bun run shots:zm-admin
```

Credentials default to the local docker seeds (`admin@picsa.app`,
`user@picsa.app`, password = email). Override via env:
`SHOTS_EMAIL`, `SHOTS_PASSWORD`, `SHOTS_DEPLOYMENT` (id), `SHOTS_DEPLOYMENT_LABEL`
(picker label), `SHOTS_ID` (output identifier), `SHOTS_BASE_URL`, `SHOTS_OUT_DIR`,
`SHOTS_HIDE_CHROME`, `SHOTS_DIFF_THRESHOLD`, `SHOTS_META` (`off` disables the
sidecar files below).

> NOTE: `user@picsa.app` currently has no deployment memberships in the local
> backend, so `shots:mw-user` records a `no-access.png` (request-access state)
> and skips the rest. To enable it, approve the user for the `mw` deployment
> (as admin via `/deployment/permissions`) and re-run.

Chrome resolution: `CHROME_PATH` (or `PUPPETEER_EXECUTABLE_PATH`), else the
puppeteer browser cache, else `/Applications/Google Chrome.app`.

## App chrome

Fixed header/footer (`mat-toolbar`, `dashboard-footer`) are identical across
pages and can't be scrolled away, so they are hidden (`display: none`) before
every capture. Configure with `SHOTS_HIDE_CHROME` (comma-separated selectors,
default `mat-toolbar,dashboard-footer`; `off` keeps everything). The sidebar is
kept as it shows page context.

## Scroll

The dashboard scrolls inside `div.page` (not the window), and SPA navigation
preserves scroll position — so every capture applies a deterministic scroll first:

- Default (`auto`): scroll the page `h1`/`h2` fully out of view so captures
  start at content. Pages without a heading are captured from the top.
- Per page: `scroll: false` keeps the top, `scroll: <px>` uses a fixed offset.
- Global override: `SHOTS_SCROLL=auto|off|<px>` (e.g. `SHOTS_SCROLL=off`).
- Explicit actions: `{ scrollTo: '<selector>' }` (element to viewport top),
  `{ scrollBy: <px> }` for fine control after other actions.

## Reuse (version-keyed skipping)

Each run records `dashboardVersion` (scraped from the running app's footer,
fallback: `../picsa-apps/package.json`) plus a hash of each page entry
(route + href + actions + scroll) in `<identifier>/manifest.json`.

On the next run a page is **reused** (not recaptured) when the stored png
exists and both version and entry hash match. This makes repeat runs fast and
shows exactly what is stale:

- `SHOTS_FORCE=1` recaptures everything.
- `SHOTS_ONLY=<filter>` always recaptures matched pages.
- `SHOTS_ONLY` subset runs merge into the existing manifest (other pages kept);
  full runs prune results for routes removed from the manifest.
- Manifest changes (new route, edited actions/scroll, new exemplar) change the
  hash, so only affected pages are recaptured.
- A dashboard version bump recaptures everything for that identifier.

Even when a recapture happens, the png is only rewritten when it reasonably
changed: the fresh capture is pixel-compared (`pixelmatch`) against the stored
file and kept as `unchanged` when within `SHOTS_DIFF_THRESHOLD` (changed-pixel
ratio, default `0.01`; `off` always rewrites). This keeps git history free of
noise-only updates. Missing files, dimension changes and undecodable pngs count
as changed.

Statuses in `manifest.json`: `captured` | `reused` | `unchanged` | `skipped` | `failed`.

## Metadata + content HTML (for doc agents)

Every capture writes two sidecars next to the png (same stem):

- `<route>.json` — documentation metadata: title/url/version/viewport/scroll,
  `headings`, `interactive` (buttons, links, inputs, tabs — each with text and a
  viewport-relative bbox that maps 1:1 onto png pixels, so an agent can locate
  e.g. the Register button and draw annotations), `tables` (headers + first 3
  rows + total row count, so agents can cite real row content), `nav`
  (sidebar links), `dialogs` (open dialogs).
- `<route>.html` — cleaned `div.page` markup (scripts/styles removed, Angular
  compiler attributes stripped, capped at 500KB) for anything the JSON doesn't
  cover.

Sidecars refresh whenever the page is visited (`captured` or `unchanged`) and
are left alone on `reused`. Hidden elements (`hidden`, `aria-hidden`,
`display: none`, incl. via ancestors) are excluded from the JSON.

`extract.ts` functions run inside the dashboard page (transpiled to plain JS by
`buildEvalCall` in `run.ts`), so they must stay self-contained with no module
references. `bun run shots:verify` checks hashing, diffing and the extraction
round-trip offline (jsdom fixture, no dashboard server needed).

## Files

- `config.ts` — env-based config + Chrome resolution. Viewport fixed at 1280x720.
- `manifest.ts` — page list (`PAGES`), hardcoded `:id` exemplars, optional per-route
  `actions` (ordered UI steps before capture). `routeToFile` maps route -> png path.
- `run.ts` — login -> deployment select -> client-side navigate each page ->
  viewport screenshot. Writes `manifest.json` summary next to pngs.
- `extract.ts` — browser-side metadata + content-HTML extraction (see above).
- `diff.ts` — pixel comparison gate.
- `verify.ts` — offline checks (`bun run shots:verify`).

## Conventions (see `AGENTS.md`)

- One identifier per run (`zm-admin`, `mw-user`); never mix credentials in a folder.
- Client-side navigation (not full reloads): role-gated pages bounce to `/home`
  on cold load because the auth guard runs before the stored deployment finishes
  loading. Pages that bounce are recorded as `skipped` in `manifest.json`.
- `:id` exemplars are a hardcoded limited subset; verify they still resolve if the
  local backend is reseeded.
