# Skill: act on a dashboard audit

This guide tells an AI agent how to turn `audit.ts` output into guide updates.
Run the audit first, triage its findings, then make the smallest edits that
close each gap. The dashboard repo is never modified for docs captures.

## 1. Run the audit

```bash
bun scripts/dashboard-audit/audit.ts --commits 30
# Machine-readable report for larger triage:
bun scripts/dashboard-audit/audit.ts --json /tmp/audit.json
# Track route drift across dashboard upgrades:
bun scripts/dashboard-audit/audit.ts --snapshot-out /tmp/routes-snap.json
bun scripts/dashboard-audit/audit.ts --compare /tmp/routes-snap.json
```

If the dashboard checkout cannot be found, pass `--dashboard` (or set
`DASHBOARD_SRC`) pointing at the dashboard `src/app` dir. The known layouts
are listed at the top of `audit.ts`.

## 2. Triage ADD candidates

Each ADD finding is a dashboard route with no screenshot exemplar and/or no
guide reference.

- **Genuinely new page** (`no screenshot exemplar … and no guide page
  mentions it`): add a manifest entry in
  `scripts/screenshots/manifest.ts` (hardcoded exemplar for `:id` routes,
  verified against the local docker backend), capture with
  `bun run shots:zm-admin` (and `shots:mw-user` where role coverage matters),
  then write or extend the MDX page. One identifier per run; never use
  abstract labels like `station-details.png` — output mirrors the route.
- **Likely described in parent page** (`likely described in … covers
  <parent>`): read the named MDX, add an explicit route mention and embed the
  existing editor screenshot. Do not create a new page.
- **Legal pages** (`privacy-policy`, `terms-of-service`): intentionally
  undocumented unless asked. Leave them; `--check` will keep flagging them,
  which is the reminder to re-confirm.

## 3. Triage REMOVE / STALE_REF candidates

- Confirm the route is really gone: check the dashboard feature
  `*.routes.ts`, `app.routes.ts` and `git log` in the dashboard repo — renames
  (e.g. `climate/stations` → `climate/station`) are common.
- If gone: remove the manifest entry, delete the orphaned png + sidecars, and
  update or delete the MDX references.
- If renamed: update the manifest route, recapture, and fix MDX links.

## 4. Triage FRESHNESS items

Each item names a dashboard commit, the routes it touched (via component
directory + feature-level `routes/module/guard` files) and the guide pages
covering those routes.

- Read the commit (`git -C <dashboard-repo> show <hash> --stat`, then the
  template `.html` diff first — templates drive screenshots and marker
  positions; `.ts` changes drive role/nav/prose edits).
- If the UI changed: recapture the affected routes (`SHOTS_ONLY=<route>`
  filter), re-run `bun run overlay:check` (marker coordinates shift silently
  on layout/scroll/seed-data changes), and update the MDX copy.
- If only data/seed content changed (new districts, new stations): update
  counts, exemplar IDs and captions; markers rarely move.

## 5. When the guide needs editing (rules of thumb)

- Any dashboard commit touching `dashboard/src/app/modules/**` templates,
  route files or guards is a candidate — the audit maps these to routes.
- Dashboard version bumps or seed-data PRs (`feat(data): …`) change counts,
  exemplar IDs and table contents even when no component changed.
- Recaptured pngs that exceed `SHOTS_DIFF_THRESHOLD` mean the page visibly
  changed — treat the MDX + markers as suspect until `overlay:check` passes.
- Marker coordinates are derived from sidecar bboxes, never eyeballed (see
  AGENTS.md). Re-verify with composites after every recapture.

## 6. Verify before finishing

```bash
bun run overlay:check
bun run build && bun run lint
bun run spellcheck
```

Product naming: **E-PICSA Dashboard** on first mention per page (generic "the
dashboard" after). British spelling; legitimate domain terms go in `words` in
`cspell.json`, never silence the run with `ignorePaths`.
