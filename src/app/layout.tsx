import { Provider } from '@/components/provider';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Resolves relative OG image URLs (e.g. `/og/docs/...`) to absolute URLs.
  metadataBase: new URL('https://guide.picsa.app'),
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </Provider>
      </body>
    </html>
  );
}
