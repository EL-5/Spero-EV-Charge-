'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Flag, Wallet, XCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { decideVoid, getApprovalQueue, reviewReading } from '@/app/actions/approvals';
import { approveWalletTopUpRequest, rejectWalletTopUpRequest } from '@/app/actions/wallets';
import { REVIEW_FLAG_LABEL } from '@/lib/gun-session';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export const APPROVALS_KEY = ['approval-queue'] as const;

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{text}</div>;
}

/** Small inline form used when a decision needs a written reason. */
function NoteBox({ placeholder, confirm, danger, onCancel, onConfirm, busy }: {
  placeholder: string; confirm: string; danger?: boolean; busy: boolean;
  onCancel: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="mt-3 space-y-2">
      <textarea className="form-input" rows={2} placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onConfirm(note)} disabled={busy || note.trim().length < 5}>
          {busy ? 'Saving…' : confirm}
        </button>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: async () => {
      const res = await getApprovalQueue();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 30_000,
  });
  // Which card has its note box open, and which is saving
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const done = async (msg?: string) => {
    if (msg) toast.success(msg);
    setOpen(null);
    await qc.invalidateQueries({ queryKey: APPROVALS_KEY });
    await qc.invalidateQueries({ queryKey: ['approval-count'] });
  };
  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string; message?: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.success) return toast.error(res.error || 'Something went wrong.');
    await done(res.message || 'Saved.');
  };

  const total = data ? data.voids.length + data.readings.length + data.topups.length : 0;

  return (
    <div>
      <TopBar title="Approvals" subtitle="Everything that needs a manager to look before it counts" />
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
        {isLoading && <div className="stat-card text-sm">Loading…</div>}
        {error && <div className="stat-card text-sm text-red-700">{(error as Error).message}</div>}
        {data && total === 0 && (
          <div className="stat-card flex items-center gap-3">
            <CheckCircle2 className="text-green-600" />
            <div>
              <div className="font-semibold">Nothing is waiting.</div>
              <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>New requests appear here and in the menu badge.</div>
            </div>
          </div>
        )}

        {data && (
          <>
            <section className="stat-card">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><XCircle size={16} /> Void requests <span className="badge" style={{ background: 'var(--muted)' }}>{data.voids.length}</span></h2>
              <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>An attendant asked to cancel a session. Wallet payments go back to the wallet. MoMo payments are marked as owed to the driver.</p>
              {data.voids.length === 0 && <Empty text="No void requests." />}
              <div className="space-y-3">
                {data.voids.map((v) => (
                  <div key={v.requestId} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold">{v.receiptNumber}</span>
                      {v.gun && <span className="badge" style={{ background: 'var(--muted)' }}>Gun {v.gun}</span>}
                      <span className="text-sm">{v.driverName}</span>
                      <span className="text-sm font-medium">{formatCurrency(v.amount)}</span>
                      {v.units !== null && <span className="text-sm">{v.units.toFixed(1)} kWh</span>}
                      <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>{v.requestedBy} · {formatDateTime(v.requestedAt)}</span>
                    </div>
                    <div className="mt-2 text-sm"><b>{v.reason}.</b> {v.detail}</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {v.paymentStatus === 'paid' ? `Already paid by ${v.paymentMethod === 'wallet' ? 'wallet' : 'MoMo'}` : 'Not paid yet'}
                    </div>
                    {open === `v:${v.requestId}:keep` ? (
                      <NoteBox placeholder="Why is the session being kept? The attendant will see this." confirm="Keep session" busy={busy === v.requestId}
                        onCancel={() => setOpen(null)} onConfirm={(note) => run(v.requestId, () => decideVoid({ requestId: v.requestId, approve: false, note }))} />
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button className="btn btn-danger btn-sm" disabled={busy === v.requestId}
                          onClick={() => { if (confirm(`Void ${v.receiptNumber}? This cannot be undone.`)) run(v.requestId, () => decideVoid({ requestId: v.requestId, approve: true })); }}>
                          {busy === v.requestId ? 'Voiding…' : 'Approve void'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(`v:${v.requestId}:keep`)}>Keep session</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="stat-card">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Flag size={16} /> Readings to check <span className="badge" style={{ background: 'var(--muted)' }}>{data.readings.length}</span></h2>
              <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>The system accepted these but something looked unusual. Open the photos in Sessions, then accept or mark as a problem.</p>
              {data.readings.length === 0 && <Empty text="No readings to check." />}
              <div className="space-y-3">
                {data.readings.map((r) => (
                  <div key={r.sessionId} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold">{r.receiptNumber}</span>
                      <span className="badge" style={{ background: 'var(--muted)' }}>Gun {r.gun}</span>
                      <span className="text-sm">{r.driverName}{r.vehiclePlate ? ` · ${r.vehiclePlate}` : ''}</span>
                      <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>{r.attendantName}{r.endedAt ? ` · ${formatDateTime(r.endedAt)}` : ''}</span>
                    </div>
                    <div className="mt-2 text-sm tabular-nums">
                      {r.startReading.toFixed(1)} → {r.endReading !== null ? r.endReading.toFixed(1) : '…'}
                      {r.units !== null && <> = <b>{r.units.toFixed(1)} kWh</b></>}
                      {r.amount !== null && <> · {formatCurrency(r.amount)}</>}
                      {r.startGap !== null && Math.abs(r.startGap) > 0 && <> · gap before start {r.startGap.toFixed(1)} kWh</>}
                    </div>
                    <ul className="mt-2 text-sm list-disc pl-5" style={{ color: '#7a3b00' }}>
                      {r.flags.map((f) => <li key={f}>{REVIEW_FLAG_LABEL[f] || f}</li>)}
                    </ul>
                    {open === `r:${r.sessionId}:problem` ? (
                      <NoteBox placeholder="What is wrong? The attendant will be told." confirm="Mark as problem" danger busy={busy === r.sessionId}
                        onCancel={() => setOpen(null)} onConfirm={(note) => run(r.sessionId, () => reviewReading({ sessionId: r.sessionId, decision: 'problem', note }))} />
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a className="btn btn-secondary btn-sm" href={`/sessions?open=${r.sessionId}`}>See photos</a>
                        <button className="btn btn-primary btn-sm" disabled={busy === r.sessionId}
                          onClick={() => run(r.sessionId, () => reviewReading({ sessionId: r.sessionId, decision: 'accepted' }))}>Accept</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(`r:${r.sessionId}:problem`)}>Mark as problem</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="stat-card">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Wallet size={16} /> Wallet top-ups <span className="badge" style={{ background: 'var(--muted)' }}>{data.topups.length}</span></h2>
              <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>Check the MoMo ID against the provider statement before approving. Approving adds the money to the wallet.</p>
              {data.topups.length === 0 && <Empty text="No top-up requests." />}
              <div className="space-y-3">
                {data.topups.map((t) => (
                  <div key={t.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold">{t.driverName}</span>
                      <span className="text-sm">{t.driverPhone}</span>
                      <span className="text-sm font-medium">{formatCurrency(t.amount)}</span>
                      <span className="text-sm uppercase">{t.method}</span>
                      {t.reference && <span className="text-sm font-mono">{t.reference}</span>}
                      <span className="text-xs ml-auto" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(t.requestedAt)}</span>
                    </div>
                    {open === `t:${t.id}:reject` ? (
                      <NoteBox placeholder="Why is this top-up refused?" confirm="Refuse top-up" danger busy={busy === t.id}
                        onCancel={() => setOpen(null)} onConfirm={(note) => run(t.id, async () => {
                          const r = await rejectWalletTopUpRequest(t.id, note);
                          return { success: !!r.success, error: (r as { error?: string }).error, message: 'Top-up refused.' };
                        })} />
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <button className="btn btn-primary btn-sm" disabled={busy === t.id}
                          onClick={() => run(t.id, async () => {
                            const r = await approveWalletTopUpRequest(t.id);
                            return { success: !!r.success, error: (r as { error?: string }).error, message: 'Top-up approved.' };
                          })}>{busy === t.id ? 'Approving…' : 'Approve'}</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(`t:${t.id}:reject`)}>Refuse</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
