'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { startGunSession } from '@/app/actions/gun-sessions';
import { AGREED_RATE_PER_KWH, GUNS, prepaidUnits, type Gun } from '@/lib/gun-session';
import type { PricingTier, WorkspaceData } from '@/lib/gun-session-types';
import { formatCurrency } from '@/lib/utils';
import { WhoPicker, useWho } from './WhoPicker';

interface Props {
  workspace: WorkspaceData;
  onStarted: (sessionId: string, mode: 'postpaid' | 'prepaid') => void;
}

const tierLabel = (t: PricingTier) =>
  `${t.unitType === 'kwh' ? 'kWh' : 'Time'} · GHS ${t.rate.toFixed(2)} / ${t.unitQuantity} ${t.unitType === 'kwh' ? 'kWh' : 'hr'}`;

/** Start a charging session: mode, driver, price, gun. The units are logged afterwards. */
export default function StartSessionPanel({ workspace, onStarted }: Props) {
  const firstFree = GUNS.find((g) => !workspace.guns[g].inUse) ?? null;
  const [pickedGun, setGun] = useState<Gun | null>(null);
  // Derived, not synced: if the chosen gun is taken on another tablet, fall back to a free one.
  const gun: Gun | null = pickedGun && !workspace.guns[pickedGun].inUse ? pickedGun : firstFree;

  const [mode, setMode] = useState<'postpaid' | 'prepaid'>('postpaid');
  const [prepaidText, setPrepaidText] = useState('');
  const [pickedTier, setTier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const who = useWho();
  const { whoOk, guest } = who;

  const rates = workspace.rates;
  // Default to the newest kWh price, as the original did
  const tier = rates.find((r) => r.id === pickedTier) ?? rates.find((r) => r.unitType === 'kwh') ?? rates[0] ?? null;
  const perUnit = tier ? tier.perUnit : AGREED_RATE_PER_KWH;
  const unitName = tier?.unitType === 'time' ? 'hours' : 'kWh';

  const prepaid = Number(prepaidText.replace(/[^\d.]/g, '')) || 0;
  const needsShift = !workspace.shift && workspace.user.role === 'attendant';
  const prepaidOk = mode === 'postpaid' || prepaid >= 1;
  const canSubmit = !!gun && whoOk && prepaidOk && !needsShift && !submitting;

  const hint = useMemo(() => {
    if (needsShift) return 'Start your shift first.';
    if (!gun) return 'Both guns are in use. Finalize a session to free a gun.';
    if (!whoOk) return guest ? 'Enter the car number plate.' : 'Choose the driver and the car.';
    if (!prepaidOk) return 'Enter the prepaid amount.';
    return mode === 'prepaid' ? 'You can collect the prepaid amount now or after charging.' : 'Plug in the gun, then start. You log the kWh used afterwards.';
  }, [needsShift, gun, whoOk, guest, prepaidOk, mode]);

  const submit = async () => {
    if (!canSubmit || !gun) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('gun', gun);
    fd.set('mode', mode);
    if (mode === 'prepaid') fd.set('prepaidAmount', String(prepaid));
    if (tier) fd.set('pricingId', tier.id);
    who.appendTo(fd);
    const res = await startGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Session started on Gun ${gun}`);
    onStarted(res.sessionId, res.mode);
  };

  return (
    <section aria-label="Start a session" className="att-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="att-display text-2xl font-bold">Start charging session</h2>
        {gun && <span className="att-chip att-chip-mute">Gun {gun} free</span>}
      </div>

      {needsShift && (
        <div className="rounded-2xl bg-[#fde7cc] p-4 text-sm font-medium text-[#7a3b00]">
          You have no open shift.{' '}
          <Link href="/attend/shift" className="font-bold underline">
            Start your shift
          </Link>{' '}
          before recording a session.
        </div>
      )}

      {/* Mode */}
      <div className="grid grid-cols-2 gap-3">
        {(['postpaid', 'prepaid'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-[22px] border-2 p-4 text-left transition ${mode === m ? 'border-navy bg-[#e3f1cc]' : 'border-line bg-white'}`}
          >
            <div className="text-base font-semibold capitalize">{m}</div>
            <div className="text-[13px] text-ink-soft">{m === 'postpaid' ? 'Pay after charging' : 'Pay a set amount'}</div>
          </button>
        ))}
      </div>

      {/* Gun */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Which gun?</div>
        <div className="grid grid-cols-2 gap-3">
          {GUNS.map((g) => {
            const st = workspace.guns[g];
            const selected = gun === g;
            return (
              <button
                key={g}
                type="button"
                disabled={st.inUse}
                onClick={() => setGun(g)}
                aria-pressed={selected}
                className={`flex min-h-[84px] flex-col items-center justify-center gap-0.5 rounded-[22px] border text-center transition ${
                  st.inUse
                    ? 'cursor-not-allowed border-line bg-[#e8ecf2] text-ink-soft'
                    : selected
                      ? 'border-navy bg-navy text-brand-green'
                      : 'border-line bg-white text-navy hover:border-navy'
                }`}
              >
                <span className="att-display text-2xl font-bold">Gun {g}</span>
                <span className={`text-[13px] ${selected && !st.inUse ? 'text-[#d3dcec]' : ''}`}>{st.inUse ? 'In use' : 'Free'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Who */}
      <WhoPicker who={who} />

      {/* Price */}
      <div className="flex flex-col gap-2">
        <label htmlFor="tier" className="text-sm font-semibold">
          Pricing tier
        </label>
        {rates.length > 0 ? (
          <select id="tier" className="att-input" value={tier?.id ?? ''} onChange={(e) => setTier(e.target.value)}>
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {tierLabel(r)}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-2xl bg-ground p-3 text-sm">GHS {AGREED_RATE_PER_KWH.toFixed(2)} / kWh (agreed price)</div>
        )}
      </div>

      {mode === 'prepaid' && (
        <div className="flex flex-col gap-2">
          <label htmlFor="prepaid" className="text-sm font-semibold">
            Prepaid amount (GHS)
          </label>
          <input
            id="prepaid"
            inputMode="decimal"
            className="att-input"
            placeholder="e.g. 200"
            value={prepaidText}
            onChange={(e) => setPrepaidText(e.target.value.replace(/[^\d.]/g, ''))}
          />
          {prepaid >= 1 && (
            <div className="text-[13px] text-ink-soft">
              {formatCurrency(prepaid)} buys about {prepaidUnits(prepaid, perUnit).toFixed(1)} {unitName} at this price.
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
          {submitting ? 'Starting…' : gun ? `Start session on Gun ${gun}` : 'No gun free'}
        </button>
        <div className="text-center text-sm text-ink-soft">{hint}</div>
        <Link href="/attend/past" className="text-center text-sm font-semibold text-navy underline">
          Record past / backdated charge
        </Link>
      </div>
    </section>
  );
}
