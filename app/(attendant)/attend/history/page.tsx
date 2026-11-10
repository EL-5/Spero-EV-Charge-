'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listMySessions, type HistoryFilter } from '@/app/actions/gun-sessions';
import { REVIEW_FLAG_LABEL } from '@/lib/gun-session';
import { formatClock, formatCurrency } from '@/lib/utils';

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => dayStr(new Date(Date.now() - n * 86_400_000));
const dayHeading = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const RANGES = [
  { id: 'today', label: 'Today', from: () => dayStr(new Date()) },
  { id: '7', label: '7 days', from: () => daysAgo(6) },
  { id: '30', label: '30 days', from: () => daysAgo(29) },
  { id: '90', label: '90 days', from: () => daysAgo(89) },
] as const;

/** Every session the signed-in attendant has recorded, newest first. */
export default function HistoryPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30');
  const [gun, setGun] = useState<NonNullable<HistoryFilter['gun']>>('all');
  const [status, setStatus] = useState<NonNullable<HistoryFilter['status']>>('all');

  const from = RANGES.find((r) => r.id === range)!.from();
  const to = dayStr(new Date());

  const q = useInfiniteQuery({
    queryKey: ['attend-history', range, from, gun, status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await listMySessions({ from, to, gun, status, before: pageParam });
      if (!res.success) throw new Error(res.error);
      return res;
    },
    getNextPageParam: (last) => (last.hasMore ? last.data[last.data.length - 1]?.startTime : undefined),
    refetchInterval: false,
    staleTime: 15_000,
  });

  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const totals = q.data?.pages[0]?.totals;

  const chip = (active: boolean) =>
    `min-h-[44px] rounded-full border px-4 text-sm transition ${active ? 'border-navy bg-navy font-semibold text-white' : 'border-line bg-white'}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="att-display text-[28px] font-bold">My history</h1>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)} aria-pressed={range === r.id} className={chip(range === r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select className="att-input" aria-label="Gun" value={gun} onChange={(e) => setGun(e.target.value as typeof gun)}>
            <option value="all">Both guns</option>
            <option value="A">Gun A</option>
            <option value="B">Gun B</option>
          </select>
          <select className="att-input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All sessions</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Waiting for payment</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Sessions', String(totals.sessions)],
            ['Energy', `${totals.kwh.toFixed(1)} kWh`],
            ['Collected', formatCurrency(totals.collected)],
            ['Not yet paid', formatCurrency(totals.unpaid)],
          ].map(([k, v]) => (
            <div key={k} className="att-card p-4">
              <div className="text-xs text-ink-soft">{k}</div>
              <div className="att-display text-xl font-bold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      )}
      {totals && totals.voided > 0 && <div className="text-sm text-ink-soft">{totals.voided} voided session{totals.voided === 1 ? '' : 's'} not counted above.</div>}

      {q.isLoading && <div className="py-12 text-center text-ink-soft">Loading…</div>}
      {q.error && <div className="att-card p-5 text-sm text-[#9b1c13]">{(q.error as Error).message}</div>}
      {!q.isLoading && !q.error && rows.length === 0 && <div className="att-card p-5 text-[15px] text-ink-soft">No sessions in this period.</div>}

      <div className="flex flex-col gap-1">
        {rows.map((s, i) => {
          const heading = i === 0 || rows[i - 1].startTime.slice(0, 10) !== s.startTime.slice(0, 10) ? dayHeading(s.startTime) : null;
          const state =
            s.status === 'cancelled'
              ? { text: 'Voided', cls: 'att-chip-bad' }
              : s.status === 'active'
                ? { text: 'Charging', cls: 'att-chip-mute' }
                : s.paymentStatus === 'paid'
                  ? { text: 'Paid', cls: 'att-chip-ok' }
                  : { text: 'Unpaid', cls: 'att-chip-warn' };
          return (
            <Fragment key={s.id}>
              {heading && <h2 className="att-display mt-3 text-base font-bold text-ink-soft">{heading}</h2>}
              <Link
                href={`/attend/session/${s.id}`}
                className="att-card flex min-h-[64px] flex-wrap items-center gap-x-3 gap-y-1 p-3.5 transition hover:border-navy sm:flex-nowrap"
              >
                <span className="att-display flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-navy text-lg font-bold text-brand-green">{s.gun}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{s.driverName}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {s.vehiclePlate || 'guest'} · {formatClock(s.startTime)}
                    {s.endTime ? ` to ${formatClock(s.endTime)}` : ''} · {s.receiptNumber}
                  </span>
                  {s.flags.includes('backdated') && <span className="block text-xs text-[#7a3b00]">{REVIEW_FLAG_LABEL.backdated}</span>}
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-semibold tabular-nums">{s.amount !== null ? formatCurrency(s.amount) : '—'}</span>
                  <span className="block text-xs tabular-nums text-ink-soft">{s.units !== null ? `${s.units.toFixed(1)} kWh` : ''}</span>
                </span>
                <span className={`att-chip ${state.cls}`}>{state.text}</span>
              </Link>
            </Fragment>
          );
        })}
      </div>

      {q.hasNextPage && (
        <button type="button" className="att-btn att-btn-ghost" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Loading…' : 'Show older sessions'}
        </button>
      )}
    </div>
  );
}
