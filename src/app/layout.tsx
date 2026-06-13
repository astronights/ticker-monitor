import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import PwaSetup from '@/components/PwaSetup';

export const metadata: Metadata = {
  title: 'Ticker Monitor',
  description: 'Personal ETF & commodity strategy monitor',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Alerts', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
        <PwaSetup />
      </body>
    </html>
  );
}
