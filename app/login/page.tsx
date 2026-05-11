'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Zap, Eye, EyeOff, Loader2, Activity, Clock, Users, DollarSign } from 'lucide-react';
import { useDashboardStats, useShifts } from '@/hooks/use-database';
import { formatCurrency } from '@/lib/utils';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const { data: liveStats } = useDashboardStats();
  const { data: shifts } = useShifts();
  const activeShiftsCount = shifts?.filter((s: any) => s.status === 'active').length || 0;
  
  const stats = [
    { label: 'Sessions Today', value: (liveStats?.totalSessions || 0).toString() },
    { label: 'Revenue Today', value: formatCurrency(liveStats?.revenueToday || 0) },
    { label: 'Active Shifts', value: activeShiftsCount.toString() },
    { label: 'kWh Sold Today', value: (liveStats?.unitsSoldToday || 0).toFixed(1) },
  ];
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await login(email, password);
    if (ok) {
      router.push('/dashboard');
    } else {
      setError('Invalid credentials. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-2/5 p-12"
        style={{ background: '#1e293b' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-12">
            <Image src="/spero-logo.png" alt="SPERO" width={48} height={48} className="object-contain" />
            <div>
              <div className="text-white font-bold text-xl">SCMS</div>
              <div className="text-slate-400 text-sm">Spero Energy Resources</div>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            EV Charging<br />Operations ERP
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            Offline-first management platform for African EV charging stations. Record sessions, manage wallets, and track revenue — with or without internet.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="text-slate-400 text-xs mb-1">{stat.label}</div>
              <div className="text-white font-bold text-lg">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <Image src="/spero-logo.png" alt="SPERO" width={40} height={40} className="object-contain" />
            <div>
              <div className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>SCMS</div>
              <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Spero EV Charging</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Welcome back</h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Sign in to your SCMS account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@spero.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingRight: '40px' }}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full justify-center text-base py-3"
              style={{ borderRadius: '10px', width: '100%' }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
