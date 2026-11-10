'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAttendantWorkspace, getGunSession } from '@/app/actions/gun-sessions';

export const WORKSPACE_KEY = ['attend-workspace'] as const;

/** Home-screen data. Refreshes itself, so two tablets see the same guns. */
export function useWorkspace() {
  return useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: async () => {
      const res = await getAttendantWorkspace();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
}

export function useGunSession(id: string) {
  return useQuery({
    queryKey: ['attend-session', id],
    queryFn: async () => {
      const res = await getGunSession(id);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 10000,
  });
}

/** Call after any write so every screen shows the new state straight away. */
export function useRefreshAttend() {
  const qc = useQueryClient();
  return async (sessionId?: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      sessionId ? qc.invalidateQueries({ queryKey: ['attend-session', sessionId] }) : Promise.resolve(),
    ]);
  };
}
