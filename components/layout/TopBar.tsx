'use client';
import { Bell, Moon, Sun, Search, Wifi, WifiOff, Menu, LogOut } from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getRoleLabel, formatDateTime } from '@/lib/utils';
import { useNotifications, useSettings } from '@/hooks/use-database';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { darkMode, toggleDarkMode, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const { data: settings } = useSettings();
  const [showNotifications, setShowNotifications] = useState(false);
  const { data: notifications } = useNotifications(user?.id);
  const notificationRef = useRef<HTMLDivElement>(null);
  
  const primaryColor = settings?.primary_color || '#1d4ed8';

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
  };

  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header
      className="flex items-center gap-4 px-4 sm:px-6 py-4 border-b sticky top-0 z-30"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Mobile Menu Toggle */}
      <button 
        onClick={toggleSidebar}
        className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base sm:text-lg font-semibold truncate" style={{ color: 'var(--foreground)' }}>{title}</h1>
        {subtitle && <p className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>

      {/* Online indicator */}
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: isOnline ? 'var(--muted-foreground)' : '#ef4444' }}>
        {isOnline ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500 animate-pulse" />}
        <span className="hidden sm:inline">{isOnline ? 'Online' : 'Connection Lost'}</span>
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
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
              <div className="p-4 border-b flex items-center justify-between bg-slate-50">
                <span className="text-sm font-bold text-slate-800">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-[10px] font-bold text-blue-600 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {!notifications || notifications.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    <Bell size={24} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      className={`p-4 border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                      onClick={() => markAsRead(n.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          n.type === 'error' ? 'bg-red-500' : 
                          n.type === 'warning' ? 'bg-amber-500' : 
                          n.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold leading-tight mb-0.5 ${!n.isRead ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-normal mb-1.5">{n.message}</p>
                          <p className="text-[9px] text-slate-400 font-medium uppercase tracking-tighter">{formatDateTime(n.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: primaryColor }}
          >
            {user?.name.split(' ').map(n => n[0]).join('').slice(0,2)}
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-medium leading-tight" style={{ color: 'var(--foreground)' }}>{user?.name}</div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{user ? getRoleLabel(user.role) : ''}</div>
          </div>
          {/* Mobile Logout */}
          <button
            onClick={logout}
            className="p-2 ml-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors md:ml-2"
            title="Logout"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
