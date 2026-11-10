'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { startGunSession } from '@/app/actions/gun-sessions';
import { GUNS, type Gun } from '@/lib/gun-session';
import type { WorkspaceData } from '@/lib/gun-session-types';
import { WhoPicker, useWho } from './WhoPicker';

interface Props {
  workspace: WorkspaceData;
  onStarted: (sessionId: string) => void;
}

export default function StartSessionPanel({ workspace, onStarted }: Props) {
  const firstFree = GUNS.find((g) => !workspace.guns[g].inUse) ?? null;
  const [pickedGun, setGun] = useState<Gun | null>(null);
  // Derived, not synced: if the chosen gun is taken on another tablet, fall back to a free one.
  const gun: Gun | null = pickedGun && !workspace.guns[pickedGun].inUse ? pickedGun : firstFree;
  const who = useWho();
  const [submitting, setSubmitting] = useState(false);

  const { whoOk, guest } = who;
  const needsShift = !workspace.shift && workspace.user.role === 'attendant';
  const canSubmit = !!gun && whoOk && !needsShift && !submitting;

  const hint = useMemo(() => {
    if (needsShift) return 'Start your shift first.';
    if (!gun) return 'Both guns are in use. Finish a session to free a gun.';
    if (!whoOk) return guest ? 'Enter the car number plate.' : 'Choose the driver and the car.';
    return 'Plug in the gun, then start. You log the kWh after charging.';
  }, [needsShift, gun, whoOk, guest]);

  const submit = async () => {
    if (!canSubmit || !gun) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('gun', gun);
    who.appendTo(fd);
    const res = await startGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Session started on Gun ${gun}`);
    onStarted(res.sessionId);
  };

  return (
    <section aria-label="Start a session" className="att-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="att-display text-2xl font-bold">Start a session</h2>
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
                <span className={`text-[13px] ${selected && !st.inUse ? 'text-[#d3dcec]' : ''}`}>
                  {st.inUse ? 'In use' : 'Free'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <WhoPicker who={who} />

      <div className="flex flex-col gap-2">
        <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
          {submitting ? 'Starting…' : gun ? `Start session on Gun ${gun}` : 'No gun free'}
        </button>
        <div className="text-center text-sm text-ink-soft">{hint}</div>
        <Link href="/attend/past" className="text-center text-sm font-semibold text-navy underline">
          Charged earlier and not recorded? Log a past charge
        </Link>
      </div>
    </section>
  );
}
