'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Wallet, History, User } from 'lucide-react';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Charge', href: '/driver/dashboard', icon: Home },
    { label: 'Wallet', href: '/driver/wallet', icon: Wallet },
    { label: 'History', href: '/driver/history', icon: History },
    { label: 'Profile', href: '/driver/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] pb-20 md:pb-0 md:pl-20 text-[#f8fafc] flex flex-col md:flex-row">
      
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[#1e293b]/90 backdrop-blur-md border-t border-[#334155] z-50 md:hidden flex justify-around p-3 pb-safe">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link 
              key={item.label} 
              href={item.href}
              className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
                isActive ? 'text-blue-400' : 'text-[#94a3b8] hover:text-[#cbd5e1]'
              }`}
            >
              <Icon size={24} className={isActive ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]' : ''} />
              <span className="text-[10px] font-bold mt-1 tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex fixed top-0 left-0 h-screen w-24 bg-[#1e293b] border-r border-[#334155] flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20 mb-4">
          S
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link 
              key={item.label} 
              href={item.href}
              className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                isActive ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-[#94a3b8] hover:bg-[#334155]/50'
              }`}
            >
              <Icon size={24} className={isActive ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]' : ''} />
              <span className="text-[10px] font-bold mt-2 tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 w-full max-w-lg mx-auto md:max-w-4xl p-4 md:p-8 pt-6">
        {children}
      </main>
    </div>
  );
}
