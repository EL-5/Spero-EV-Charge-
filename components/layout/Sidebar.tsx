'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Car, Zap, CreditCard, Wallet,
  AlertTriangle, Clock, BarChart3, FileText, UserCog,
  Settings, ChevronLeft, ChevronRight, LogOut, Bolt
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { useSettings } from '@/hooks/use-database';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'manager', 'accountant', 'finance', 'attendant'] },
  { href: '/drivers', label: 'Drivers', icon: Users, roles: ['super_admin', 'manager', 'attendant'] },
  { href: '/vehicles', label: 'Vehicles', icon: Car, roles: ['super_admin', 'manager', 'attendant'] },
  { href: '/sessions', label: 'Sessions', icon: Zap, roles: ['super_admin', 'manager', 'attendant'] },
  { href: '/payments', label: 'Payments', icon: CreditCard, roles: ['super_admin', 'manager', 'accountant', 'finance', 'attendant'] },
  { href: '/receipts', label: 'Receipts', icon: FileText, roles: ['super_admin', 'attendant'] },
  { href: '/wallets', label: 'Wallets', icon: Wallet, roles: ['super_admin', 'accountant', 'finance'] },
  { href: '/debts', label: 'Debts', icon: AlertTriangle, roles: ['super_admin', 'accountant', 'finance'] },
  { href: '/shifts', label: 'Shifts', icon: Clock, roles: ['super_admin', 'manager', 'attendant'] },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['super_admin', 'manager', 'finance', 'accountant'] },
  { href: '/reports', label: 'Reports', icon: FileText, roles: ['super_admin', 'manager', 'accountant', 'finance'] },
  { href: '/users', label: 'Users', icon: UserCog, roles: ['super_admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const { data: settings } = useSettings();

  const logoUrl = settings?.logo_url || '/spero-logo.png';
  const appName = settings?.app_name || 'SCMS';
  const stationName = settings?.company_name || 'Spero EV Charging';
  const primaryColor = settings?.primary_color || '#3b82f6';

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden bg-black/50 backdrop-blur-sm"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:static flex flex-col transition-all duration-300 transform 
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{
          width: sidebarOpen ? '240px' : '68px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex-shrink-0 w-8 h-8 relative">
          <img src={logoUrl} alt={appName} className="w-full h-full object-contain" />
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="text-white font-bold text-sm leading-tight">{appName}</div>
            <div className="text-slate-400 text-[10px] truncate uppercase tracking-tighter">{stationName}</div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto flex-shrink-0 text-slate-400 hover:text-white transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter(item => !user || item.roles.includes(user.role))
          .map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              title={!sidebarOpen ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: sidebarOpen ? '8px 10px' : '8px 18px',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: active ? 'white' : 'var(--sidebar-fg)',
                background: active ? `${primaryColor}33` : 'transparent',
                transition: 'all 0.15s',
                textDecoration: 'none',
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Icon size={17} style={{ flexShrink: 0, color: active ? primaryColor : 'inherit' }} />
              {sidebarOpen && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name.split(' ').map(n => n[0]).join('').slice(0,2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-xs font-medium truncate">{user?.name}</div>
              <div className="text-slate-400 text-xs capitalize">{user?.role.replace('_', ' ')}</div>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-white ml-auto" title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button onClick={logout} className="flex justify-center w-full text-slate-400 hover:text-white" title="Logout">
            <LogOut size={17} />
          </button>
        )}
      </div>
    </aside>
    </>
  );
}
