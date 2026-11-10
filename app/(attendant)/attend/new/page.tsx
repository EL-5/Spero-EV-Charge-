'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import StartSessionPanel from '@/components/attend/StartSessionPanel';
import { useRefreshAttend, useWorkspace } from '@/components/attend/use-workspace';

export default function NewSessionPage() {
  const { data: ws, isLoading, error } = useWorkspace();
  const refresh = useRefreshAttend();
  const router = useRouter();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/attend')}
          aria-label="Back to home"
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-line bg-white"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
        <h1 className="att-display text-[28px] font-bold">Start a session</h1>
      </div>

      {isLoading && <div className="py-16 text-center text-ink-soft">Loading…</div>}
      {error && <div className="att-card p-5 text-sm text-[#9b1c13]">{(error as Error).message}</div>}
      {ws && (
        <StartSessionPanel
          workspace={ws}
          onStarted={async () => {
            await refresh();
            router.push('/attend');
          }}
        />
      )}
    </div>
  );
}
