'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, House, LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

const ALLOWED_ROLES = ['attendant', 'manager', 'super_admin'];

/**
 * One shell for every screen size.
 *  - under 1024 px (phones, upright tablets): brand bar on top, tab bar with a
 *    raised "start" button at the bottom
 *  - 1024 px and up (tablets lying down): navy side rail, no bottom bar
 */
export default function AttendShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isInitialized, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) router.replace('/login');
    else if (user && !ALLOWED_ROLES.includes(user.role)) router.replace('/dashboard');
  }, [isInitialized, isAuthenticated, user, router]);

  if (!isInitialized || !isAuthenticated || !user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-navy text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
          <p className="text-sm font-medium">Opening Spero EV…</p>
        </div>
      </div>
    );
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const signOut = () => {
    if (confirm('Sign out of Spero EV?')) {
      logout();
      router.replace('/login');
    }
  };

  const items = [
    { href: '/attend', label: 'Home', Icon: House, active: pathname === '/attend' || pathname.startsWith('/attend/session') },
    { href: '/attend/shift', label: 'Shift', Icon: Clock, active: pathname.startsWith('/attend/shift') },
  ];

  return (
    <div className="min-h-dvh bg-ground text-navy lg:flex">
      {/* Side rail: tablets lying down and larger */}
      <nav aria-label="Main" className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[calc(104px+env(safe-area-inset-left,0px))] lg:flex-shrink-0 lg:flex-col lg:items-center lg:gap-2 lg:bg-navy lg:pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] lg:pl-[max(0.75rem,env(safe-area-inset-left,0px))] lg:pr-3 lg:pt-[calc(env(safe-area-inset-top,0px)+1.25rem)]">
        <span className="mb-3 flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spero-emblem.png" alt="Spero" className="h-11 w-11 object-contain" />
        </span>
        {items.map(({ href, label, Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex w-20 flex-col items-center gap-1.5 rounded-[18px] py-3.5 text-xs transition ${
              active ? 'bg-navy-2 font-semibold text-white shadow-[inset_3px_0_0_#76b918]' : 'text-[#d3dcec] hover:bg-navy-2/60'
            }`}
          >
            <Icon size={26} aria-hidden />
            {label}
          </Link>
        ))}
        <Link
          href="/attend/new"
          aria-label="Start a session"
          className="mt-2 flex w-20 flex-col items-center gap-1.5 rounded-[18px] bg-brand-green py-3.5 text-xs font-bold text-navy"
        >
          <Plus size={26} aria-hidden />
          Start
        </Link>
        <button
          type="button"
          onClick={signOut}
          aria-label={`Sign out ${user.name}`}
          className="att-display mt-auto flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-green text-lg font-bold text-navy"
        >
          {initials}
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {/* Brand bar: phones and upright tablets */}
        <header className="att-safe-top att-gutter flex items-center justify-between gap-3 pb-1 lg:hidden">
          <span className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spero-emblem.png" alt="Spero" className="h-11 w-11 object-contain" />
            <span>
              <span className="att-display block text-xl font-bold leading-tight">Spero EV</span>
              <span className="text-xs text-ink-soft">{user.name}</span>
            </span>
          </span>
          <button type="button" onClick={signOut} aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white">
            <LogOut size={18} aria-hidden />
          </button>
        </header>

        <main className="att-gutter mx-auto w-full max-w-[1280px] flex-1 py-4 sm:py-6 lg:py-8">{children}</main>
      </div>

      {/* Tab bar: phones and upright tablets */}
      <nav
        aria-label="Main"
        className="pb-safe att-gutter fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 items-end border-t border-line bg-white lg:hidden"
      >
        <Link href="/attend" aria-current={items[0].active ? 'page' : undefined} className={`flex h-20 flex-col items-center justify-center gap-1 text-[13px] ${items[0].active ? 'font-semibold text-brand-green-dark' : 'text-ink-soft'}`}>
          <House size={26} aria-hidden />
          Home
        </Link>
        <div className="flex justify-center">
          <Link
            href="/attend/new"
            aria-label="Start a session"
            className="-mt-7 mb-2 flex h-[68px] w-[68px] items-center justify-center rounded-full border-[5px] border-ground bg-brand-green text-navy"
          >
            <Plus size={30} strokeWidth={2.6} aria-hidden />
          </Link>
        </div>
        <Link href="/attend/shift" aria-current={items[1].active ? 'page' : undefined} className={`flex h-20 flex-col items-center justify-center gap-1 text-[13px] ${items[1].active ? 'font-semibold text-brand-green-dark' : 'text-ink-soft'}`}>
          <Clock size={26} aria-hidden />
          Shift
        </Link>
      </nav>
    </div>
  );
}
