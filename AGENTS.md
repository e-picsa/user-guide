# Agent Guide for PICSA User Guide

Fumadocs (Next.js) documentation site. Screenshots are captured from the live
PICSA Dashboard Angular app, not from this repo.

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
