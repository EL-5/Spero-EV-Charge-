'use client';

import { useRouter } from 'next/navigation';
import StartSessionPanel from '@/components/attend/StartSessionPanel';
import { useRefreshAttend, useWorkspace } from '@/components/attend/use-workspace';
import { DoneToday, Hero, InProgress, StartShiftBanner, greeting, shiftLength, useNow } from '@/components/attend/HomeSections';

export default function AttendHome() {
  const { data: ws, isLoading, error } = useWorkspace();
  const refresh = useRefreshAttend();
  const router = useRouter();
  const now = useNow();

  if (isLoading) return <div className="py-20 text-center text-ink-soft">Loading your workspace…</div>;
  if (error || !ws) {
    return (
      <div className="att-card mx-auto max-w-md p-6 text-center">
        <p className="font-semibold">Could not load your workspace.</p>
        <p className="mt-1 text-sm text-ink-soft">{(error as Error)?.message || 'Check the connection.'}</p>
        <button type="button" className="att-btn att-btn-dark mt-4 w-full" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    );
  }

  const firstName = ws.user.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="att-display text-[28px] font-bold leading-tight lg:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            {new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {ws.shift && (
          <span className="att-chip att-chip-ok gap-2 !text-sm">
            <span className="h-2 w-2 rounded-full bg-brand-green" />
            Shift · {shiftLength(ws.shift.startTime, now)}
          </span>
        )}
      </div>

      {!ws.shift && ws.user.role === 'attendant' && <StartShiftBanner userId={ws.user.id} onStarted={() => refresh()} />}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Hero ws={ws} />
          <InProgress items={ws.inProgress} ws={ws} now={now} />

          {/* Phones and upright tablets: the form is its own screen */}
          <div className="lg:hidden">
            <button type="button" onClick={() => router.push('/attend/new')} className="att-btn att-btn-primary !min-h-[62px] w-full text-lg">
              Start a session
            </button>
          </div>

          <DoneToday items={ws.done} />
        </div>

        {/* Tablets lying down: the form sits beside today's work */}
        <div className="hidden lg:block">
          <StartSessionPanel
            workspace={ws}
            onStarted={async () => {
              await refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
