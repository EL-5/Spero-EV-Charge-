'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { startShift } from '@/app/actions/shifts';
import type { GunSessionSummary, WorkspaceData } from '@/lib/gun-session-types';
import { GUNS } from '@/lib/gun-session';
import { formatClock } from '@/lib/utils';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function elapsed(startIso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function shiftLength(startIso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function StartShiftBanner({ userId, onStarted }: { userId: string; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-[#fde7cc] p-4 text-[#7a3b00]">
      <div className="text-[15px] font-medium">
        <b>You have no open shift.</b> Start one before you record sessions.
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await startShift(userId);
          setBusy(false);
          if (res.success) {
            toast.success('Shift started');
            onStarted();
          } else toast.error(res.error);
        }}
        className="att-btn att-btn-dark !min-h-[48px] !rounded-2xl !text-sm"
      >
        {busy ? 'Starting…' : 'Start shift'}
      </button>
    </div>
  );
}

export function Hero({ ws }: { ws: WorkspaceData }) {
  const { today } = ws;
  const paidShare = today.sessions > 0 ? today.paid / today.sessions : 0;
  const C = 2 * Math.PI * 36;
  return (
    <section className="flex flex-col gap-4 rounded-[30px] bg-navy p-5 text-white sm:p-6">
      <div className="flex justify-between text-sm text-[#a9bbd9]">
        <span>Today so far</span>
        <span>{new Date().toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="att-display text-[56px] font-bold leading-none text-brand-green">{today.kwh.toFixed(1)}</div>
          <div className="mt-1.5 text-[15px] text-[#d3dcec]">
            kWh from both guns · {today.sessions} session{today.sessions === 1 ? '' : 's'}
          </div>
        </div>
        <div className="relative h-[92px] w-[92px] flex-shrink-0" role="img" aria-label={`${today.paid} of ${today.sessions} sessions paid`}>
          <svg width="92" height="92" viewBox="0 0 92 92" className="block">
            <circle cx="46" cy="46" r="36" fill="none" stroke="#3b5a91" strokeWidth="9" />
            <circle
              cx="46"
              cy="46"
              r="36"
              fill="none"
              stroke="#76b918"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${C * paidShare} ${C}`}
              transform="rotate(-90 46 46)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="att-display text-xl font-bold leading-none">
              {today.paid}/{today.sessions}
            </div>
            <div className="text-[11px] text-[#a9bbd9]">paid</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GUNS.map((g) => (
          <div key={g} className="rounded-[18px] bg-navy-2 px-4 py-3">
            <div className="text-[13px] text-[#a9bbd9]">Gun {g}</div>
            <div className="att-display text-2xl font-bold">{today.perGun[g].kwh.toFixed(1)} kWh</div>
            <div className="text-[13px] text-[#d3dcec]">
              {today.perGun[g].sessions} session{today.perGun[g].sessions === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InProgress({ items, ws, now }: { items: GunSessionSummary[]; ws: WorkspaceData; now: number }) {
  const freeGuns = GUNS.filter((g) => !ws.guns[g].inUse);
  const othersUse = GUNS.filter((g) => ws.guns[g].inUse && !items.some((i) => i.gun === g));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="att-display text-xl font-bold">In progress</h2>
        <span className="att-chip att-chip-ok">{items.length} charging</span>
      </div>
      {items.map((s) => (
        <Link
          key={s.id}
          href={`/attend/session/${s.id}`}
          className="att-card flex flex-wrap items-center gap-x-4 gap-y-3 p-4 transition hover:border-navy sm:flex-nowrap"
        >
          <div className="att-display flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-navy text-xl font-bold text-brand-green">
            {s.gun}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold">{s.driverName}</div>
            <div className="truncate text-sm text-ink-soft">
              Gun {s.gun} · {s.vehiclePlate || 'guest'} · since {formatClock(s.startTime)}
            </div>
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <span className="att-display text-2xl font-bold tabular-nums">{elapsed(s.startTime, now)}</span>
            <span className="att-btn att-btn-primary !min-h-[48px] !rounded-2xl !px-5 !text-base">Finish</span>
          </div>
        </Link>
      ))}
      {othersUse.map((g) => (
        <div key={g} className="rounded-[26px] border border-line bg-[#e8ecf2] p-4 text-sm text-ink-soft">
          Gun {g} is in use on another attendant’s shift.
        </div>
      ))}
      {freeGuns.length > 0 && (
        <div className="flex items-center gap-4 rounded-[26px] border-2 border-dashed border-[#a9bbd9] p-4 text-ink-soft">
          <div className="att-display flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#e8ecf2] text-xl font-bold text-navy">
            {freeGuns.map((g) => g).join('·')}
          </div>
          <div className="text-[15px]">
            <b className="text-navy">{freeGuns.length === 2 ? 'Both guns are free.' : `Gun ${freeGuns[0]} is free.`}</b> Plug the next car in, then start a session.
          </div>
        </div>
      )}
    </section>
  );
}

export function DoneToday({ items }: { items: GunSessionSummary[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="att-display text-xl font-bold">Done today</h2>
      {items.length === 0 ? (
        <div className="att-card p-5 text-[15px] text-ink-soft">Nothing finished yet today.</div>
      ) : (
        <div className="att-card overflow-hidden">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/attend/session/${s.id}`}
              className="flex min-h-[60px] items-center gap-3 border-b border-line px-4 py-3 text-[15px] last:border-b-0 hover:bg-ground"
            >
              <span className="w-14 flex-shrink-0 whitespace-nowrap text-sm text-ink-soft">{formatClock(s.endTime || s.startTime)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{s.driverName}</span>
              <span className="hidden text-sm text-ink-soft sm:inline">
                Gun {s.gun} · {(s.units ?? 0).toFixed(1)} kWh
              </span>
              <span className={`att-chip ${s.paymentStatus === 'paid' ? 'att-chip-ok' : 'att-chip-warn'}`}>
                {s.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
