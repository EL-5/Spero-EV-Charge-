'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  // Attendants record sessions in the tablet app (/attend). The management pages
  // for sessions, payments, receipts and shifts are closed to them; Drivers and
  // Vehicles stay open so they can still register someone.
  const attendantBlocked =
    user?.role === 'attendant' && !/^\/(drivers|vehicles)(\/|$)/.test(pathname);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login');
    } else if (isInitialized && attendantBlocked) {
      router.replace('/attend');
    }
  }, [isInitialized, isAuthenticated, attendantBlocked, router]);

  if (!isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium animate-pulse">Initializing SCMS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || attendantBlocked) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
