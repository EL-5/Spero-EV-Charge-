'use client';

import { useState } from 'react';
import { Lock, Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { attachPaymentProof, cancelGunSession, collectGunPayment, finishGunSession } from '@/app/actions/gun-sessions';
import {
  ACCEPT_CASH,
  PAY_METHODS,
  PAY_METHOD_LABEL,
  REVIEW_FLAG_LABEL,
  billFromUnits,
  evaluateFlags,
  isMomo,
  parseUnits,
  prepaidUnits,
  type PayMethod,
} from '@/lib/gun-session';
import type { GunSessionView } from '@/lib/gun-session-types';
import { formatClock, formatCurrency, formatDateTime } from '@/lib/utils';
import PhotoCapture from './PhotoCapture';

const unitWord = (s: Pick<GunSessionView, 'unitType'>) => (s.unitType === 'time' ? 'hours' : 'kWh');
const amountOf = (n: number, s: Pick<GunSessionView, 'unitType'>) => `${n.toFixed(s.unitType === 'time' ? 2 : 1)} ${unitWord(s)}`;

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

function BillCard({ session, units, amount, preview }: { session: GunSessionView; units: number; amount: number; preview?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-[26px] bg-navy p-5 text-white">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-[#a9bbd9]">Energy used</div>
          <div className="att-display text-[40px] font-bold leading-none text-brand-green">{amountOf(units, session)}</div>
        </div>
        <div className="text-right text-xs text-[#a9bbd9]">
          Price when started
          <div className="mt-0.5 text-base font-semibold text-white">
            GHS {session.rate.toFixed(2)} / {session.unitType === 'time' ? 'hr' : 'kWh'}
          </div>
        </div>
      </div>
      <div className="h-px bg-navy-3" />
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-[#d3dcec]">{preview ? 'Total amount due (the system confirms it)' : 'Total amount due'}</span>
        <span className="att-display text-4xl font-bold">{formatCurrency(amount)}</span>
      </div>
    </div>
  );
}

// ── Finalize ─────────────────────────────────────────────────────────────────

/**
 * The original "finalize session": type the units used, see the amount due, then either
 * pay now or send the session to pending payment. A photo of the display is optional.
 */
export function FinishPanel({
  session,
  onChanged,
  onPending,
  onCancelled,
}: {
  session: GunSessionView;
  onChanged: () => void;
  onPending: () => void;
  onCancelled: () => void;
}) {
  const [unitsText, setUnitsText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState<'pay' | 'pending' | 'cancel' | null>(null);

  const finished = session.status !== 'active';
  const prepaid = session.mode === 'prepaid';
  const typed = parseUnits(unitsText);
  const bill = prepaid
    ? { units: prepaidUnits(session.prepaidAmount, session.rate), amount: session.prepaidAmount }
    : typed !== null
      ? billFromUnits(typed, session.rate)
      : null;
  const previewFlags =
    bill && session.unitType === 'kwh'
      ? evaluateFlags({ startGap: null, units: bill.units, batteryKwh: session.batteryKwh, startedAt: new Date(session.startTime), endedAt: new Date() })
      : [];
  const alreadyPaid = prepaid && session.paymentStatus === 'paid';
  const canSubmit = !!bill && !busy;

  const submit = async (next: 'pay' | 'pending') => {
    if (!canSubmit) return;
    setBusy(next);
    const fd = new FormData();
    fd.set('sessionId', session.id);
    if (!prepaid) fd.set('units', String(typed));
    if (photo) fd.set('photo', photo);
    const res = await finishGunSession(fd);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    onChanged();
    if (next === 'pending' && res.status === 'pending_payment') {
      toast.success('Moved to pending payment. Collect payment when ready.');
      onPending();
    } else {
      toast.success(res.status === 'completed' ? 'Session finished.' : `${amountOf(res.units, session)} · ${formatCurrency(res.amount)} due`);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this session? This cannot be undone.')) return;
    setBusy('cancel');
    const res = await cancelGunSession(session.id);
    setBusy(null);
    if (!res.success) return toast.error(res.error);
    toast.success('Session cancelled.');
    onChanged();
    onCancelled();
  };

  return (
    <section aria-label="Finalize session" className="att-card flex flex-col gap-4 p-5 sm:p-6">
      <StepTitle n={1}>Finalize session</StepTitle>

      <div className="flex flex-col gap-2 rounded-[20px] bg-ground p-4">
        <Row k="Driver" v={`${session.driverName}${session.vehiclePlate ? ` · ${session.vehiclePlate}` : ''}`} />
        <Row k={`Gun ${session.gun} · ${prepaid ? 'prepaid' : 'postpaid'}`} v={`Started ${formatClock(session.startTime)}`} />
      </div>

      {finished ? (
        <>
          <BillCard session={session} units={session.units ?? 0} amount={session.amount ?? 0} />
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
          {prepaid ? (
            <div className="flex flex-col gap-2 rounded-[20px] bg-[#e3f1cc] p-4 text-[#2f5a05]">
              <div className="text-xs font-bold uppercase">Prepaid session</div>
              <Row k="Target amount" v={formatCurrency(session.prepaidAmount)} />
              <Row k="Equivalent units" v={amountOf(prepaidUnits(session.prepaidAmount, session.rate), session)} />
              <p className="text-xs">The units follow from the prepaid amount at GHS {session.rate.toFixed(2)} per {unitWord(session)}.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="units-used" className="text-sm font-semibold">
                Units consumed <span className="font-normal text-ink-soft">({unitWord(session)})</span>
              </label>
              <div className="flex items-baseline justify-between rounded-[22px] border-2 border-navy bg-white px-4 py-2">
                <input
                  id="units-used"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={`Enter ${unitWord(session)} consumed`}
                  value={unitsText}
                  onChange={(e) => setUnitsText(e.target.value.replace(/[^\d.,]/g, ''))}
                  className="att-display min-w-0 flex-1 bg-transparent text-[34px] font-bold outline-none"
                />
                <span className="text-sm font-semibold text-ink-soft">{unitWord(session)}</span>
              </div>
            </div>
          )}

          {bill && !prepaid && <BillCard session={session} units={bill.units} amount={bill.amount} preview />}

          {previewFlags.length > 0 && (
            <div className="rounded-2xl bg-[#fde7cc] p-3 text-sm font-medium text-[#7a3b00]">
              A manager will review this session:
              <ul className="mt-1 list-disc pl-5">
                {previewFlags.map((f) => (
                  <li key={f}>{REVIEW_FLAG_LABEL[f]}</li>
                ))}
              </ul>
            </div>
          )}

          <PhotoCapture label="Photo of the machine display (optional)" file={photo} onChange={setPhoto} disabled={!!busy} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => submit('pending')} disabled={!canSubmit || alreadyPaid} className="att-btn att-btn-ghost !min-h-[60px] text-base">
              {busy === 'pending' ? 'Saving…' : 'Send to pending'}
            </button>
            <button type="button" onClick={() => submit('pay')} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[60px] text-base">
              {busy === 'pay' ? 'Saving…' : alreadyPaid ? 'Finish session' : 'Finish & pay now'}
            </button>
          </div>
          {!alreadyPaid && (
            <button type="button" onClick={cancel} disabled={!!busy} className="min-h-[44px] self-center text-sm font-semibold text-[#9b1c13] underline">
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel this session'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ── Collect ──────────────────────────────────────────────────────────────────

/** The original "collect payment": method, amount handed over, MoMo number for records. */
export function CollectPanel({ session, onChanged }: { session: GunSessionView; onChanged: () => void }) {
  const [method, setMethod] = useState<PayMethod>('mtn');
  const [paidText, setPaidText] = useState('');
  // The MoMo number starts as the driver's own number; the attendant can change it
  const [typedPhone, setTypedPhone] = useState<string | null>(null);
  const phone = typedPhone ?? session.driverPhone ?? '';
  const setPhone = setTypedPhone;
  const [submitting, setSubmitting] = useState(false);

  // Normally paid after charging. A prepaid session can be paid before it.
  const prepaidFirst = session.mode === 'prepaid' && session.status === 'active' && session.paymentStatus === 'unpaid';
  const ready = session.status === 'pending_payment' || prepaidFirst;
  const due = prepaidFirst ? session.prepaidAmount : (session.amount ?? 0);

  const handed = method === 'wallet' || paidText.trim() === '' ? due : Number(paidText.replace(/[^\d.]/g, '')) || 0;
  const extra = Math.max(0, Math.round((handed - due) * 100) / 100);
  const walletOk = session.walletBalance !== null && session.walletBalance >= due;
  const amountOk = method === 'wallet' || handed >= due;
  const canSubmit = ready && due > 0 && amountOk && (method !== 'wallet' || walletOk) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('sessionId', session.id);
    fd.set('method', method);
    fd.set('amountPaid', String(handed));
    if (isMomo(method) && phone.trim()) fd.set('momoPhone', phone.trim());
    const res = await collectGunPayment(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Payment recorded — ${PAY_METHOD_LABEL[method]}`);
    onChanged();
  };

  if (session.mode === 'prepaid' && session.status === 'active' && session.paymentStatus === 'paid') {
    return (
      <section aria-label="Collect payment" className="att-card flex flex-col gap-3 p-5 sm:p-6">
        <StepTitle n={2}>Payment received</StepTitle>
        <div className="rounded-2xl bg-[#e3f1cc] p-4 text-[15px] font-medium text-[#2f5a05]">
          The prepaid {formatCurrency(session.prepaidAmount)} is paid. Finalize the session when charging ends.
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Collect payment" className={`att-card flex flex-col gap-4 p-5 sm:p-6 ${ready ? '' : 'opacity-60'}`}>
      <StepTitle n={2}>Collect payment</StepTitle>

      <div className="flex items-center justify-between gap-3 rounded-[22px] bg-ground p-4">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink-soft">
            <Lock size={13} aria-hidden /> Session cost, set by the system
          </div>
          <div className="att-display text-[38px] font-bold leading-tight">{ready ? formatCurrency(due) : '—'}</div>
        </div>
        <span className="att-chip att-chip-mute">{session.receiptNumber}</span>
      </div>

      {session.walletBalance !== null && (
        <div className="flex items-center justify-between rounded-[20px] border border-line p-3">
          <div className="text-sm">
            <div className="text-[11px] font-bold uppercase text-ink-soft">Driver wallet</div>
            <div className="font-medium">{session.driverName}</div>
          </div>
          <div className="att-display text-xl font-bold">{formatCurrency(session.walletBalance)}</div>
        </div>
      )}

      {!ready && <div className="text-sm text-ink-soft">Finalize the session first, so the amount can be worked out.</div>}

      <fieldset disabled={!ready || submitting} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-2">
          <label htmlFor="amount-paid" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Actual amount paid
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-ink-soft">GHS</span>
            <input
              id="amount-paid"
              inputMode="decimal"
              className="att-input !pl-16 text-xl font-bold disabled:opacity-60"
              value={method === 'wallet' ? due.toFixed(2) : paidText === '' ? due.toFixed(2) : paidText}
              onChange={(e) => setPaidText(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={method === 'wallet' || session.isGuest}
            />
          </div>
          {extra > 0 && <div className="text-xs font-bold text-[#2f5a05]">+ GHS {extra.toFixed(2)} will be added to the driver’s credit</div>}
          {method !== 'wallet' && !amountOk && <div className="text-xs font-semibold text-[#9b1c13]">The amount cannot be less than GHS {due.toFixed(2)}.</div>}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Payment method</div>
          <div className="grid grid-cols-2 gap-2.5">
            {PAY_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                disabled={m === 'wallet' && session.walletBalance === null}
                className={`min-h-[60px] rounded-[18px] border-2 text-base transition disabled:opacity-40 ${
                  method === m ? 'border-navy bg-[#e3f1cc] font-semibold text-[#2f5a05]' : 'border-line bg-white font-medium'
                }`}
              >
                {PAY_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {!ACCEPT_CASH && <p className="text-center text-xs italic text-ink-soft">Cash payments are not accepted. Use MoMo or Wallet only.</p>}
        </div>

        {isMomo(method) && (
          <div className="flex flex-col gap-2">
            <label htmlFor="momo-phone" className="text-sm font-semibold">
              MoMo number <span className="font-normal text-ink-soft">(for records)</span>
            </label>
            <input id="momo-phone" inputMode="tel" className="att-input tracking-widest" placeholder="024XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div className="text-[13px] text-ink-soft">Saved for financial records. No MoMo prompt is sent.</div>
          </div>
        )}

        {method === 'wallet' && (
          <div className={`rounded-2xl p-3 text-sm font-medium ${walletOk ? 'bg-[#e3f1cc] text-[#2f5a05]' : 'bg-[#ffe3df] text-[#9b1c13]'}`}>
            {session.walletBalance === null
              ? 'Guests do not have a wallet.'
              : walletOk
                ? `Wallet balance ${formatCurrency(session.walletBalance)}. After payment: ${formatCurrency(session.walletBalance - due)}.`
                : `Wallet balance ${formatCurrency(session.walletBalance)} is too low. Choose MoMo, or ask a manager to approve a top-up.`}
          </div>
        )}
      </fieldset>

      <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[66px] text-xl">
        {submitting ? 'Processing…' : method === 'wallet' ? 'Pay from wallet' : 'Record payment'}
      </button>
      <div className="text-center text-sm text-ink-soft">Saved with your name and the time.</div>
    </section>
  );
}

// ── Receipt ──────────────────────────────────────────────────────────────────

export function ReceiptCard({ session, onNew, onChanged }: { session: GunSessionView; onNew: () => void; onChanged: () => void }) {
  const method = PAY_METHOD_LABEL[(session.paymentMethod as PayMethod) ?? 'mtn'] ?? (session.paymentMethod || '—');
  const momo = isMomo(session.paymentMethod || '');
  const [proof, setProof] = useState<File | null>(null);
  const [savingProof, setSavingProof] = useState(false);
  const [sharing, setSharing] = useState(false);
  const paid = session.amountPaid ?? session.amount ?? 0;

  const saveProof = async () => {
    if (!proof) return;
    setSavingProof(true);
    const fd = new FormData();
    fd.set('sessionId', session.id);
    fd.set('proof', proof);
    const res = await attachPaymentProof(fd);
    setSavingProof(false);
    if (!res.success) return toast.error(res.error);
    toast.success('MoMo confirmation saved.');
    setProof(null);
    onChanged();
  };

  // Same as the original: render the receipt to a PDF and hand it to the share sheet (WhatsApp)
  const share = async () => {
    const el = document.getElementById('attend-receipt');
    if (!el) return;
    setSharing(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { default: JsPDF } = await import('jspdf');
      const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const pdfWidth = 80;
      const pdf = new JsPDF({ unit: 'mm', format: [pdfWidth, (canvas.height * pdfWidth) / canvas.width] });
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
      const filename = `Receipt-${session.receiptNumber}.pdf`;
      const file = new File([pdf.output('blob')], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Receipt ${session.receiptNumber}`,
          text: `Hello ${session.driverName || 'Driver'}, here is your charging receipt from Spero EV. Total: ${formatCurrency(paid)}`,
        });
      } else {
        pdf.save(filename);
        toast.info('Direct sharing is not supported here. The PDF was downloaded.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Could not prepare the receipt.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="no-print flex flex-col items-center gap-2 rounded-[26px] bg-navy p-6 text-center text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#76B918" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="att-display text-2xl font-bold">Payment success</h2>
        <p className="text-sm text-[#a9bbd9]">Transaction recorded</p>
      </div>

      <div id="attend-receipt" className="att-card print-visible flex flex-col gap-3 bg-white p-5">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spero-emblem.png" alt="" className="mx-auto mb-1 h-9 w-9 object-contain" />
          <div className="att-display text-lg font-bold uppercase">Spero Energy Resources</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">EV charging receipt</div>
        </div>
        <div className="h-px border-t border-dashed border-line" />
        <Row k="Receipt #" v={<span className="font-mono">{session.receiptNumber}</span>} />
        <Row k="Date" v={session.endTime ? formatDateTime(session.endTime) : formatDateTime(session.startTime)} />
        <Row k="Driver" v={session.driverName} />
        {session.vehiclePlate && <Row k="Vehicle" v={session.vehiclePlate} />}
        <Row k="Gun" v={`Gun ${session.gun}`} />
        <Row k="Energy" v={amountOf(session.units ?? 0, session)} />
        <Row k="Price" v={`GHS ${session.rate.toFixed(2)} / ${session.unitType === 'time' ? 'hr' : 'kWh'}`} />
        <Row k="Paid with" v={method} />
        <div className="flex items-baseline justify-between border-t-2 border-dashed border-line pt-3">
          <span className="text-sm text-ink-soft">Total paid</span>
          <span className="att-display text-[32px] font-bold">{formatCurrency(paid)}</span>
        </div>
        <div className="text-xs text-ink-soft">Recorded by {session.attendantName} · Powered by Spero EV</div>
      </div>

      {momo && session.isMine && (
        <div className="no-print att-card flex flex-col gap-3 p-5">
          <div className="text-sm font-semibold">MoMo confirmation <span className="font-normal text-ink-soft">(optional)</span></div>
          {session.hasPaymentProof && !proof ? (
            <div className="rounded-2xl bg-[#e3f1cc] p-3 text-sm font-medium text-[#2f5a05]">The confirmation photo is saved. You can replace it below.</div>
          ) : null}
          <PhotoCapture label="Photo of the MoMo confirmation message" subject="the MoMo confirmation" file={proof} onChange={setProof} disabled={savingProof} />
          {proof && (
            <button type="button" onClick={saveProof} disabled={savingProof} className="att-btn att-btn-dark">
              {savingProof ? 'Saving…' : 'Save confirmation photo'}
            </button>
          )}
        </div>
      )}

      <div className="no-print flex flex-col gap-2.5">
        <button type="button" onClick={share} disabled={sharing} className="att-btn att-btn-dark">
          <Share2 size={18} aria-hidden /> {sharing ? 'Preparing receipt…' : 'Share receipt (WhatsApp)'}
        </button>
        <button type="button" onClick={() => window.print()} className="att-btn att-btn-ghost">
          <Printer size={18} aria-hidden /> Print receipt
        </button>
        <button type="button" onClick={onNew} className="att-btn att-btn-primary">
          Start another session
        </button>
      </div>
    </section>
  );
}
