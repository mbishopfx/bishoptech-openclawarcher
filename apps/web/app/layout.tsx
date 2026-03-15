import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OpenClaw Agent Command Center',
  description: 'Cross-machine dashboard and orchestration system for OpenClaw fleet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
