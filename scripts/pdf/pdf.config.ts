/**
 * Config for `bun run pdf:combine`: which per-page PDFs to merge into the
 * single combined guide, and in what order.
 *
 * Stems are per-page file names without the extension, e.g. route
 * `/docs/getting-started` -> `docs-getting-started.pdf`.
 */
export const pdfCombineConfig = {
  /** Combined output file (relative to repo root). */
  outFile: 'pdfs/picsa-user-guide.pdf',
  /** Stems to leave out of the combined guide, e.g. `['docs-test']`. */
  omit: [] as string[],
  /**
   * Explicit ordering of stems. Stems not listed here are appended
   * afterwards in filename order. Empty means filename order.
   */
  order: [] as string[],
  /** Cover sheet details. Version is read from package.json at runtime. */
  cover: {
    title: 'E-PICSA Dashboard',
    subtitle: 'User Guide',
    siteUrl: 'https://guide.picsa.app',
    /**
     * Dashboard screenshot shown on the cover. Relative to repo root.
     * Leave empty for a text-only cover; a missing file warns and is skipped
     * so the guide still builds before `bun run shots:zm-admin` has run.
     */
    screenshot: 'public/screenshots/zm-admin/home.png',
    screenshotAlt: 'The E-PICSA Dashboard home screen',
  },
  /** Document properties written onto the combined guide. */
  metadata: {
    author: 'PICSA',
    subject: 'PICSA Dashboard user guide',
  },
};
