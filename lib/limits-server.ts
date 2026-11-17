import { supabaseAdmin } from '@/lib/supabase-server';
import { DEFAULT_LIMITS, type StationLimits } from '@/lib/gun-session';

/**
 * The limits the manager has set, or the built-in defaults when the table is
 * missing or empty. Never throws: a flagging rule must not stop a session.
 */
// The limits change rarely and every finished session reads them, so keep them for a short while.
const TTL_MS = 30_000;
let cached: { at: number; value: StationLimits } | null = null;

/** Call after the limits are saved so the next read sees the new numbers. */
export function clearLimitsCache() {
  cached = null;
}

export async function loadLimits(): Promise<StationLimits> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = await readLimits();
  cached = { at: Date.now(), value };
  return value;
}

async function readLimits(): Promise<StationLimits> {
  try {
    const { data, error } = await supabaseAdmin
      .from('station_limits')
      .select('energy_gap_percent, long_session_hours, max_gun_kw')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_LIMITS;
    const n = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
    return {
      energyGapPercent: n(data.energy_gap_percent, DEFAULT_LIMITS.energyGapPercent),
      longSessionHours: n(data.long_session_hours, DEFAULT_LIMITS.longSessionHours),
      maxGunKw: n(data.max_gun_kw, DEFAULT_LIMITS.maxGunKw),
    };
  } catch {
    return DEFAULT_LIMITS;
  }
}
