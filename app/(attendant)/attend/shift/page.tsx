'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { EyeOff, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { closeShift, getMyShift, startShift } from '@/app/actions/shifts';
import { useRefreshAttend } from '@/components/attend/use-workspace';
import { ACCEPT_CASH, DENOMINATIONS, sumCashCount } from '@/lib/gun-session';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

/**
 * Shift start and the BLIND cash count.
 * The expected cash is never sent to this screen: the attendant counts what is
 * in the drawer, and a manager sees the difference afterwards.
 */
export default function ShiftPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const refresh = useRefreshAttend();
  const qc = useQueryClient();
  const { data: shift, error: shiftError } = useQuery({
    queryKey: ['my-shift'],
    queryFn: async () => {
      const res = await getMyShift();
      if (!res.success) throw new Error(res.error);
      return res.shift;
    },
    refetchInterval: 10_000,
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  if (shiftError) return <div className="att-card mx-auto max-w-md p-6 text-sm text-[#9b1c13]">{(shiftError as Error).message}</div>;
  if (shift === undefined) return <div className="py-20 text-center text-ink-soft">Loading…</div>;

  const coinValue = Number(coins.replace(/[^\d.]/g, '')) || 0;
  const total = sumCashCount(counts, coinValue);
  const step = (d: number, delta: number) =>
    setCounts((c) => ({ ...c, [String(d)]: Math.max(0, (c[String(d)] || 0) + delta) }));

  if (!shift) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <h1 className="att-display text-[28px] font-bold">Shift</h1>
        <div className="att-card flex flex-col gap-4 p-6">
          <p className="text-[15px] text-ink-soft">You have no open shift. Start one to begin recording sessions.</p>
          <button
            type="button"
            disabled={busy}
            className="att-btn att-btn-primary !min-h-[62px] text-lg"
            onClick={async () => {
              setBusy(true);
              const res = await startShift(user.id);
              setBusy(false);
              if (!res.success) return toast.error(res.error);
              toast.success('Shift started');
              await qc.invalidateQueries({ queryKey: ['my-shift'] });
              await refresh();
              router.push('/attend');
            }}
          >
            {busy ? 'Starting…' : 'Start my shift'}
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    const res = await closeShift(shift.id, total, notes);
    setBusy(false);
    if (!res.success) return toast.error(res.error);
    toast.success('Shift closed. Thank you.');
    await qc.invalidateQueries({ queryKey: ['my-shift'] });
    await refresh();
    router.push('/attend');
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="att-display text-[28px] font-bold">Close your shift</h1>
        <span className="att-chip att-chip-mute">
          {shift.sessions} session{shift.sessions === 1 ? '' : 's'} · {shift.kwh.toFixed(1)} kWh
        </span>
      </div>

      {shift.openSessions > 0 && (
        <div role="alert" className="rounded-[22px] bg-[#fde7cc] p-4 text-[15px] font-medium text-[#7a3b00]">
          {shift.openSessions} session{shift.openSessions === 1 ? ' is' : 's are'} still charging or waiting for payment. Finish {shift.openSessions === 1 ? 'it' : 'them'}{' '}
          before you close the shift.
        </div>
      )}

      {!ACCEPT_CASH && (
        <div className="att-card flex flex-col gap-2 p-5 text-[15px]">
          <b>No cash to count.</b>
          <span className="text-ink-soft">
            The station takes MoMo and wallet only. Closing your shift confirms {shift.sessions} session{shift.sessions === 1 ? '' : 's'} and {shift.kwh.toFixed(1)} kWh.
            Every session must be paid first.
          </span>
        </div>
      )}

      {ACCEPT_CASH && (
      <div className="flex items-start gap-3 rounded-[22px] bg-[#e3f1cc] p-4 text-[#2f5a05]">
        <EyeOff size={22} className="mt-0.5 flex-shrink-0" aria-hidden />
        <div className="text-[15px] leading-snug">
          <b>Count first, then submit.</b> The expected cash is hidden so the count is honest. A manager reviews any difference.
        </div>
      </div>
      )}

      {ACCEPT_CASH && (
      <section className="att-card overflow-hidden">
        <h2 className="att-display px-5 pb-2 pt-5 text-lg font-bold">Cash in your drawer</h2>
        {DENOMINATIONS.map((d) => {
          const n = counts[String(d)] || 0;
          return (
            <div key={d} className="flex min-h-[64px] items-center gap-2 border-t border-line px-5">
              <span className="w-20 text-base font-semibold">GHS {d}</span>
              <div className="ml-auto flex items-center">
                <button type="button" aria-label={`Fewer ${d} notes`} onClick={() => step(d, -1)} className="flex h-12 w-12 items-center justify-center rounded-full text-navy active:bg-ground">
                  <Minus size={22} />
                </button>
                <span className="w-10 text-center text-xl font-semibold tabular-nums">{n}</span>
                <button type="button" aria-label={`More ${d} notes`} onClick={() => step(d, 1)} className="flex h-12 w-12 items-center justify-center rounded-full text-brand-green-dark active:bg-ground">
                  <Plus size={22} />
                </button>
              </div>
              <span className="w-24 text-right text-sm tabular-nums text-ink-soft">{(n * d).toFixed(2)}</span>
            </div>
          );
        })}
        <div className="flex min-h-[64px] items-center gap-3 border-t border-line px-5">
          <label htmlFor="coins" className="w-20 text-base font-semibold">
            Coins
          </label>
          <input
            id="coins"
            inputMode="decimal"
            value={coins}
            onChange={(e) => setCoins(e.target.value)}
            placeholder="0.00"
            className="att-input !min-h-[48px] ml-auto !w-32 text-right"
          />
        </div>
      </section>
      )}

      {ACCEPT_CASH && (
      <div className="flex items-baseline justify-between rounded-[26px] bg-navy px-6 py-5 text-white">
        <span className="text-[15px] text-[#a9bbd9]">You counted</span>
        <span className="att-display text-4xl font-bold text-brand-green">{formatCurrency(total)}</span>
      </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="notes" className="text-sm font-semibold">
          Notes <span className="font-normal text-ink-soft">optional</span>
        </label>
        <textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="att-input !min-h-0 py-3"
          placeholder="Anything the manager should know about this shift"
        />
      </div>

      <button type="button" onClick={submit} disabled={busy || shift.openSessions > 0} className="att-btn att-btn-primary !min-h-[62px] text-lg">
        {busy ? 'Closing…' : ACCEPT_CASH ? 'Submit count and close shift' : 'Close my shift'}
      </button>
      {ACCEPT_CASH && <p className="text-center text-sm text-ink-soft">You cannot edit the count after submitting.</p>}
    </div>
  );
}
