/**
 * Config for `bun run pdf:combine`: which per-page PDFs to merge into the
 * single combined guide, and in what order.
 *
 * Stems are per-page file names without the extension, e.g. route
 * `/getting-started` -> `getting-started.pdf` (the guide index is `/` ->
 * `index.pdf`).
 */
export const pdfCombineConfig = {
  /** Combined output file (relative to repo root). */
  outFile: 'pdfs/picsa-user-guide.pdf',
  /** Stems to leave out of the combined guide, e.g. `['test']`. */
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
     * Produced by `bun run cover-shot`, which keeps the app header and footer
     * visible so the cover shows which deployment/role it was captured in.
     * Leave empty for a text-only cover; a missing file warns and is skipped
     * so the guide still builds before the capture has run.
     */
    screenshot: 'public/screenshots/cover.png',
    screenshotAlt: 'The E-PICSA Dashboard home screen',
    /** Names the configuration the cover screenshot was captured under. */
    shotLabel: 'Zambia Admin',
  },
  /** Document properties written onto the combined guide. */
  metadata: {
    author: 'PICSA',
    subject: 'E-PICSA Dashboard user guide',
  },
};
