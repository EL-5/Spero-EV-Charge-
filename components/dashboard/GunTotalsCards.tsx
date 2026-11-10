'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGunTotals } from '@/app/actions/gun-sessions';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
] as const;

/**
 * Energy and sessions for Gun A, Gun B and both together.
 * Totals come from the readings attendants recorded, not from payments.
 */
export default function GunTotalsCards() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const { data, isLoading, error } = useQuery({
    queryKey: ['gun-totals', period],
    queryFn: async () => {
      const res = await getGunTotals(period);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 15000,
  });

  const kwh = (n: number | undefined) => (n ?? 0).toFixed(1);

  return (
    <section aria-label="Energy by gun" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
          Energy by gun
        </h2>
        <div className="flex rounded-xl p-1" style={{ background: 'var(--secondary)' }} role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className="min-h-[36px] rounded-lg px-4 text-sm transition"
              style={{
                background: period === p.id ? 'var(--card)' : 'transparent',
                color: 'var(--foreground)',
                fontWeight: period === p.id ? 600 : 400,
                boxShadow: period === p.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="stat-card text-sm" style={{ color: '#9b1c13' }}>{(error as Error).message}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(['A', 'B'] as const).map((g) => (
          <div key={g} className="stat-card">
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Gun {g}
            </div>
            <div className="mt-1 text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {isLoading ? '…' : `${kwh(data?.perGun[g].kwh)} kWh`}
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {isLoading ? '' : `${data?.perGun[g].sessions ?? 0} session${data?.perGun[g].sessions === 1 ? '' : 's'}`}
            </div>
          </div>
        ))}
        <div className="stat-card" style={{ background: 'var(--brand-green)', borderColor: 'var(--brand-green)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
            Both guns together
          </div>
          <div className="mt-1 text-3xl font-bold" style={{ color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>
            {isLoading ? '…' : `${kwh(data?.total.kwh)} kWh`}
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--navy)' }}>
            {isLoading ? '' : `${data?.total.sessions ?? 0} sessions · ${data?.total.done ?? 0} done · ${data?.total.charging ?? 0} charging`}
          </div>
        </div>
      </div>
    </section>
  );
}
