/**
 * Lint only the doc pages staged for the next commit, for the pre-commit hook.
 * The full-site equivalent is `bun run lint:md`, which CI runs.
 */
import { spawnSync } from 'node:child_process';

const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
  encoding: 'utf8',
});

if (staged.error || staged.status !== 0) {
  console.error('lint:md:staged: git diff --cached failed');
  process.exit(1);
}

const files = (staged.stdout ?? '').split('\0').filter((f) => /^content\/docs\/.*\.mdx$/.test(f));
if (files.length === 0) process.exit(0);

// `#` entries in the argument list drop the config's glob, so only these files run.
const result = spawnSync('bunx', ['markdownlint-cli2', '#content/docs/**/*.mdx', ...files], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
