/**
 * HTML builders for the combined guide's front sheets, rendered to PDF via
 * headless Chrome (`page.setContent`, no dev server needed).
 */

export interface CoverDetails {
  title: string;
  subtitle: string;
  siteUrl: string;
  version: string;
  date: string;
  /**
   * Dashboard build the screenshots were captured from, e.g. `5.14.0`. Named
   * as the capture build on purpose: it may be ahead of the latest released
   * dashboard tag, so it must not read as "this guide is for dashboard X".
   */
  dashboardBuild?: string;
  /**
   * Which deployment/role the embedded dashboard screenshot was captured
   * under, e.g. `Zambia Admin`. The screenshot shows the app header and
   * footer, so this names the configuration it was taken in.
   */
  shotLabel?: string;
  /** Dashboard screenshot embedded on the cover, if available. */
  screenshot?: { dataUri: string; alt: string };
}

const baseStyle = `
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 0; }
`;

/** Titles come from content frontmatter, so escape before interpolating. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function coverHtml(details: CoverDetails): string {
  const shot = details.screenshot
    ? `<div class="shot"><img src="${details.screenshot.dataUri}" alt="${esc(details.screenshot.alt)}"></div>`
    : '';
  const shotNote = details.shotLabel
    ? `<p class="shot-note">Dashboard screenshot: ${esc(details.shotLabel)}</p>`
    : '';
  const buildNote = details.dashboardBuild
    ? ` &middot; Screenshots from dashboard build ${esc(details.dashboardBuild)}`
    : '';
  return `<!doctype html><html><body>
<style>${baseStyle}
  body { box-sizing: border-box; padding: 64px 64px 40px; }
  h1 { font-size: 40px; margin: 0; letter-spacing: -0.5px; }
  .subtitle { font-size: 22px; color: #444; margin: 4px 0 0; }
  .shot { margin-top: 36px; }
  .shot img { display: block; width: 100%; height: auto; border: 1px solid #e2e2e2; border-radius: 10px; }
  .shot-note { margin: 20px 0 0; font-size: 13px; color: #666; }
  .footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e2e2; display: flex;
            justify-content: space-between; font-size: 12px; color: #777; }
</style>
<h1>${esc(details.title)}</h1>
<p class="subtitle">${esc(details.subtitle)}</p>
${shot}
${shotNote}
<div class="footer">
  <span>Version ${esc(details.version)} &middot; Generated ${esc(details.date)}${buildNote}</span>
  <span>${esc(details.siteUrl)}</span>
</div>
</body></html>`;
}

export interface ContentsEntry {
  title: string;
  page: number;
  /** Enclosing folder title, e.g. `Getting started`. Omitted at the root. */
  section?: string;
}

/**
 * Contents grouped by section, mirroring the website sidebar. Entries are
 * expected in page-tree order, so consecutive runs of the same section become
 * one group without needing to sort.
 */
export function contentsHtml(entries: ContentsEntry[]): string {
  const groups: { section?: string; rows: ContentsEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.section === entry.section) last.rows.push(entry);
    else groups.push({ section: entry.section, rows: [entry] });
  }

  const body = groups
    .map((group) => {
      const heading = group.section ? `<h3>${esc(group.section)}</h3>` : '';
      const rows = group.rows
        .map(
          (e) =>
            `<li data-page="${e.page}"><span class="t">${esc(e.title)}</span><span class="dots"></span><span class="p">${e.page}</span></li>`,
        )
        .join('\n');
      return `<div class="group">${heading}<ul>\n${rows}\n</ul></div>`;
    })
    .join('\n');

  return `<!doctype html><html><body>
<style>${baseStyle}
  body { padding: 40px 60px; }
  h2 { font-size: 24px; margin: 0 0 14px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666;
       margin: 14px 0 6px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 8px; font-size: 13px; margin-bottom: 4px; }
  .dots { flex: 1; border-bottom: 1px dotted #999; }
  .p { color: #444; }
</style>
<h2>Contents</h2>
${body}
</body></html>`;
}

/** Selector matching one row per contents entry, in order. */
export const CONTENTS_ROW_SELECTOR = 'li[data-page]';
