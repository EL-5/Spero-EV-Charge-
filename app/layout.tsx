import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SCMS — Spero EV Charging Management System',
  description: 'Offline-First EV Charging Operations ERP for African charging stations',
  manifest: '/manifest.json',
  icons: { icon: '/spero-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
