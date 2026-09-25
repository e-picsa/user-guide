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
  pageCount: number;
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
  return `<!doctype html><html><body>
<style>${baseStyle}
  body { box-sizing: border-box; display: flex; flex-direction: column; height: 100vh; padding: 64px 64px 40px; }
  h1 { font-size: 40px; margin: 0; letter-spacing: -0.5px; }
  .subtitle { font-size: 22px; color: #444; margin: 4px 0 0; }
  .shot { margin-top: 36px; flex: 1; display: flex; align-items: center; justify-content: center; }
  .shot img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto;
              border: 1px solid #e2e2e2; border-radius: 10px; }
  .pages { margin-top: 28px; font-size: 14px; color: #555; }
  .footer { margin-top: auto; padding-top: 20px; border-top: 1px solid #e2e2e2; display: flex;
            justify-content: space-between; font-size: 12px; color: #777; }
</style>
<h1>${esc(details.title)}</h1>
<p class="subtitle">${esc(details.subtitle)}</p>
${shot}
<p class="pages">${details.pageCount} documents</p>
<div class="footer">
  <span>Version ${esc(details.version)} &middot; Generated ${esc(details.date)}</span>
  <span>${esc(details.siteUrl)}</span>
</div>
</body></html>`;
}

export interface ContentsEntry {
  title: string;
  page: number;
}

export function contentsHtml(entries: ContentsEntry[]): string {
  const rows = entries
    .map(
      (e) =>
        `<li><span class="t">${esc(e.title)}</span><span class="dots"></span><span class="p">${e.page}</span></li>`,
    )
    .join('\n');
  return `<!doctype html><html><body>
<style>${baseStyle}
  body { padding: 48px 64px; }
  h2 { font-size: 28px; margin: 0 0 24px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .dots { flex: 1; border-bottom: 1px dotted #999; }
  .p { color: #444; }
</style>
<h2>Contents</h2>
<ul>${rows}</ul>
</body></html>`;
}

/** Selector matching one row per contents entry, in order. */
export const CONTENTS_ROW_SELECTOR = 'h2 + ul > li';
