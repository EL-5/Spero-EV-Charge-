'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { CollectPanel, FinishPanel, ReceiptCard } from '@/components/attend/SessionPanels';
import { VoidRequest } from '@/components/attend/VoidRequest';
import { useGunSession, useRefreshAttend } from '@/components/attend/use-workspace';

/**
 * Finish → collect → receipt for one session.
 *  - phones and upright tablets: one step at a time
 *  - tablets lying down: finish on the left, collect (then the receipt) on the right
 */
export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, isLoading, error } = useGunSession(id);
  const refresh = useRefreshAttend();
  const router = useRouter();

  const changed = () => refresh(id);

  const step = !s ? 'finish' : s.status === 'active' ? 'finish' : s.status === 'pending_payment' ? 'collect' : 'done';

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/attend')}
          aria-label="Back to home"
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-line bg-white"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <h1 className="att-display flex-1 text-[28px] font-bold">
          {step === 'finish' ? 'Log the kWh' : step === 'collect' ? 'Collect payment' : 'Receipt'}
        </h1>
        {s && (
          <>
            <span className="att-chip att-chip-mute">Gun {s.gun}</span>
            <span className="att-chip att-chip-mute">{s.receiptNumber}</span>
          </>
        )}
      </div>

      {isLoading && <div className="py-16 text-center text-ink-soft">Loading…</div>}
      {error && <div className="att-card p-5 text-sm text-[#9b1c13]">{(error as Error).message}</div>}

      {s && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className={step === 'finish' ? 'min-w-0' : 'no-print hidden min-w-0 lg:block'}>
            <FinishPanel session={s} onChanged={changed} />
          </div>
          <div className={step === 'finish' ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
            {step === 'done' ? (
              <ReceiptCard session={s} onNew={() => router.push('/attend/new')} />
            ) : (
              <CollectPanel session={s} onChanged={changed} />
            )}
          </div>
        </div>
      )}

      {s && step !== 'finish' && <VoidRequest session={s} onChanged={changed} />}
    </div>
  );
}
