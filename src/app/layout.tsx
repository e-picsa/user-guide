import { Provider } from '@/components/provider';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { baseOptions } from '@/lib/layout.shared';
import { CountryProvider } from '@/components/country-context';
import { CountrySwitcher } from '@/components/country-switcher';

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
          <CountryProvider>
            {/* Interactive picker: hidden in print so the PDF doesn't pay 46px
                on every page — worse, `#nd-docs-layout` is `min-height: 100dvh`
                and in print `dvh` is the paper height, so an offset layout box
                can never fit one sheet no matter how tall it grows. */}
            <div className="flex items-center justify-end gap-4 border-b border-fd-border px-4 py-2 print:hidden">
              <CountrySwitcher />
            </div>
            <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
              {children}
            </DocsLayout>
          </CountryProvider>
        </Provider>
      </body>
    </html>
  );
}
