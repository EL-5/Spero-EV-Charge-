'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { logPastGunSession } from '@/app/actions/gun-sessions';
import PhotoCapture from '@/components/attend/PhotoCapture';
import { WhoPicker, useWho } from '@/components/attend/WhoPicker';
import { useRefreshAttend, useWorkspace } from '@/components/attend/use-workspace';
import { GUNS, MAX_BACKDATE_DAYS, computeBill, endReadingProblem, parseReading, type Gun } from '@/lib/gun-session';

/** A date-time input value ("2026-11-10T14:30") for a moment, in Ghana time (UTC). */
const stamp = (d: Date) => d.toISOString().slice(0, 16);

/**
 * Log a charge that already happened and was not recorded. Same evidence as a live
 * charge (both readings, both photos), plus the date and times the attendant sets.
 * It always goes to a manager for review.
 */
export default function PastChargePage() {
  const router = useRouter();
  const refresh = useRefreshAttend();
  const { data: ws } = useWorkspace();
  const who = useWho();

  const [gun, setGun] = useState<Gun>('A');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [startPhoto, setStartPhoto] = useState<File | null>(null);
  const [endPhoto, setEndPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const earliest = stamp(new Date(now.getTime() - MAX_BACKDATE_DAYS * 86_400_000));
  const latest = stamp(now);

  const start = parseReading(startText);
  const end = parseReading(endText);
  const endProblem = start !== null && end !== null ? endReadingProblem(start, end) : null;
  const preview = start !== null && end !== null && !endProblem ? computeBill(start, end, 1) : null;

  const timesOk = !!startAt && !!endAt && endAt > startAt && endAt <= latest && startAt >= earliest;
  const needsShift = !!ws && !ws.shift && ws.user.role === 'attendant';
  const startBad = startText.trim() !== '' && start === null;
  const canSubmit = who.whoOk && timesOk && end !== null && !startBad && !endProblem && !needsShift && !submitting;

  const hint = needsShift
    ? 'Start your shift first.'
    : !who.whoOk
      ? who.guest ? 'Enter the car number plate.' : 'Choose the driver and the car.'
      : !startAt || !endAt
        ? 'Set when the charge started and ended.'
        : !timesOk
          ? 'The end must be after the start, not in the future, and within the last ' + MAX_BACKDATE_DAYS + ' days.'
          : end === null
            ? 'Enter the end reading.'
            : startBad || endProblem
              ? 'Check the readings.'
              : 'A manager will review this charge.';

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('gun', gun);
    who.appendTo(fd);
    fd.set('startAt', startAt);
    fd.set('endAt', endAt);
    if (start !== null) fd.set('startReading', String(start));
    fd.set('endReading', String(end));
    if (startPhoto) fd.set('startPhoto', startPhoto);
    if (endPhoto) fd.set('endPhoto', endPhoto);
    const res = await logPastGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Past charge saved. Now record the payment.');
    await refresh(res.sessionId);
    router.push(`/attend/session/${res.sessionId}`);
  };

  const reading = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-baseline justify-between rounded-[22px] border-2 border-navy bg-white px-4 py-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={value}
          onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ''))}
          className="att-display min-w-0 flex-1 bg-transparent text-[34px] font-bold outline-none"
        />
        <span className="text-sm font-semibold text-ink-soft">kWh</span>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/attend')}
          aria-label="Back to home"
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-line bg-white"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <h1 className="att-display text-[28px] font-bold">Log a past charge</h1>
      </div>

      <section className="att-card flex flex-col gap-5 p-5 sm:p-6">
        <p className="text-sm text-ink-soft">
          Use this for a charge that already happened and was not recorded. You only need the end reading; photos are optional. Every past charge goes to a manager to check.
          Charges up to {MAX_BACKDATE_DAYS} days back can be added; for older ones, ask a manager.
        </p>

        {needsShift && (
          <div className="rounded-2xl bg-[#fde7cc] p-4 text-sm font-medium text-[#7a3b00]">
            You have no open shift.{' '}
            <Link href="/attend/shift" className="font-bold underline">
              Start your shift
            </Link>{' '}
            first.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Which gun?</div>
          <div className="grid grid-cols-2 gap-3">
            {GUNS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGun(g)}
                aria-pressed={gun === g}
                className={`min-h-[64px] rounded-[22px] border att-display text-xl font-bold transition ${
                  gun === g ? 'border-navy bg-navy text-brand-green' : 'border-line bg-white text-navy hover:border-navy'
                }`}
              >
                Gun {g}
              </button>
            ))}
          </div>
        </div>

        <WhoPicker who={who} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="past-start" className="text-sm font-semibold">
              Charging started <span className="font-normal text-ink-soft">Ghana time</span>
            </label>
            <input id="past-start" type="datetime-local" className="att-input" min={earliest} max={latest} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="past-end" className="text-sm font-semibold">
              Charging ended <span className="font-normal text-ink-soft">Ghana time</span>
            </label>
            <input id="past-end" type="datetime-local" className="att-input" min={startAt || earliest} max={latest} value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>

        {reading('past-end-reading', 'End reading (after charging)', endText, setEndText)}
        {endProblem && (
          <div role="alert" className="rounded-2xl bg-[#ffe3df] p-3 text-sm font-medium text-[#9b1c13]">
            {endProblem}
          </div>
        )}
        <PhotoCapture label="Photo of the end reading (optional)" file={endPhoto} onChange={setEndPhoto} disabled={submitting} />

        <details className="rounded-[22px] border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">Start reading and its photo (optional)</summary>
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              Leave this empty and the charge starts where that gun last stopped. Type it only if you know the display showed something else, or if the gun has no earlier session.
            </p>
            {reading('past-start-reading', 'Start reading (before charging)', startText, setStartText)}
            <PhotoCapture label="Photo of the start reading (optional)" file={startPhoto} onChange={setStartPhoto} disabled={submitting} />
          </div>
        </details>

        {preview ? (
          <div className="rounded-[22px] bg-ground p-4 text-[15px]">
            Energy delivered: <b>{preview.units.toFixed(1)} kWh</b>. The system works out the amount at today’s rate when you save.
          </div>
        ) : (
          end !== null && <div className="rounded-[22px] bg-ground p-4 text-[15px]">The system works out the kWh and the amount when you save.</div>
        )}
        {(!startPhoto || !endPhoto) && (
          <div className="text-[13px] text-ink-soft">Without both photos the charge is marked for the manager to check more closely.</div>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
            {submitting ? 'Saving…' : 'Save past charge'}
          </button>
          <div className="text-center text-sm text-ink-soft">{hint}</div>
        </div>
      </section>
    </div>
  );
}
