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
import { AGREED_RATE_PER_KWH, GUNS, MAX_BACKDATE_DAYS, billFromUnits, parseUnits, type Gun } from '@/lib/gun-session';
import { formatCurrency } from '@/lib/utils';

/** A date-time input value ("2026-11-10T14:30") for a moment, in Ghana time (UTC). */
const stamp = (d: Date) => d.toISOString().slice(0, 16);

/**
 * The original "record past / backdated charge": set the date and time, type the units
 * used, then pay. Every past charge goes to a manager to check.
 */
export default function PastChargePage() {
  const router = useRouter();
  const refresh = useRefreshAttend();
  const { data: ws } = useWorkspace();
  const who = useWho();

  const [gun, setGun] = useState<Gun>('A');
  const [when, setWhen] = useState('');
  const [unitsText, setUnitsText] = useState('');
  const [tierId, setTierId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const earliest = stamp(new Date(now.getTime() - MAX_BACKDATE_DAYS * 86_400_000));
  const latest = stamp(now);

  const rates = ws?.rates ?? [];
  const tier = rates.find((r) => r.id === tierId) ?? rates.find((r) => r.unitType === 'kwh') ?? rates[0] ?? null;
  const perUnit = tier ? tier.perUnit : AGREED_RATE_PER_KWH;
  const unitName = tier?.unitType === 'time' ? 'hours' : 'kWh';

  const units = parseUnits(unitsText);
  const bill = units !== null ? billFromUnits(units, perUnit) : null;
  const whenOk = !!when && when >= earliest && when <= latest;
  const needsShift = !!ws && !ws.shift && ws.user.role === 'attendant';
  const canSubmit = who.whoOk && whenOk && units !== null && !needsShift && !submitting;

  const hint = needsShift
    ? 'Start your shift first.'
    : !who.whoOk
      ? who.guest ? 'Enter the car number plate.' : 'Choose the driver and the car.'
      : !when
        ? 'Set the date and time of the charge.'
        : !whenOk
          ? `The date must be in the past and within the last ${MAX_BACKDATE_DAYS} days.`
          : units === null
            ? `Enter the ${unitName} used.`
            : 'A manager will review this charge.';

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('gun', gun);
    who.appendTo(fd);
    fd.set('when', when);
    fd.set('units', String(units));
    if (tier) fd.set('pricingId', tier.id);
    if (photo) fd.set('photo', photo);
    const res = await logPastGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Backdated session recorded. Now collect the payment.');
    await refresh(res.sessionId);
    router.push(`/attend/session/${res.sessionId}`);
  };

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
        <h1 className="att-display text-[28px] font-bold">Record a past charge</h1>
      </div>

      <section className="att-card flex flex-col gap-5 p-5 sm:p-6">
        <p className="text-sm text-ink-soft">
          Use this for a charge from an earlier date (for example yesterday) that was not recorded. Charges up to {MAX_BACKDATE_DAYS} days back can be added. Every past
          charge goes to a manager to check.
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
                className={`att-display min-h-[64px] rounded-[22px] border text-xl font-bold transition ${
                  gun === g ? 'border-navy bg-navy text-brand-green' : 'border-line bg-white text-navy hover:border-navy'
                }`}
              >
                Gun {g}
              </button>
            ))}
          </div>
        </div>

        <WhoPicker who={who} />

        {rates.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor="past-tier" className="text-sm font-semibold">
              Pricing tier
            </label>
            <select id="past-tier" className="att-input" value={tier?.id ?? ''} onChange={(e) => setTierId(e.target.value)}>
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.unitType === 'kwh' ? 'kWh' : 'Time'} · GHS {r.rate.toFixed(2)} / {r.unitQuantity} {r.unitType === 'kwh' ? 'kWh' : 'hr'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="past-when" className="text-sm font-semibold">
            Date and time of the charge <span className="font-normal text-ink-soft">Ghana time</span>
          </label>
          <input id="past-when" type="datetime-local" className="att-input" min={earliest} max={latest} value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="past-units" className="text-sm font-semibold">
            Units consumed <span className="font-normal text-ink-soft">({unitName})</span>
          </label>
          <div className="flex items-baseline justify-between rounded-[22px] border-2 border-navy bg-white px-4 py-2">
            <input
              id="past-units"
              inputMode="decimal"
              autoComplete="off"
              placeholder={`Enter ${unitName} consumed`}
              value={unitsText}
              onChange={(e) => setUnitsText(e.target.value.replace(/[^\d.,]/g, ''))}
              className="att-display min-w-0 flex-1 bg-transparent text-[34px] font-bold outline-none"
            />
            <span className="text-sm font-semibold text-ink-soft">{unitName}</span>
          </div>
          {bill && (
            <div className="rounded-[22px] bg-ground p-4 text-[15px]">
              Total amount due: <b>{formatCurrency(bill.amount)}</b> ({bill.units.toFixed(1)} {unitName} × GHS {perUnit.toFixed(2)})
            </div>
          )}
        </div>

        <PhotoCapture label="Photo of the machine display (optional)" file={photo} onChange={setPhoto} disabled={submitting} />

        <div className="flex flex-col gap-2">
          <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
            {submitting ? 'Saving…' : 'Record backdated charge'}
          </button>
          <div className="text-center text-sm text-ink-soft">{hint}</div>
        </div>
      </section>
    </div>
  );
}
