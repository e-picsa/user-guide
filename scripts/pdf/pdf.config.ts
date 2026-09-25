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
};
