'use client';
import { Bell, Moon, Sun, Search, Wifi, WifiOff } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getRoleLabel } from '@/lib/utils';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { darkMode, toggleDarkMode } = useUIStore();
  const { user } = useAuthStore();

  return (
    <header
      className="flex items-center gap-4 px-6 py-4 border-b"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h1>
        {subtitle && <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>

      {/* Online indicator */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        <Wifi size={14} className="text-green-500" />
        <span className="hidden sm:inline">Online</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--muted-foreground)' }}
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
        >
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'var(--muted-foreground)' }}
          title="Notifications"
        >
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        </button>
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--primary)' }}
          >
            {user?.name.split(' ').map(n => n[0]).join('').slice(0,2)}
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-medium leading-tight" style={{ color: 'var(--foreground)' }}>{user?.name}</div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{user ? getRoleLabel(user.role) : ''}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
