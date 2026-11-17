'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { listDriversForPicker } from '@/app/actions/gun-sessions';
import { DriverEditor } from '@/components/attend/DriverEditor';
import type { DriverMatch } from '@/lib/gun-session-types';
import { formatCurrency } from '@/lib/utils';

/** Find a driver and correct their details or cars. */
export default function AttendDriversPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery<DriverMatch[]>({
    queryKey: ['driver-list'],
    queryFn: async () => {
      const res = await listDriversForPicker();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: false,
  });

  const q = query.trim().toLowerCase();
  const shown = q
    ? data.filter((d) => d.name.toLowerCase().includes(q) || d.phone.toLowerCase().includes(q) || d.vehicles.some((v) => v.plate.toLowerCase().includes(q)))
    : data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="att-display text-[28px] font-bold">Drivers</h1>
      <input
        className="att-input"
        type="search"
        inputMode="search"
        placeholder="Search by name, phone or plate"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search drivers"
      />

      {isLoading && <div className="py-12 text-center text-ink-soft">Loading…</div>}
      {error && <div className="att-card p-5 text-sm text-[#9b1c13]">{(error as Error).message}</div>}
      {!isLoading && !error && shown.length === 0 && <div className="att-card p-5 text-[15px] text-ink-soft">No drivers match.</div>}

      <div className="flex flex-col gap-3">
        {shown.map((d) =>
          editingId === d.driverId ? (
            <DriverEditor
              key={d.driverId}
              driver={d}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                void qc.invalidateQueries({ queryKey: ['driver-list'] });
                void qc.invalidateQueries({ queryKey: ['driver-search'] });
              }}
            />
          ) : (
            <div key={d.driverId} className="att-card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="att-display flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#e3f1cc] text-base font-bold text-[#2f5a05]">
                {d.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{d.name}</div>
                <div className="truncate text-sm text-ink-soft">
                  {d.phone} · {d.vehicles.map((v) => v.plate).join(', ') || 'no car'}
                </div>
              </div>
              <span className="att-chip att-chip-ok">Wallet {formatCurrency(d.walletBalance).replace('GHS ', '')}</span>
              <button type="button" onClick={() => setEditingId(d.driverId)} className="att-btn att-btn-ghost !min-h-[48px] !rounded-2xl !px-4 !text-sm">
                <Pencil size={16} aria-hidden /> Edit
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
