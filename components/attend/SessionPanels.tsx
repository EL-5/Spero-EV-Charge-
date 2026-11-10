'use client';

import { useState } from 'react';
import { Lock, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { collectGunPayment, finishGunSession } from '@/app/actions/gun-sessions';
import {
  ACCEPT_CASH,
  REVIEW_FLAG_LABEL,
  computeBill,
  endReadingProblem,
  evaluateFlags,
  parseReading,
  type MomoNetwork,
  type PayChoice,
} from '@/lib/gun-session';
import type { GunSessionView } from '@/lib/gun-session-types';
import { formatClock, formatCurrency, formatDateTime } from '@/lib/utils';
import PhotoCapture from './PhotoCapture';

const kwh = (n: number) => `${n.toFixed(1)} kWh`;

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="att-display flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-bold text-brand-green">{n}</span>
      <h2 className="att-display text-[22px] font-bold">{children}</h2>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[15px]">
      <span className="text-ink-soft">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}

// ── Finish ───────────────────────────────────────────────────────────────────

export function FinishPanel({ session, onChanged }: { session: GunSessionView; onChanged: () => void }) {
  const [reading, setReading] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const finished = session.status !== 'active';
  const parsed = parseReading(reading);
  const problem = parsed !== null ? endReadingProblem(session.startReading, parsed) : null;
  const preview = parsed !== null && !problem ? computeBill(session.startReading, parsed, session.rate) : null;
  const previewFlags = preview
    ? evaluateFlags({ startGap: null, units: preview.units, batteryKwh: session.batteryKwh, startedAt: new Date(session.startTime), endedAt: new Date() })
    : [];
  const canSubmit = !!preview && !!photo && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('sessionId', session.id);
    fd.set('endReading', String(parsed));
    fd.set('photo', photo!);
    const res = await finishGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Session finished: ${kwh(res.units)} · ${formatCurrency(res.amount)}`);
    onChanged();
  };

  return (
    <section aria-label="Finish the session" className="att-card flex flex-col gap-4 p-5 sm:p-6">
      <StepTitle n={1}>Finish the session</StepTitle>

      <div className="flex flex-col gap-2 rounded-[20px] bg-ground p-4">
        <Row k="Driver" v={`${session.driverName}${session.vehiclePlate ? ` · ${session.vehiclePlate}` : ''}`} />
        <Row
          k={`Gun ${session.gun} start · ${formatClock(session.startTime)}`}
          v={
            <span className="inline-flex items-center gap-1.5">
              <Lock size={13} aria-hidden /> {kwh(session.startReading)}
            </span>
          }
        />
      </div>

      {finished ? (
        <>
          <div className="flex flex-col gap-2 rounded-[20px] bg-ground p-4">
            <Row k={`Gun ${session.gun} end`} v={session.endReading !== null ? kwh(session.endReading) : '—'} />
          </div>
          <BillCard units={session.units ?? 0} rate={session.rate} amount={session.amount ?? 0} />
          {session.flags.length > 0 && (
            <div className="rounded-2xl bg-[#fde7cc] p-4 text-sm font-medium text-[#7a3b00]">
              A manager will look at this session:
              <ul className="mt-1 list-disc pl-5">
                {session.flags.map((f) => (
                  <li key={f}>{REVIEW_FLAG_LABEL[f]}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="end-reading" className="text-sm font-semibold">
              End reading <span className="font-normal text-ink-soft">Gun {session.gun}, after charging</span>
            </label>
            <div className="flex items-baseline justify-between rounded-[22px] border-2 border-navy bg-white px-4 py-2">
              <input
                id="end-reading"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                value={reading}
                onChange={(e) => setReading(e.target.value.replace(/[^\d.,]/g, ''))}
                className="att-display min-w-0 flex-1 bg-transparent text-[38px] font-bold outline-none"
              />
              <span className="text-sm font-semibold text-ink-soft">kWh</span>
            </div>
            {problem && (
              <div role="alert" className="rounded-2xl bg-[#ffe3df] p-3 text-sm font-medium text-[#9b1c13]">
                {problem}
              </div>
            )}
          </div>

          <PhotoCapture label="Display photo" file={photo} onChange={setPhoto} disabled={submitting} />

          {preview && (
            <>
              <BillCard units={preview.units} rate={session.rate} amount={preview.amount} preview />
              <div className="flex flex-col gap-1.5 text-sm">
                <Check ok>Higher than the start reading</Check>
                {session.batteryKwh && (
                  <Check ok={!previewFlags.includes('exceeds_battery')}>
                    {previewFlags.includes('exceeds_battery')
                      ? `${kwh(preview.units)} is more than a ${session.batteryKwh} kWh battery can hold. A manager will review it.`
                      : `${kwh(preview.units)} fits a ${session.batteryKwh} kWh battery`}
                  </Check>
                )}
                <Check ok={!previewFlags.includes('impossible_power')}>
                  {previewFlags.includes('impossible_power')
                    ? 'This is more energy than the machine can deliver in that time. A manager will review it.'
                    : 'The amount of energy is realistic for the time'}
                </Check>
              </div>
            </>
          )}

          <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
            {submitting ? 'Saving…' : 'Finish and work out the bill'}
          </button>
          {!photo && preview && <div className="-mt-1 text-center text-sm text-ink-soft">Take the display photo to continue.</div>}
        </>
      )}
    </section>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className={`font-bold ${ok ? 'text-brand-green-dark' : 'text-brand-orange'}`}>{ok ? '✓' : '!'}</span>
      <span>{children}</span>
    </div>
  );
}

function BillCard({ units, rate, amount, preview }: { units: number; rate: number; amount: number; preview?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-[26px] bg-navy p-5 text-white">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-[#a9bbd9]">Energy delivered</div>
          <div className="att-display text-[40px] font-bold leading-none text-brand-green">{kwh(units)}</div>
        </div>
        <div className="text-right text-xs text-[#a9bbd9]">
          Rate when started
          <div className="mt-0.5 text-base font-semibold text-white">GHS {rate.toFixed(2)} / kWh</div>
        </div>
      </div>
      <div className="h-px bg-navy-3" />
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-[#d3dcec]">{preview ? 'Amount (the system confirms it)' : 'Amount to collect'}</span>
        <span className="att-display text-4xl font-bold">{formatCurrency(amount)}</span>
      </div>
    </div>
  );
}

// ── Collect ──────────────────────────────────────────────────────────────────

const NETWORKS: { id: MomoNetwork; label: string }[] = [
  { id: 'mtn', label: 'MTN' },
  { id: 'telecel', label: 'Telecel' },
  { id: 'airteltigo', label: 'AirtelTigo' },
];

export function CollectPanel({ session, onChanged }: { session: GunSessionView; onChanged: () => void }) {
  const [method, setMethod] = useState<PayChoice>(ACCEPT_CASH ? 'cash' : 'momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ready = session.status === 'pending_payment';
  const amount = session.amount ?? 0;
  const walletOk = session.walletBalance !== null && session.walletBalance >= amount;
  const refOk = method !== 'momo' || reference.replace(/\s+/g, '').length >= 6;
  const canSubmit = ready && refOk && (method !== 'wallet' || walletOk) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await collectGunPayment({ sessionId: session.id, method, network, reference });
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Payment recorded: ${formatCurrency(res.amount)}`);
    onChanged();
  };

  return (
    <section aria-label="Collect payment" className={`att-card flex flex-col gap-4 p-5 sm:p-6 ${ready ? '' : 'opacity-60'}`}>
      <StepTitle n={2}>Collect payment</StepTitle>

      <div className="flex items-center justify-between gap-3 rounded-[22px] bg-ground p-4">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink-soft">
            <Lock size={13} aria-hidden /> Set by the system
          </div>
          <div className="att-display text-[38px] font-bold leading-tight">{ready ? formatCurrency(amount) : '—'}</div>
        </div>
        <span className="att-chip att-chip-mute">{session.driverName}</span>
      </div>

      {!ready && <div className="text-sm text-ink-soft">Finish the session first, so the amount can be worked out.</div>}

      <fieldset disabled={!ready || submitting} className="flex flex-col gap-4 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold">How did the driver pay?</legend>
        <div className={`grid gap-2.5 ${ACCEPT_CASH ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {(['cash', 'momo', 'wallet'] as PayChoice[]).filter((m) => ACCEPT_CASH || m !== 'cash').map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              disabled={m === 'wallet' && session.walletBalance === null}
              className={`min-h-[60px] rounded-[18px] border-2 text-[17px] transition disabled:opacity-40 ${
                method === m ? 'border-navy bg-[#e3f1cc] font-semibold text-[#2f5a05]' : 'border-line bg-white font-medium'
              }`}
            >
              {m === 'cash' ? 'Cash' : m === 'momo' ? 'MoMo' : 'Wallet'}
            </button>
          ))}
        </div>

        {method === 'momo' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setNetwork(n.id)}
                  aria-pressed={network === n.id}
                  className={`min-h-[44px] rounded-full border px-4 text-sm ${network === n.id ? 'border-navy bg-navy font-semibold text-white' : 'border-line bg-white'}`}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <label htmlFor="momo-ref" className="text-sm font-semibold">
              MoMo transaction ID <span className="text-[#9b1c13]">required</span>
            </label>
            <input
              id="momo-ref"
              className="att-input font-mono"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="From the driver’s payment SMS"
            />
            <div className="text-[13px] text-ink-soft">Each MoMo ID can be used once. A manager can match it to the statement.</div>
          </div>
        )}

        {method === 'wallet' && (
          <div className={`rounded-2xl p-3 text-sm font-medium ${walletOk ? 'bg-[#e3f1cc] text-[#2f5a05]' : 'bg-[#ffe3df] text-[#9b1c13]'}`}>
            {session.walletBalance === null
              ? 'Guests do not have a wallet.'
              : walletOk
                ? `Wallet balance ${formatCurrency(session.walletBalance)}. After payment: ${formatCurrency(session.walletBalance - amount)}.`
                : `Wallet balance ${formatCurrency(session.walletBalance)} is too low. Choose cash or MoMo, or ask a manager to approve a top-up.`}
          </div>
        )}
      </fieldset>

      <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[66px] text-xl">
        {submitting ? 'Recording…' : ready ? `I received ${formatCurrency(amount)}` : 'Waiting for the bill'}
      </button>
      <div className="text-center text-sm text-ink-soft">Saved with your name and the time.</div>
    </section>
  );
}

// ── Receipt ──────────────────────────────────────────────────────────────────

export function ReceiptCard({ session, onNew }: { session: GunSessionView; onNew: () => void }) {
  const method =
    session.paymentMethod === 'cash'
      ? 'Cash'
      : session.paymentMethod === 'wallet'
        ? 'Wallet'
        : session.paymentMethod
          ? `MoMo (${session.paymentMethod.toUpperCase()})`
          : '—';

  return (
    <section aria-label="Receipt" className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-green">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1b3a6b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="att-display text-3xl font-bold">Session recorded</h2>
        <p className="text-[15px] text-ink-soft">Payment saved. This session is closed.</p>
      </div>

      <div className="att-card print-visible flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spero-emblem.png" alt="" className="h-7 w-7 object-contain" />
            <span className="att-display text-[17px] font-bold">Spero EV</span>
          </span>
          <span className="text-[13px] text-ink-soft">
            {session.receiptNumber} · {session.endTime ? formatDateTime(session.endTime) : ''}
          </span>
        </div>
        <div className="h-px bg-line" />
        <Row k="Driver" v={session.driverName} />
        {session.vehiclePlate && <Row k="Vehicle" v={session.vehiclePlate} />}
        <Row k="Gun and time" v={`Gun ${session.gun} · ${formatClock(session.startTime)}${session.endTime ? ` to ${formatClock(session.endTime)}` : ''}`} />
        <Row k={`Gun ${session.gun} reading`} v={`${session.startReading.toFixed(1)} → ${(session.endReading ?? 0).toFixed(1)} kWh`} />
        <Row k="Energy" v={`${kwh(session.units ?? 0)} × ${session.rate.toFixed(2)}`} />
        <Row k="Paid with" v={method} />
        <div className="flex items-baseline justify-between border-t-2 border-dashed border-line pt-3">
          <span className="text-sm text-ink-soft">Total paid</span>
          <span className="att-display text-[32px] font-bold">{formatCurrency(session.amount ?? 0)}</span>
        </div>
        <div className="text-xs text-ink-soft">Recorded by {session.attendantName}</div>
      </div>

      <div className="no-print flex flex-col gap-2.5">
        <button type="button" onClick={onNew} className="att-btn att-btn-primary">
          Start another session
        </button>
        <button type="button" onClick={() => window.print()} className="att-btn att-btn-dark">
          <Printer size={18} aria-hidden /> Print receipt
        </button>
      </div>
    </section>
  );
}
