'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { closeDay, getDailyClose, listDailyCloses } from '@/app/actions/daily-close';
import { energyCheck, moneyCheck, parseReading, roundKwh, machineTotalsAdd, type StationLimits, DEFAULT_LIMITS } from '@/lib/gun-session';
import { formatCurrency, formatDateTime } from '@/lib/utils';

const todayStr = () => new Date().toISOString().slice(0, 10);
const prettyDate = (d: string) => new Date(`${d}T00:00:00.000Z`).toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

type NoteKey = 'momo' | 'wallet' | 'energy_a' | 'energy_b' | 'energy_total';

/** One comparison line: what the system says, what the outside world says, and the difference. */
function Line({ label, left, right, diff, ok, unit, children }: {
  label: string; left: string; right: string; diff: string; ok: boolean; unit?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: ok ? 'var(--border)' : '#e8b4ae', background: ok ? undefined : '#fff5f3' }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="font-semibold w-40">{label}</div>
        <div className="text-sm tabular-nums">{left}</div>
        <div className="text-sm tabular-nums">{right}</div>
        <div className={`text-sm font-semibold tabular-nums sm:ml-auto ${ok ? 'text-green-700' : 'text-red-700'}`}>
          {ok ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> matches</span> : <span className="inline-flex items-center gap-1"><AlertTriangle size={14} /> {diff}{unit}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function DailyClosePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const { data, error, isLoading } = useQuery({
    queryKey: ['daily-close', date],
    queryFn: async () => {
      const res = await getDailyClose(date);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: false,
    staleTime: 0,
  });
  const { data: history } = useQuery({
    queryKey: ['daily-close-history'],
    queryFn: async () => {
      const res = await listDailyCloses();
      return res.success ? res.data : [];
    },
    refetchInterval: false,
  });

  const [f, setF] = useState({ statement: '', a: '', b: '', total: '', oa: '', ob: '', ot: '' });
  const [notes, setNotes] = useState<Partial<Record<NoteKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setNote = (k: NoteKey) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes((p) => ({ ...p, [k]: e.target.value }));

  // Re-use the same rules the server applies, so the screen and the save agree.
  const limits: StationLimits = { ...DEFAULT_LIMITS, energyGapPercent: data?.energyGapPercent ?? DEFAULT_LIMITS.energyGapPercent };
  const statement = f.statement.trim() === '' ? null : Number(f.statement.replace(/[^\d.]/g, ''));
  const aEnd = parseReading(f.a), bEnd = parseReading(f.b), tEnd = parseReading(f.total);
  const opening = data?.opening ?? (() => {
    const oa = parseReading(f.oa), ob = parseReading(f.ob), ot = parseReading(f.ot);
    return oa !== null && ob !== null && ot !== null ? { A: oa, B: ob, total: ot } : null;
  })();

  const momo = data && statement !== null && Number.isFinite(statement) ? moneyCheck(data.momo.system, statement) : null;
  const wallet = data ? moneyCheck(data.wallet.system, data.wallet.ledger) : null;
  const eA = data && opening && aEnd !== null ? energyCheck(data.recorded.A, aEnd - opening.A, limits) : null;
  const eB = data && opening && bEnd !== null ? energyCheck(data.recorded.B, bEnd - opening.B, limits) : null;
  const eT = data && opening && tEnd !== null ? energyCheck(data.recorded.A + data.recorded.B, tEnd - opening.total, limits) : null;
  const totalsOk = aEnd !== null && bEnd !== null && tEnd !== null ? machineTotalsAdd(aEnd, bEnd, tEnd) : true;

  const flaggedKeys: NoteKey[] = [];
  if (momo?.flagged) flaggedKeys.push('momo');
  if (wallet?.flagged) flaggedKeys.push('wallet');
  if (eA?.flagged) flaggedKeys.push('energy_a');
  if (eB?.flagged) flaggedKeys.push('energy_b');
  if (eT?.flagged) flaggedKeys.push('energy_total');
  const notesDone = flaggedKeys.every((k) => (notes[k] || '').trim().length >= 5);

  const ready = !!data && !data.closed && !data.mustCloseFirst && data.openSessions === 0 && momo && eA && eB && eT && totalsOk && notesDone;

  const submit = async () => {
    if (!data) return;
    if (!confirm(`Close ${prettyDate(date)}? A closed day is locked and cannot be edited.`)) return;
    setBusy(true);
    const res = await closeDay({
      date, momoStatement: f.statement, machineAEnd: f.a, machineBEnd: f.b, machineTotalEnd: f.total,
      openingA: f.oa, openingB: f.ob, openingTotal: f.ot, notes,
    });
    setBusy(false);
    if (!res.success) return toast.error(res.error);
    toast.success('Day closed.');
    setF({ statement: '', a: '', b: '', total: '', oa: '', ob: '', ot: '' });
    setNotes({});
    await qc.invalidateQueries({ queryKey: ['daily-close'] });
    await qc.invalidateQueries({ queryKey: ['daily-close-history'] });
  };

  const noteBox = (k: NoteKey, text: string) => (
    <textarea className="form-input mt-3" rows={2} placeholder={text} value={notes[k] || ''} onChange={setNote(k)} />
  );

  return (
    <div>
      <TopBar title="Daily Close" subtitle="Compare the day’s records with the MoMo statement and the machine’s own counters" />
      <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
        <div className="stat-card flex flex-wrap items-end gap-4">
          <div><label className="form-label">Day</label><input type="date" className="form-input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} /></div>
          <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{prettyDate(date)} · days run midnight to midnight (UTC)</div>
        </div>

        {isLoading && <div className="stat-card text-sm">Loading…</div>}
        {error && <div className="stat-card text-sm text-red-700">{(error as Error).message}</div>}

        {data?.closed && (
          <div className="stat-card space-y-3">
            <div className="flex items-center gap-2 font-semibold"><Lock size={16} /> Closed{data.closedBy ? ` by ${data.closedBy}` : ''}{data.closedAt ? ` · ${formatDateTime(data.closedAt)}` : ''}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>MoMo: system {formatCurrency(data.momo.system)}, statement {formatCurrency(data.momo.statement ?? 0)}</div>
              <div>Wallet: system {formatCurrency(data.wallet.system)}, ledger {formatCurrency(data.wallet.ledger)}</div>
              <div>Recorded: Gun A {data.recorded.A.toFixed(1)} kWh · Gun B {data.recorded.B.toFixed(1)} kWh</div>
              {data.opening && data.closing && (
                <div>Machine moved: A {roundKwh(data.closing.A - data.opening.A).toFixed(1)} · B {roundKwh(data.closing.B - data.opening.B).toFixed(1)} · total {roundKwh(data.closing.total - data.opening.total).toFixed(1)} kWh</div>
              )}
            </div>
            {Object.entries(data.notes).length > 0 && (
              <div className="text-sm space-y-1">
                <div className="font-semibold">Explanations written at close</div>
                {Object.entries(data.notes).map(([k, v]) => <div key={k}><span className="uppercase text-xs mr-2" style={{ color: 'var(--muted-foreground)' }}>{k.replace('_', ' ')}</span>{v}</div>)}
              </div>
            )}
          </div>
        )}

        {data && !data.closed && (
          <>
            {data.mustCloseFirst && (
              <div className="rounded-xl p-4 text-sm font-medium" style={{ background: '#fde7cc', color: '#7a3b00' }}>
                Days are closed in order. Close <button className="underline font-semibold" onClick={() => setDate(data.mustCloseFirst!)}>{data.mustCloseFirst}</button> first.
              </div>
            )}
            {data.openSessions > 0 && (
              <div role="alert" className="rounded-xl p-4 text-sm font-medium" style={{ background: '#fde7cc', color: '#7a3b00' }}>
                {data.openSessions} session{data.openSessions === 1 ? ' is' : 's are'} still charging or waiting for payment. Finish or void {data.openSessions === 1 ? 'it' : 'them'} before closing the day.
              </div>
            )}

            <section className="stat-card space-y-4">
              <h2 className="font-semibold">1. Money</h2>
              <div>
                <label className="form-label">MoMo statement total for the day (GHS)</label>
                <input inputMode="decimal" className="form-input max-w-xs" placeholder="0.00" value={f.statement} onChange={set('statement')} />
                <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Take it from the mobile money provider’s statement, not from this app.
                  {data.momoVoided > 0 && ` The system figure includes ${formatCurrency(data.momoVoided)} from voided sessions, which is still on the statement.`}
                </p>
              </div>
              {momo && (
                <Line label="MoMo" left={`System ${formatCurrency(momo.system)}`} right={`Statement ${formatCurrency(momo.other)}`} diff={`${momo.diff > 0 ? '+' : ''}${momo.diff.toFixed(2)}`} ok={!momo.flagged}>
                  {momo.flagged && noteBox('momo', 'Explain the MoMo difference (at least 5 characters)')}
                </Line>
              )}
              {wallet && (
                <Line label="Wallet" left={`Payments ${formatCurrency(wallet.system)}`} right={`Ledger ${formatCurrency(wallet.other)}`} diff={`${wallet.diff > 0 ? '+' : ''}${wallet.diff.toFixed(2)}`} ok={!wallet.flagged}>
                  {wallet.flagged && noteBox('wallet', 'Explain the wallet difference')}
                </Line>
              )}
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>The station takes no cash, so there is no cash count.</p>
            </section>

            <section className="stat-card space-y-4">
              <h2 className="font-semibold">2. Energy</h2>
              {data.needsOpening && (
                <div className="space-y-2">
                  <p className="text-sm">This is the first close. Enter where the machine’s counters stood at the <b>start</b> of the day.</p>
                  <div className="grid grid-cols-3 gap-3 max-w-lg">
                    <div><label className="form-label">Gun A</label><input inputMode="decimal" className="form-input" value={f.oa} onChange={set('oa')} /></div>
                    <div><label className="form-label">Gun B</label><input inputMode="decimal" className="form-input" value={f.ob} onChange={set('ob')} /></div>
                    <div><label className="form-label">Total</label><input inputMode="decimal" className="form-input" value={f.ot} onChange={set('ot')} /></div>
                  </div>
                </div>
              )}
              {data.opening && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Counters at the start of the day: A {data.opening.A.toFixed(1)} · B {data.opening.B.toFixed(1)} · total {data.opening.total.toFixed(1)}
                </p>
              )}
              <div className="text-sm">Attendants recorded <b>{data.recorded.A.toFixed(1)}</b> kWh on Gun A and <b>{data.recorded.B.toFixed(1)}</b> kWh on Gun B ({roundKwh(data.recorded.A + data.recorded.B).toFixed(1)} kWh together, voided sessions included because the machine still delivered that energy).</div>
              <div>
                <div className="text-sm font-medium mb-2">Read the machine now and enter the three counters</div>
                <div className="grid grid-cols-3 gap-3 max-w-lg">
                  <div><label className="form-label">Gun A</label><input inputMode="decimal" className="form-input" value={f.a} onChange={set('a')} /></div>
                  <div><label className="form-label">Gun B</label><input inputMode="decimal" className="form-input" value={f.b} onChange={set('b')} /></div>
                  <div><label className="form-label">Total</label><input inputMode="decimal" className="form-input" value={f.total} onChange={set('total')} /></div>
                </div>
              </div>
              {!totalsOk && <div className="text-sm text-red-700">Gun A plus Gun B does not equal the total. Check the three numbers.</div>}
              {([['Gun A', eA, 'energy_a'], ['Gun B', eB, 'energy_b'], ['Both guns', eT, 'energy_total']] as const).map(([label, e, key]) => e && (
                <Line key={key} label={label} left={`Recorded ${e.recorded.toFixed(1)} kWh`} right={`Machine ${e.machine.toFixed(1)} kWh`} diff={`${e.diff > 0 ? '+' : ''}${e.diff.toFixed(1)} (${e.percent}%)`} unit=" kWh" ok={!e.flagged}>
                  {e.flagged && noteBox(key, `Explain the ${label} gap (allowed: ${data.energyGapPercent}%)`)}
                </Line>
              ))}
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>If the machine delivered more than was recorded, a session was missed or an end reading was too low. That is the number this check exists to catch.</p>
            </section>

            <button className="btn btn-primary" disabled={!ready || busy} onClick={submit}>{busy ? 'Closing…' : 'Close the day'}</button>
          </>
        )}

        {history && history.length > 0 && (
          <section className="stat-card p-0 overflow-hidden">
            <h2 className="font-semibold p-4 pb-2">Closed days</h2>
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>Day</th><th>MoMo difference</th><th>Wallet difference</th><th>Energy difference</th><th></th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.date} className="cursor-pointer" onClick={() => setDate(h.date)}>
                      <td className="font-medium whitespace-nowrap">{h.date}</td>
                      <td className="tabular-nums">{h.momoDiff.toFixed(2)}</td>
                      <td className="tabular-nums">{h.walletDiff.toFixed(2)}</td>
                      <td className="tabular-nums">{h.energyDiff.toFixed(1)} kWh</td>
                      <td>{h.flagged ? <span className="badge" style={{ background: '#fde7cc', color: '#7a3b00' }}>Had a gap</span> : <span className="badge" style={{ background: '#e3f1cc', color: '#2f5a05' }}>Clean</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
