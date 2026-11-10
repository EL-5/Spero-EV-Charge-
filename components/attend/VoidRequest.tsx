'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { requestVoid } from '@/app/actions/approvals';
import type { GunSessionView } from '@/lib/gun-session-types';

const REASONS = ['Wrong reading typed', 'Charging failed', 'Driver left or cancelled', 'Paid by mistake', 'Something else'];

/**
 * An attendant cannot cancel a session on their own. They tell the manager what
 * happened; the manager decides, and the decision is recorded.
 */
export function VoidRequest({ session, onChanged }: { session: GunSessionView; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  if (session.status === 'cancelled' || !session.isMine) return null;
  if (session.voidPending) {
    return <div className="no-print rounded-[22px] bg-[#fde7cc] p-4 text-[15px] font-medium text-[#7a3b00]">A manager is deciding whether to void this session.</div>;
  }

  if (!open) {
    return (
      <button type="button" className="no-print att-btn att-btn-ghost self-start" onClick={() => setOpen(true)}>
        Something is wrong with this session
      </button>
    );
  }

  const send = async () => {
    setBusy(true);
    const res = await requestVoid({ sessionId: session.id, reason, detail });
    setBusy(false);
    if (!res.success) return toast.error(res.error);
    toast.success('Sent to the manager.');
    setOpen(false);
    setDetail('');
    onChanged();
  };

  return (
    <div className="no-print att-card flex flex-col gap-3 p-5">
      <h2 className="att-display text-lg font-bold">Ask a manager to void this session</h2>
      <p className="text-sm text-ink-soft">Nothing changes until the manager agrees. Tell them exactly what happened.</p>
      <label htmlFor="void-reason" className="text-sm font-semibold">Reason</label>
      <select id="void-reason" className="att-input" value={reason} onChange={(e) => setReason(e.target.value)}>
        {REASONS.map((r) => <option key={r}>{r}</option>)}
      </select>
      <label htmlFor="void-detail" className="text-sm font-semibold">What happened</label>
      <textarea id="void-detail" rows={3} className="att-input !min-h-0 py-3" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="flex gap-3">
        <button type="button" className="att-btn att-btn-ghost flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
        <button type="button" className="att-btn att-btn-primary flex-1" onClick={send} disabled={busy || detail.trim().length < 5}>
          {busy ? 'Sending…' : 'Send to manager'}
        </button>
      </div>
    </div>
  );
}
