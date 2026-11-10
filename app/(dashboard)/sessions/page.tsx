'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, Flag, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { getSessionEvidence, listSessionRecords, type RecordFilter } from '@/app/actions/session-records';
import { reviewReading, voidSessionNow } from '@/app/actions/approvals';
import { REVIEW_FLAG_LABEL } from '@/lib/gun-session';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_LABEL: Record<string, string> = { active: 'Charging', pending_payment: 'Waiting for payment', completed: 'Paid', cancelled: 'Voided' };

function Photo({ url, label }: { url: string | null; label: string }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* Signed link that expires in 10 minutes, so next/image optimisation does not apply */}
          <img src={url} alt={label} className="w-full rounded-lg border object-contain bg-black/5" style={{ maxHeight: 320, borderColor: 'var(--border)' }} />
        </a>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          <Camera size={16} className="mr-2" /> No photo
        </div>
      )}
    </div>
  );
}

function Evidence({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuthStore();
  const canAct = user?.role === 'manager' || user?.role === 'super_admin';
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['session-evidence', id],
    queryFn: async () => {
      const res = await getSessionEvidence(id);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 0,
    refetchInterval: false,
  });
  const [mode, setMode] = useState<'none' | 'void' | 'problem'>('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<{ success: boolean; error?: string; message?: string }>, ok: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) return toast.error(res.error || 'Something went wrong.');
    toast.success(res.message || ok);
    setMode('none');
    setNote('');
    await refetch();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="stat-card w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-semibold text-lg">{data ? data.receiptNumber : 'Session'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-black/5"><X size={18} /></button>
        </div>
        {isLoading && <div className="text-sm">Loading…</div>}
        {error && <div className="text-sm text-red-700">{(error as Error).message}</div>}
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {[
                ['Gun', data.gun ? `Gun ${data.gun}` : '—'],
                ['Status', STATUS_LABEL[data.status] || data.status],
                ['Attendant', data.attendantName],
                ['Driver', `${data.driverName}${data.vehiclePlate ? ` · ${data.vehiclePlate}` : ''}`],
                ['Started', formatDateTime(data.startTime)],
                ['Ended', data.endTime ? formatDateTime(data.endTime) : '—'],
                ['Paid by', data.paymentMethod ? data.paymentMethod.toUpperCase() : '—'],
                ['MoMo ID', data.reference || '—'],
              ].map(([k, v]) => (
                <div key={k}><div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{k}</div><div className="font-medium break-words">{v}</div></div>
              ))}
            </div>

            <div className="rounded-xl p-4 text-sm tabular-nums" style={{ background: 'var(--muted)' }}>
              <b>{data.startReading?.toFixed(1)}</b> → <b>{data.endReading !== null ? data.endReading?.toFixed(1) : '…'}</b>
              {data.units !== null && <> = <b>{data.units.toFixed(1)} kWh</b></>}
              {data.rate !== null && <> at {formatCurrency(data.rate)}/kWh</>}
              {data.amount !== null && <> = <b>{formatCurrency(data.amount)}</b></>}
              {data.startGap !== null && Math.abs(data.startGap) > 0 && <div className="mt-1" style={{ color: '#7a3b00' }}>Machine moved {data.startGap.toFixed(1)} kWh since the last recorded end on this gun.</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Photo url={data.startPhotoUrl} label="Display before charging" />
              <Photo url={data.endPhotoUrl} label="Display after charging" />
            </div>

            {data.flags.length > 0 && (
              <div className="rounded-xl p-4 text-sm" style={{ background: '#fde7cc', color: '#7a3b00' }}>
                <div className="font-semibold flex items-center gap-2"><Flag size={14} /> Flagged</div>
                <ul className="list-disc pl-5 mt-1">{data.flags.map((f) => <li key={f}>{REVIEW_FLAG_LABEL[f] || f}</li>)}</ul>
                {data.reviewed && <div className="mt-2">Reviewed: <b>{data.reviewDecision === 'accepted' ? 'accepted' : 'marked as a problem'}</b>{data.reviewNote ? ` — ${data.reviewNote}` : ''}</div>}
              </div>
            )}
            {data.status === 'cancelled' && (
              <div className="rounded-xl p-4 text-sm" style={{ background: '#fde2df', color: '#7f1710' }}>
                <b>Voided.</b> {data.voidReason}
                {data.refundDue ? <div className="mt-1 font-semibold">GHS {data.refundDue.toFixed(2)} still has to be paid back to the driver by MoMo.</div> : null}
              </div>
            )}
            {data.voidPending && <div className="text-sm font-medium">A void request is waiting in Approvals.</div>}

            {canAct && data.status !== 'cancelled' && data.status !== 'active' && (
              <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                {mode === 'none' ? (
                  <div className="flex flex-wrap gap-2">
                    {data.flags.length > 0 && !data.reviewed && (
                      <>
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => reviewReading({ sessionId: id, decision: 'accepted' }), 'Reading accepted.')}>Accept reading</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setMode('problem')}>Mark as problem</button>
                      </>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => setMode('void')}>Void session</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="form-label">{mode === 'void' ? 'Why is this session being voided?' : 'What is wrong with this reading?'}</label>
                    <textarea className="form-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => { setMode('none'); setNote(''); }} disabled={busy}>Cancel</button>
                      {mode === 'void' ? (
                        <button className="btn btn-danger btn-sm" disabled={busy || note.trim().length < 5}
                          onClick={() => { if (confirm('Void this session? Money is returned or marked as owed. This cannot be undone.')) act(() => voidSessionNow({ sessionId: id, reason: note }), 'Voided.'); }}>
                          {busy ? 'Voiding…' : 'Void session'}
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" disabled={busy || note.trim().length < 5}
                          onClick={() => act(() => reviewReading({ sessionId: id, decision: 'problem', note }), 'Marked as a problem.')}>
                          {busy ? 'Saving…' : 'Mark as problem'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionsInner() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [gun, setGun] = useState<RecordFilter['gun']>('all');
  const [view, setView] = useState<NonNullable<RecordFilter['view']>>('all');
  // Arriving from the approvals page with ?open=<id> opens that session straight away
  const [openId, setOpenId] = useState<string | null>(params.get('open'));

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['session-records', from, to, gun, view],
    queryFn: async () => {
      const res = await listSessionRecords({ from, to, gun, view });
      if (!res.success) throw new Error(res.error);
      return res;
    },
    refetchInterval: 30_000,
  });
  const rows = data?.data || [];
  const kwh = rows.filter((r) => r.status !== 'cancelled').reduce((s, r) => s + (r.units || 0), 0);

  return (
    <div>
      <TopBar title="Sessions" subtitle="Every recorded session, with the meter photos as evidence" />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="stat-card grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div><label className="form-label">From</label><input type="date" className="form-input" value={from} max={to} onChange={(e) => setFrom(e.target.value || today())} /></div>
          <div><label className="form-label">To</label><input type="date" className="form-input" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value || today())} /></div>
          <div><label className="form-label">Gun</label>
            <select className="form-select" value={gun} onChange={(e) => setGun(e.target.value as RecordFilter['gun'])}>
              <option value="all">Both guns</option><option value="A">Gun A</option><option value="B">Gun B</option>
            </select></div>
          <div><label className="form-label">Show</label>
            <select className="form-select" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              <option value="all">Everything</option><option value="unreviewed">Flagged, not reviewed</option><option value="flagged">All flagged</option>
              <option value="unpaid">Waiting for payment</option><option value="voided">Voided</option>
            </select></div>
          <Link href="/sessions/legacy" className="text-xs underline sm:text-right" style={{ color: 'var(--muted-foreground)' }}>Older charger sessions</Link>
        </div>

        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {rows.length} session{rows.length === 1 ? '' : 's'} · {kwh.toFixed(1)} kWh{isFetching && !isLoading ? ' · updating…' : ''}
          {data?.capped && ' · showing the latest 300, narrow the dates to see the rest'}
        </div>

        {error && <div className="stat-card text-sm text-red-700">{(error as Error).message}</div>}
        <div className="stat-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Receipt</th><th>Gun</th><th>Started</th><th>Driver</th><th>Attendant</th><th>kWh</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="text-center py-6">Loading…</td></tr>}
                {!isLoading && rows.length === 0 && <tr><td colSpan={9} className="text-center py-6" style={{ color: 'var(--muted-foreground)' }}>No sessions match.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="font-medium whitespace-nowrap">{r.receiptNumber}</td>
                    <td>{r.gun || '—'}</td>
                    <td className="whitespace-nowrap text-[12px]">{formatDateTime(r.startTime)}</td>
                    <td className="whitespace-nowrap">{r.driverName}{r.vehiclePlate ? <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}> · {r.vehiclePlate}</span> : null}</td>
                    <td className="whitespace-nowrap">{r.attendantName}</td>
                    <td className="tabular-nums">{r.units !== null ? r.units.toFixed(1) : '—'}</td>
                    <td className="tabular-nums whitespace-nowrap">{r.amount !== null ? formatCurrency(r.amount) : '—'}</td>
                    <td className="whitespace-nowrap">
                      <span className="badge" style={{ background: 'var(--muted)' }}>{STATUS_LABEL[r.status] || r.status}</span>
                      {r.flags.length > 0 && <span className="badge ml-1" style={{ background: r.reviewed ? '#e3f1cc' : '#fde7cc', color: r.reviewed ? '#2f5a05' : '#7a3b00' }}><Flag size={10} /> {r.reviewed ? 'Reviewed' : 'Check'}</span>}
                    </td>
                    <td className="text-xs underline whitespace-nowrap">Photos</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {openId && (
        <Evidence id={openId} onClose={() => setOpenId(null)} onChanged={() => { qc.invalidateQueries({ queryKey: ['session-records'] }); qc.invalidateQueries({ queryKey: ['approval-count'] }); }} />
      )}
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsInner />
    </Suspense>
  );
}
