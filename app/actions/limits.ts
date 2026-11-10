'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { loadLimits } from '@/lib/limits-server';
import type { StationLimits } from '@/lib/gun-session';

type Fail = { success: false; error: string };
const fail = (error: string): Fail => ({ success: false, error });

function authMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  return msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : null;
}

export async function getLimits(): Promise<{ success: true; data: StationLimits } | Fail> {
  try {
    await requireAuth(['super_admin', 'manager']);
    return { success: true, data: await loadLimits() };
  } catch (err) {
    return fail(authMessage(err) || 'Could not load the limits.');
  }
}

/** Only the owner changes the rules that decide what gets flagged. Every change is audited. */
export async function saveLimits(input: StationLimits): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(['super_admin']);
    const gap = Number(input.energyGapPercent);
    const hours = Number(input.longSessionHours);
    const kw = Number(input.maxGunKw);
    if (!(gap >= 0.1 && gap <= 20)) return fail('The energy gap must be between 0.1% and 20%.');
    if (!(hours >= 1 && hours <= 24)) return fail('A long session must be between 1 and 24 hours.');
    if (!(kw >= 10 && kw <= 400)) return fail('The most one gun can deliver must be between 10 and 400 kW.');

    const before = await loadLimits();
    const { error } = await supabaseAdmin.from('station_limits').upsert({
      id: 1,
      energy_gap_percent: gap,
      long_session_hours: hours,
      max_gun_kw: kw,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[LIMITS] save error:', error);
      return fail('Could not save. Run the latest database update (migration 11) and try again.');
    }
    await logAudit({
      actor: user,
      action: 'limits.update',
      resourceType: 'station_limits',
      resourceId: '1',
      metadata: { before, after: { energyGapPercent: gap, longSessionHours: hours, maxGunKw: kw } },
    });
    revalidatePath('/settings');
    return { success: true };
  } catch (err) {
    return fail(authMessage(err) || 'Could not save the limits.');
  }
}
