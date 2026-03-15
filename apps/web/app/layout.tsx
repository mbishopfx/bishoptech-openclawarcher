import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'TRD Agent Spawn / Ingest System',
  description: 'Cross-machine dashboard and orchestration system for OpenClaw fleet',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/trdlogoblue.webp',
    apple: '/trdlogoblue.webp',
  },
  appleWebApp: {
    capable: true,
    title: 'TRD Spawn',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#06b6d4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
