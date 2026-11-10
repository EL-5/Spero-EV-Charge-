'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getLimits, saveLimits } from '@/app/actions/limits';
import { DEFAULT_LIMITS, type StationLimits } from '@/lib/gun-session';

/** The numbers that decide when a session or a day is flagged. Changing them is recorded in the audit log. */
export function LimitsPanel({ canEdit }: { canEdit: boolean }) {
  const { data, error } = useQuery({
    queryKey: ['station-limits'],
    queryFn: async () => {
      const res = await getLimits();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: false,
  });
  if (error) return <div className="stat-card text-sm text-red-700">{(error as Error).message}</div>;
  if (!data) return <div className="stat-card text-sm">Loading…</div>;
  return <LimitsForm initial={data} canEdit={canEdit} />;
}

function LimitsForm({ initial, canEdit }: { initial: StationLimits; canEdit: boolean }) {
  const qc = useQueryClient();
  const [gap, setGap] = useState(String(initial.energyGapPercent));
  const [hours, setHours] = useState(String(initial.longSessionHours));
  const [kw, setKw] = useState(String(initial.maxGunKw));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await saveLimits({ energyGapPercent: Number(gap), longSessionHours: Number(hours), maxGunKw: Number(kw) });
    setBusy(false);
    if (!res.success) return toast.error(res.error);
    toast.success('Limits saved.');
    await qc.invalidateQueries({ queryKey: ['station-limits'] });
  };

  return (
    <div className="stat-card space-y-5">
      <div>
        <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Station limits</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
          These decide what is flagged for a manager to check. They never block an attendant from recording a session.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="form-label">Daily energy gap allowed (%)</label>
          <input inputMode="decimal" className="form-input" value={gap} onChange={(e) => setGap(e.target.value)} disabled={!canEdit} />
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            How far the machine’s counters may differ from the recorded kWh before the daily close needs a written reason. Default {DEFAULT_LIMITS.energyGapPercent}%.
          </p>
        </div>
        <div>
          <label className="form-label">Long session after (hours)</label>
          <input inputMode="decimal" className="form-input" value={hours} onChange={(e) => setHours(e.target.value)} disabled={!canEdit} />
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>A session charging longer than this is flagged. Default {DEFAULT_LIMITS.longSessionHours} hours.</p>
        </div>
        <div>
          <label className="form-label">Most one gun can deliver (kW)</label>
          <input inputMode="decimal" className="form-input" value={kw} onChange={(e) => setKw(e.target.value)} disabled={!canEdit} />
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>More kWh than this allows in the time taken is flagged as impossible. Default {DEFAULT_LIMITS.maxGunKw} kW.</p>
        </div>
      </div>
      {canEdit ? (
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save limits'}</button>
      ) : (
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Only the owner can change these.</p>
      )}
    </div>
  );
}
