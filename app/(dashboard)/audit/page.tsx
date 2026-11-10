'use client';

import { Fragment, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { listAuditLogs, type AuditFilter } from '@/app/actions/audit';
import { formatDateTime } from '@/lib/utils';

const GROUPS: { label: string; prefix: string }[] = [
  { label: 'Everything', prefix: '' },
  { label: 'Sessions', prefix: 'session.' },
  { label: 'Readings', prefix: 'reading.' },
  { label: 'Shifts', prefix: 'shift.' },
  { label: 'Daily close', prefix: 'day.' },
  { label: 'Limits', prefix: 'limits.' },
  { label: 'Payments', prefix: 'payment.' },
];

/** Plain-English names for the action codes written by the app. */
const ACTION_LABEL: Record<string, string> = {
  'session.start': 'Started a session',
  'session.finish': 'Finished a session',
  'payment.collect': 'Took a payment',
  'session.void.request': 'Asked to void a session',
  'session.void.approve': 'Approved a void',
  'session.void.reject': 'Kept a session (void refused)',
  'session.void.direct': 'Voided a session',
  'reading.accept': 'Accepted a flagged reading',
  'reading.problem': 'Marked a reading as a problem',
  'shift.start': 'Started a shift',
  'shift.close': 'Closed a shift',
  'shift.close.variance': 'Closed a shift with a cash difference',
  'day.close': 'Closed the day',
  'limits.update': 'Changed the station limits',
};

export default function AuditPage() {
  const [prefix, setPrefix] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filter: AuditFilter = { actionPrefix: prefix, search, from, to };
  const q = useInfiniteQuery({
    queryKey: ['audit', prefix, search, from, to],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await listAuditLogs({ ...filter, before: pageParam });
      if (!res.success) throw new Error(res.error);
      return res;
    },
    getNextPageParam: (last) => (last.hasMore ? last.data[last.data.length - 1]?.createdAt : undefined),
    refetchInterval: false,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) || [];

  return (
    <div>
      <TopBar title="Audit Log" subtitle="Who did what, and when. Entries cannot be edited or deleted." />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="stat-card grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div><label className="form-label">Type</label>
            <select className="form-select" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
              {GROUPS.map((g) => <option key={g.label} value={g.prefix}>{g.label}</option>)}
            </select></div>
          <div><label className="form-label">Person or action</label><input className="form-input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><label className="form-label">From</label><input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="form-label">To</label><input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>

        {q.error && <div className="stat-card text-sm text-red-700">{(q.error as Error).message}</div>}
        <div className="stat-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th></tr></thead>
              <tbody>
                {q.isLoading && <tr><td colSpan={4} className="text-center py-6">Loading…</td></tr>}
                {!q.isLoading && rows.length === 0 && <tr><td colSpan={4} className="text-center py-6" style={{ color: 'var(--muted-foreground)' }}>Nothing recorded for this filter.</td></tr>}
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="cursor-pointer" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                      <td className="whitespace-nowrap text-[12px]">{formatDateTime(r.createdAt)}</td>
                      <td className="whitespace-nowrap">{r.actorName}<span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}> · {r.actorRole.replace('_', ' ')}</span></td>
                      <td>{ACTION_LABEL[r.action] || r.action}</td>
                      <td className="text-[12px] font-mono whitespace-nowrap">{String(r.metadata.receiptNumber || r.resourceId || '').slice(0, 24)}</td>
                    </tr>
                    {openId === r.id && (
                      <tr>
                        <td colSpan={4}>
                          <pre className="text-[12px] whitespace-pre-wrap break-words rounded-lg p-3" style={{ background: 'var(--muted)' }}>{JSON.stringify(r.metadata, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {q.hasNextPage && (
          <button className="btn btn-secondary" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
          </button>
        )}
      </div>
    </div>
  );
}
