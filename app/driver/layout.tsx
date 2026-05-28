'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Zap, Wallet, History, User } from 'lucide-react';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Charge', href: '/driver/dashboard', icon: Zap },
    { label: 'Wallet', href: '/driver/wallet', icon: Wallet },
    { label: 'History', href: '/driver/history', icon: History },
    // { label: 'Profile', href: '/driver/profile', icon: User }, // Keep commented until Profile page is built
  ];

  return (
    <div className="min-h-screen bg-black pb-24 md:pb-0 md:pl-28 text-slate-100 flex flex-col md:flex-row font-sans selection:bg-cyan-500/30">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] mix-blend-screen opacity-50"></div>
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      {/* Mobile Bottom Navigation - Glassmorphic floating pill */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-50 md:hidden">
        <nav className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-2 flex justify-around shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] shadow-cyan-500/5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link 
                key={item.label} 
                href={item.href}
                className={`relative flex flex-col items-center p-3 rounded-2xl transition-all duration-300 w-16 ${
                  isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 rounded-2xl -z-10 animate-fade-in"></div>
                )}
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] text-cyan-400' : ''} />
                <span className={`text-[9px] font-black mt-1.5 tracking-widest uppercase transition-all duration-300 ${isActive ? 'text-cyan-100 opacity-100' : 'opacity-0 h-0 mt-0 overflow-hidden'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex fixed top-0 left-0 h-screen w-28 bg-slate-900/50 backdrop-blur-3xl border-r border-white/5 flex-col items-center py-10 gap-8 z-50">
        <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-[0_0_30px_rgba(34,211,238,0.3)] mb-8">
          S
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link 
              key={item.label} 
              href={item.href}
              className={`relative flex flex-col items-center p-4 rounded-2xl transition-all duration-300 w-20 group ${
                isActive ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl -z-10 shadow-[0_0_20px_rgba(34,211,238,0.1)]"></div>
              )}
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]' : 'group-hover:scale-110 transition-transform'} />
              <span className={`text-[10px] font-black mt-2 tracking-widest uppercase ${isActive ? 'text-cyan-200' : ''}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="relative z-10 flex-1 w-full max-w-md mx-auto md:max-w-5xl p-5 md:p-10 pt-8">
        {children}
      </main>
    </div>
  );
}
