import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Static export for GitHub Pages (no Node.js server).
  // NOTE: keep `basePath` unset (root `/`). The custom domain
  // (guide.picsa.app) serves the site at `/`, and GitHub redirects the
  // project URL (e-picsa.github.io/user-guide) to the custom domain once
  // the CNAME/DNS is configured — so both URLs keep working with one build.
  // Setting `basePath: '/user-guide'` would fix the project URL but break
  // the custom domain, so don't.
  output: 'export',
  // NOTE: keep `distDir` unset (default `.next`). With `output: 'export'`, a
  // custom distDir is not a private build cache — Next relocates the *export
  // output* to it and forces build artifacts back to `.next`, so setting one
  // would move the print build's `out/` somewhere the PDF server doesn't look
  // without isolating anything. The PDF print build (`PDF_PRINT=1`) therefore
  // writes to the default `out/`, and CI builds it in its own job/checkout so
  // print-mode (fully expanded) HTML can never reach the Pages build. Locally,
  // `rm -rf .next out` between a print build and a site build.
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
