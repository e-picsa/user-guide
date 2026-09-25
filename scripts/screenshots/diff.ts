import { existsSync, readFileSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  /** Fraction of pixels that differ (0..1). */
  ratio: number;
  diffPixels: number;
  width: number;
  height: number;
}

/**
 * Compare a fresh png buffer against the png stored at `filePath`.
 * Returns null when there is no meaningful baseline (missing file,
 * undecodable png, dimension change) — the caller should treat that as changed.
 */
export function diffAgainstFile(
  filePath: string,
  next: Uint8Array,
  pixelThreshold = 0.1,
): DiffResult | null {
  if (!existsSync(filePath)) return null;
  try {
    const prev = PNG.sync.read(readFileSync(filePath));
    const curr = PNG.sync.read(Buffer.from(next));
    if (prev.width !== curr.width || prev.height !== curr.height) return null;
    const diff = new PNG({ width: prev.width, height: prev.height });
    const diffPixels = pixelmatch(prev.data, curr.data, diff.data, prev.width, prev.height, {
      threshold: pixelThreshold,
    });
    return { ratio: diffPixels / (prev.width * prev.height), diffPixels, width: prev.width, height: prev.height };
  } catch {
    return null;
  }
}
