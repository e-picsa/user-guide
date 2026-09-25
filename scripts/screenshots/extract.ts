/**
 * Browser-side extraction for screenshot metadata.
 *
 * `extractMeta` and `extractContentHtml` run INSIDE the dashboard page: run.ts
 * transpiles them with the TypeScript compiler (stripping all types) and ships
 * the resulting plain JS via `page.evaluate`. They must therefore stay
 * self-contained — no references to module scope (pass everything as args).
 * `bun run shots:verify` guards the serialization round-trip.
 */

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementMeta {
  tag: string;
  kind: string;
  text: string;
  bbox: BBox;
  href?: string;
  label?: string;
}

export interface TableMeta {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export interface NavMeta {
  label: string;
  href: string;
}

export interface ScreenshotMeta {
  route: string;
  url: string;
  title: string;
  identifier: string;
  dashboardVersion: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  scrollTop: number;
  space: string;
  headings: ElementMeta[];
  interactive: ElementMeta[];
  tables: TableMeta[];
  nav: NavMeta[];
  dialogs: ElementMeta[];
}

export interface ExtractLimits {
  text: number;
  cell: number;
  interactive: number;
  tables: number;
  tableRows: number;
  tableCols: number;
  nav: number;
}

export const META_LIMITS: ExtractLimits = {
  text: 120,
  cell: 200,
  interactive: 300,
  tables: 10,
  tableRows: 3,
  tableCols: 20,
  nav: 60,
};

/**
 * Collect documentation-oriented metadata for the current page.
 * Bboxes are viewport-relative CSS px (1:1 with png pixels at deviceScaleFactor 1).
 */
export function extractMeta(
  route: string,
  identifier: string,
  dashboardVersion: string,
  capturedAt: string,
  viewportWidth: number,
  viewportHeight: number,
  limits: ExtractLimits,
): ScreenshotMeta {
  function text(el: Element, max: number): string {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }
  function bbox(el: Element): BBox {
    const r = el.getBoundingClientRect();
    const n = (v: number): number => Math.round(v * 10) / 10;
    return { x: n(r.x), y: n(r.y), width: n(r.width), height: n(r.height) };
  }
  function hiddenByAncestor(el: Element): boolean {
    let cur: Element | null = el;
    while (cur) {
      if (cur.hasAttribute('hidden')) return true;
      if (cur.getAttribute('aria-hidden') === 'true') return true;
      // NB: `as` casts are compile-time only, safe for browser serialization
      const style = (cur as HTMLElement).style;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
      try {
        const cs = window.getComputedStyle(cur);
        if (cs && cs.display === 'none') return true;
      } catch {
        // ignore, treat as visible
      }
      cur = cur.parentElement;
    }
    return false;
  }
  function visible(el: Element): boolean {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return false;
    if (tag === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
    return !hiddenByAncestor(el);
  }
  function accessibleName(el: Element): string {
    return (
      el.getAttribute('aria-label') ||
      text(el, limits.text) ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      ''
    );
  }
  function kindOf(el: Element): string {
    if (el.getAttribute('role') === 'tab') return 'tab';
    if (el.tagName === 'A') return 'link';
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return 'input';
    return 'button';
  }

  const root =
    document.querySelector('div.page') || document.querySelector('mat-sidenav-content') || document.body;
  const container = document.querySelector('div.page');
  const scrollTop = container ? container.scrollTop : 0;

  const headings: ElementMeta[] = [];
  const seenHeadings: string[] = [];
  const hEls = root.querySelectorAll('h1, h2, h3');
  for (let hi = 0; hi < hEls.length; hi++) {
    const h = hEls[hi];
    if (!visible(h)) continue;
    const ht = text(h, limits.text);
    if (!ht || seenHeadings.indexOf(ht) !== -1) continue;
    seenHeadings.push(ht);
    headings.push({ tag: h.tagName.toLowerCase(), kind: 'heading', text: ht, bbox: bbox(h) });
  }

  const interactive: ElementMeta[] = [];
  const els = root.querySelectorAll(
    'button, a[href], input, select, textarea, [role="tab"], [role="button"], [role="link"]',
  );
  for (let ei = 0; ei < els.length && interactive.length < limits.interactive; ei++) {
    const el = els[ei];
    if (!visible(el)) continue;
    let label = accessibleName(el);
    if (!label && el.tagName === 'INPUT') {
      label = el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('type') || 'input';
    }
    if (!label) continue;
    const kind = kindOf(el);
    const item: ElementMeta = { tag: el.tagName.toLowerCase(), kind, text: label, bbox: bbox(el) };
    if (kind === 'link') item.href = el.getAttribute('href') || '';
    if (kind === 'input') {
      const it = (el.getAttribute('type') || 'text').toLowerCase();
      const ph = el.getAttribute('placeholder') || el.getAttribute('name') || '';
      item.label = 'input:' + it + (ph ? ' (' + ph.slice(0, 60) + ')' : '');
    }
    interactive.push(item);
  }

  const tables: TableMeta[] = [];
  const tbls = root.querySelectorAll('table');
  for (let ti = 0; ti < tbls.length && tables.length < limits.tables; ti++) {
    const tbl = tbls[ti];
    if (!visible(tbl)) continue;
    const headers: string[] = [];
    const ths = tbl.querySelectorAll('thead th');
    for (let ci = 0; ci < ths.length && headers.length < limits.tableCols; ci++) {
      headers.push(text(ths[ci], limits.cell));
    }
    const rows: string[][] = [];
    const trs = tbl.querySelectorAll('tbody tr');
    for (let ri = 0; ri < trs.length && rows.length < limits.tableRows; ri++) {
      const cells: string[] = [];
      const tds = trs[ri].querySelectorAll('td, th');
      for (let di = 0; di < tds.length && cells.length < limits.tableCols; di++) {
        cells.push(text(tds[di], limits.cell));
      }
      if (cells.length) rows.push(cells);
    }
    if (headers.length || rows.length) {
      tables.push({ headers, rows, rowCount: trs.length });
    }
  }

  const nav: NavMeta[] = [];
  const navRoot = document.querySelector('mat-sidenav') || document.querySelector('nav') || document;
  const links = navRoot.querySelectorAll('a[href]');
  for (let ni = 0; ni < links.length && nav.length < limits.nav; ni++) {
    const a = links[ni];
    if (!visible(a)) continue;
    const lt = text(a, limits.text);
    if (!lt) continue;
    nav.push({ label: lt, href: a.getAttribute('href') || '' });
  }

  const dialogs: ElementMeta[] = [];
  const dlgs = document.querySelectorAll('[role="dialog"], mat-dialog-container');
  for (let gi = 0; gi < dlgs.length; gi++) {
    const d = dlgs[gi];
    if (!visible(d)) continue;
    const dh = d.querySelector('h1, h2, h3');
    dialogs.push({
      tag: d.tagName.toLowerCase(),
      kind: 'dialog',
      text: (dh && text(dh, limits.text)) || d.getAttribute('aria-label') || 'dialog',
      bbox: bbox(d),
    });
  }

  return {
    route,
    url: window.location.href,
    title: document.title,
    identifier,
    dashboardVersion,
    capturedAt,
    viewport: { width: viewportWidth, height: viewportHeight },
    scrollTop,
    space: 'viewport-relative CSS px at capture viewport (1:1 with png at deviceScaleFactor 1)',
    headings,
    interactive,
    tables,
    nav,
    dialogs,
  };
}

/**
 * Serialize the page content area to cleaned HTML for agent reference.
 * Strips scripts/styles, Angular compiler attributes. Capped at 500KB.
 */
export function extractContentHtml(): string {
  const root =
    document.querySelector('div.page') || document.querySelector('mat-sidenav-content') || document.body;
  // Round-trip through a fresh div (also detaches live component state)
  const holder = document.createElement('div');
  holder.innerHTML = root.innerHTML;
  const drop = holder.querySelectorAll('script, style, link, noscript, template');
  for (let i = drop.length - 1; i >= 0; i--) {
    const parent = drop[i].parentNode;
    if (parent) parent.removeChild(drop[i]);
  }
  const all = holder.querySelectorAll('*');
  for (let j = 0; j < all.length; j++) {
    const attrs = all[j].attributes;
    const remove: string[] = [];
    for (let k = 0; k < attrs.length; k++) {
      const name = attrs[k].name;
      if (
        name.indexOf('_ngcontent') === 0 ||
        name.indexOf('_nghost') === 0 ||
        name.indexOf('ng-reflect') === 0 ||
        name.indexOf('ng-') === 0 ||
        name === 'ng-version'
      ) {
        remove.push(name);
      }
    }
    for (let m = 0; m < remove.length; m++) {
      all[j].removeAttribute(remove[m]);
    }
  }
  const html = holder.innerHTML.trim();
  const max = 500 * 1024;
  if (html.length > max) {
    return html.slice(0, max) + '\n<!-- truncated at 500KB -->';
  }
  return html;
}
