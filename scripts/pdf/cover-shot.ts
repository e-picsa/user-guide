/**
 * Capture the single dashboard screenshot used on the PDF cover.
 *
 * Unlike the guide screenshots (which hide the fixed app chrome so only
 * per-page content varies), this keeps the `mat-toolbar` header and
 * `dashboard-footer` visible, so the cover shows the deployment, user and
 * version the docs were captured under.
 *
 * Reuses the screenshot runner's login/deployment helpers rather than
 * capturing a second time through the manifest runner, which would also
 * write a manifest, sidecars and the logged-out landing shot.
 *
 * Env: SHOTS_BASE_URL, SHOTS_EMAIL, SHOTS_PASSWORD, SHOTS_DEPLOYMENT,
 * SHOTS_DEPLOYMENT_LABEL, PDF_COVER_SHOT (output path), CHROME_PATH.
 *
 * Run: bun run cover-shot
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

import { loadConfig, resolveChromePath } from '../screenshots/config';
import { login, selectDeployment, settle } from '../screenshots/run';

/** Cover frame, same 720p form factor as the guide screenshots. */
const VIEWPORT = { width: 1280, height: 720 };

async function main(): Promise<void> {
  const config = loadConfig();
  const outFile = resolve(
    process.cwd(),
    process.env.PDF_COVER_SHOT ?? 'public/screenshots/cover.png',
  );

  const browser = await puppeteer.launch({
    executablePath: resolveChromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    await login(page, config.baseUrl, config.email, config.password);
    const hasDeployment = await selectDeployment(page, config.deploymentLabel, config.deploymentId);
    if (!hasDeployment) {
      throw new Error(
        `user has no access to deployment "${config.deploymentLabel}" (${config.deploymentId}); cannot capture the cover screenshot`,
      );
    }
    // From the top: the cover should show the header, not a scrolled view.
    await page.goto(`${config.baseUrl}/home`, { waitUntil: 'networkidle0', timeout: 60_000 });
    await settle(page);

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, await page.screenshot());
    console.log(
      `Wrote ${outFile} (${config.deploymentLabel}, ${config.email}, chrome visible) — set the matching cover.shotLabel in pdf.config.ts`,
    );
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
