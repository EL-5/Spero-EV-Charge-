import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SCMS — Spero EV Charging Management System',
  description: 'Offline-First EV Charging Operations ERP for African charging stations',
  manifest: '/manifest.json',
  icons: { icon: '/spero-logo.png' },
};

import QueryProvider from '@/components/providers/QueryProvider';
import AuthProvider from '@/components/providers/AuthProvider';
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased" suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster position="top-right" richColors closeButton />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
