/**
 * Spellcheck only the doc pages staged for the next commit.
 *
 * Wired up as the pre-commit hook (`.husky/pre-commit` -> `bun run
 * spellcheck:staged`) so a typo can never be committed. The full-site
 * equivalent is `bun run spellcheck`.
 *
 * cspell has no notion of the index, so the staged list is resolved here:
 * `git diff --cached --name-only --diff-filter=ACMR`, filtered to the checked
 * surface (the `content/docs` mdx glob, matching the `spellcheck` script).
 * Renames come back as the new path, and copied entries and mode-only changes
 * are dropped — that is what the `ACMR` filter means. Commits with no staged
 * doc pages exit 0 without spawning cspell at all.
 *
 * The files are checked exactly as they are in the index: no temp copies, no
 * stash, so what gets verified is what gets committed.
 */
import { spawnSync } from 'node:child_process';

/** The spellchecked surface, per the `spellcheck` package script. */
const CHECKED = /\.mdx$/;
const IN_CONTENT = /^content\/docs\/.*\.mdx$/;

const staged = spawnSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
  { encoding: 'utf8' },
);

if (staged.error) {
  console.error(`spellcheck:staged: git failed (${staged.error.message})`);
  process.exit(1);
}
if (staged.status !== 0) {
  console.error('spellcheck:staged: git diff --cached failed');
  process.exit(1);
}

const files = (staged.stdout ?? '')
  .split('\0')
  .filter((f) => CHECKED.test(f) && IN_CONTENT.test(f));

if (files.length === 0) {
  process.exit(0);
}

console.log(`spellcheck: ${files.length} staged doc page(s) — ${files.join(', ')}`);

const cspell = spawnSync('bunx', ['cspell', '--no-progress', ...files], {
  stdio: 'inherit',
});

if (cspell.error) {
  console.error(`spellcheck:staged: could not run cspell (${cspell.error.message})`);
  process.exit(1);
}
process.exit(cspell.status ?? 1);
