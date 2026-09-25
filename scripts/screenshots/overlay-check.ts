/**
 * Composite MDX-declared <Screenshot> markers onto the source pngs for review.
 *
 * Parses `markers={[...]}` + `src="..."` out of content/docs MDX files and
 * draws each marker as a filled badge with a crosshair through its exact
 * centre, so placement can be checked against the underlying UI.
 *
 * Run: bun scripts/screenshots/overlay-check.ts
 * Output: $TMPDIR/shots-overlay/<slug>__<n>.png (+ .json legend)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';

const DOCS = resolve(process.cwd(), 'content/docs');
const PUBLIC = resolve(process.cwd(), 'public');
const OUT = join(tmpdir(), 'shots-overlay');

/** Distinct badge fills per marker index (matches legend output). */
const PALETTE: Array<[number, number, number]> = [
  [194, 26, 211], // fuchsia (index 0)
  [234, 88, 12], // orange
  [37, 99, 235], // blue
  [22, 163, 74], // green
  [220, 38, 38], // red
  [124, 58, 237], // violet
];

interface Marker {
  x: number;
  y: number;
  label: string;
}

function globMdx(dir: string, out: string[] = []): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) globMdx(p, out);
    else if (e.endsWith('.mdx')) out.push(p);
  }
  return out;
}

function parseScreenshots(mdx: string): Array<{ src: string; markers: Marker[] }> {
  const found: Array<{ src: string; markers: Marker[] }> = [];
  const tagRe = /<Screenshot([\s\S]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(mdx))) {
    const body = m[1];
    const src = /src="([^"]+)"/.exec(body)?.[1];
    if (!src) continue;
    const markers: Marker[] = [];
    const markerRe = /\{\s*x:\s*([\d.]+)\s*,\s*y:\s*([\d.]+)\s*,\s*label:\s*'((?:[^'\\]|\\.)*)'/g;
    let mm: RegExpExecArray | null;
    while ((mm = markerRe.exec(body))) {
      markers.push({ x: Number(mm[1]), y: Number(mm[2]), label: mm[3] });
    }
    if (markers.length) found.push({ src, markers });
  }
  return found;
}

function setPx(png: PNG, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function drawBadge(png: PNG, cx: number, cy: number, fill: [number, number, number]): void {
  const R = 17;
  for (let y = cy - R - 5; y <= cy + R + 5; y++) {
    for (let x = cx - R - 5; x <= cx + R + 5; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R - 3) setPx(png, x, y, fill[0], fill[1], fill[2]);
      else if (d <= R) setPx(png, x, y, 255, 255, 255);
      else if (d <= R + 1.5) setPx(png, x, y, 20, 20, 20);
    }
  }
  // crosshair through the exact centre, extends past the badge
  for (let x = cx - R - 9; x <= cx + R + 9; x++) {
    setPx(png, x, cy, 20, 20, 20);
    setPx(png, x, cy - 1, 255, 255, 255);
    setPx(png, x, cy + 1, 255, 255, 255);
  }
  for (let y = cy - R - 9; y <= cy + R + 9; y++) {
    setPx(png, cx, y, 20, 20, 20);
    setPx(png, cx - 1, y, 255, 255, 255);
    setPx(png, cx + 1, y, 255, 255, 255);
  }
  setPx(png, cx, cy, 255, 255, 255);
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files = globMdx(DOCS);
  const legend: Record<string, Array<{ marker: number; x: number; y: number; label: string }>> = {};
  for (const file of files) {
    const mdx = readFileSync(file, 'utf8');
    const shots = parseScreenshots(mdx);
    const slug = relative(DOCS, file).replace(/\.mdx$/, '');
    shots.forEach(({ src, markers }, n) => {
      const pngPath = join(PUBLIC, src);
      const png = PNG.sync.read(readFileSync(pngPath));
      markers.forEach((mk, i) => {
        const cx = Math.round((mk.x / 100) * png.width);
        const cy = Math.round((mk.y / 100) * png.height);
        drawBadge(png, cx, cy, PALETTE[i % PALETTE.length]);
      });
      const outName = `${slug.replace(/\//g, '__')}__${n}.png`;
      const out = join(OUT, outName);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, PNG.sync.write(png));
      legend[outName] = markers.map((mk, i) => ({ marker: i + 1, x: mk.x, y: mk.y, label: mk.label }));
      console.log(`${relative(process.cwd(), file)} [${n}] -> ${out}`);
    });
  }
  writeFileSync(join(OUT, 'legend.json'), `${JSON.stringify(legend, null, 2)}\n`);
  void basename;
}

main();
