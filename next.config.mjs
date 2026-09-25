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
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
