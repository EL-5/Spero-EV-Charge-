'use server';

import { loadLimits } from '@/lib/limits-server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth, type AuthenticatedUser } from '@/lib/auth-guard';
import { generateReceiptNumber } from '@/lib/utils';
import { logAudit } from '@/lib/audit';
import {
  ACCEPT_CASH,
  AGREED_RATE_PER_KWH,
  GUNS,
  MAX_BACKDATE_DAYS,
  PAY_METHODS,
  billFromUnits,
  evaluateFlags,
  isMomo,
  parseUnits,
  prepaidUnits,
  roundKwh,
  roundMoney,
  type Gun,
  type ReviewFlag,
} from '@/lib/gun-session';
import { executeVoid } from '@/lib/void-session';
import type {
  DriverMatch,
  GunSessionSummary,
  GunSessionView,
  GunStatus,
  GunTotals,
  PricingTier,
  WorkspaceData,
} from '@/lib/gun-session-types';

// ─────────────────────────────────────────────────────────────────────────────
// Manual session recording by gun (A / B).
//
// Everything that matters is decided HERE, not in the browser: the rate, the
// energy (end reading − start reading), the amount, which shift and attendant
// the money belongs to, and whether a session is already paid. The screens only
// send what a person can actually observe — a gun, two display readings, two
// photos and how the driver paid.
// ─────────────────────────────────────────────────────────────────────────────

const STAFF = ['super_admin', 'manager', 'attendant'];
const OVERSIGHT = ['super_admin', 'manager', 'accountant', 'finance'];
const BUCKET = 'meter-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Fail = { success: false; error: string };

interface SessionRow {
  id: string;
  receipt_number: string;
  gun: Gun;
  status: GunSessionSummary['status'];
  payment_status: GunSessionSummary['paymentStatus'];
  driver_name: string | null;
  vehicle_plate: string | null;
  start_time: string;
  end_time: string | null;
  units_consumed: number | string | null;
  total_amount: number | string | null;
  review_flags: string[] | null;
}
interface DriverRow {
  id: string;
  name: string;
  phone: string;
  wallet_balance: number | string | null;
  is_active: boolean | null;
}
interface VehicleRow {
  id: string;
  driver_id: string | null;
  plate_number: string;
  brand: string | null;
  model: string | null;
  battery_capacity: number | string | null;
}
const SESSION_COLUMNS =
  'id, receipt_number, gun, status, payment_status, driver_name, vehicle_plate, start_time, end_time, units_consumed, total_amount, review_flags';
const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;
const fail = (error: string): Fail => ({ success: false, error });

function authMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  return msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : null;
}

function todayStartUtc(): string {
  // Ghana is UTC+0 all year, so the station's "today" starts at 00:00 UTC.
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function periodStartUtc(period: 'today' | 'week' | 'month'): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (period === 'week') d.setUTCDate(d.getUTCDate() - 6);
  if (period === 'month') d.setUTCDate(d.getUTCDate() - 29);
  return d.toISOString();
}

async function getActiveShift(userId: string) {
  const { data } = await supabaseAdmin
    .from('shifts')
    .select('id, start_time')
    .eq('attendant_id', userId)
    .eq('status', 'active')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; start_time: string } | null;
}

type Who =
  | { ok: true; driverId: string | null; vehicleId: string | null; driverName: string; vehiclePlate: string; vehicleDetails: string }
  | { ok: false; error: string };

/** Reads and checks "who is charging" from the form: a registered driver and car, or a guest plate. */
async function resolveWho(formData: FormData): Promise<Who> {
  const isGuest = String(formData.get('isGuest') || '') === 'true';
  if (isGuest) {
    const vehiclePlate = String(formData.get('guestPlate') || '').trim().toUpperCase();
    const driverName = String(formData.get('guestName') || '').trim() || 'Guest';
    if (vehiclePlate.length < 3) return { ok: false, error: 'Enter the car number plate for a guest.' };
    return { ok: true, driverId: null, vehicleId: null, driverName, vehiclePlate, vehicleDetails: 'Guest vehicle' };
  }
  const driverId = String(formData.get('driverId') || '') || null;
  const vehicleId = String(formData.get('vehicleId') || '') || null;
  if (!driverId || !vehicleId) return { ok: false, error: 'Choose the driver and the car.' };
  const [d, v] = await Promise.all([
    supabaseAdmin.from('drivers').select('name, is_active').eq('id', driverId).maybeSingle(),
    supabaseAdmin.from('vehicles').select('plate_number, brand, model, driver_id').eq('id', vehicleId).maybeSingle(),
  ]);
  if (!d.data) return { ok: false, error: 'Driver not found.' };
  if (d.data.is_active === false) return { ok: false, error: 'This driver account is deactivated.' };
  if (!v.data || v.data.driver_id !== driverId) return { ok: false, error: 'That car does not belong to this driver.' };
  return {
    ok: true,
    driverId,
    vehicleId,
    driverName: d.data.name,
    vehiclePlate: v.data.plate_number,
    vehicleDetails: [v.data.brand, v.data.model].filter(Boolean).join(' ') || 'Vehicle',
  };
}

type ResolvedRate = { ok: true; id: string | null; perUnit: number; unitType: 'kwh' | 'time' } | { ok: false; error: string };

/**
 * The price for a session: the tier the attendant picked (Settings → Pricing), or the newest
 * active kWh price. With no price set at all, the agreed GHS 5.50 per kWh applies.
 */
async function resolveRate(pricingId: string | null): Promise<ResolvedRate> {
  if (pricingId) {
    const { data } = await supabaseAdmin
      .from('pricing')
      .select('id, rate, unit_quantity, unit_type, is_active')
      .eq('id', pricingId)
      .maybeSingle();
    if (!data || data.is_active === false) return { ok: false, error: 'That price is no longer available. Pick another.' };
    const perUnit = Number(data.rate) / Number(data.unit_quantity || 1);
    if (!(perUnit > 0)) return { ok: false, error: 'That price is not set up correctly. Ask a manager.' };
    return { ok: true, id: data.id as string, perUnit, unitType: data.unit_type === 'time' ? 'time' : 'kwh' };
  }
  const { data } = await supabaseAdmin
    .from('pricing')
    .select('id, rate, unit_quantity')
    .eq('unit_type', 'kwh')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: true, id: null, perUnit: AGREED_RATE_PER_KWH, unitType: 'kwh' };
  const perUnit = Number(data.rate) / Number(data.unit_quantity || 1);
  return { ok: true, id: data.id as string, perUnit: perUnit > 0 ? perUnit : AGREED_RATE_PER_KWH, unitType: 'kwh' };
}

/** The prices an attendant can choose from, newest first. */
async function loadTiers(): Promise<PricingTier[]> {
  const { data } = await supabaseAdmin
    .from('pricing')
    .select('id, rate, unit_quantity, unit_type')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return ((data || []) as { id: string; rate: number | string; unit_quantity: number | string | null; unit_type: string }[])
    .map((r) => {
      const quantity = Number(r.unit_quantity || 1) || 1;
      return {
        id: r.id,
        unitType: (r.unit_type === 'time' ? 'time' : 'kwh') as 'kwh' | 'time',
        rate: Number(r.rate),
        unitQuantity: quantity,
        perUnit: Number(r.rate) / quantity,
      };
    })
    .filter((r) => r.perUnit > 0);
}

/** A photo that may be left out. A file that is there must still be a valid image. */
function optionalPhoto(formData: FormData, key: string, label: string): { file: File | null; error?: string } {
  const v = formData.get(key);
  if (!(v instanceof File) || v.size === 0) return { file: null };
  const ok = validatePhoto(v);
  return ok.ok ? { file: ok.file } : { file: null, error: `${label}: ${ok.error}` };
}

function toSummary(row: SessionRow): GunSessionSummary {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    gun: row.gun,
    status: row.status,
    paymentStatus: row.payment_status ?? null,
    driverName: row.driver_name || 'Guest',
    vehiclePlate: row.vehicle_plate || '',
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    units: row.units_consumed === null || row.units_consumed === undefined ? null : Number(row.units_consumed),
    amount: row.total_amount === null || row.total_amount === undefined ? null : Number(row.total_amount),
    flags: (row.review_flags || []) as ReviewFlag[],
  };
}

function validatePhoto(file: unknown): { ok: true; file: File } | { ok: false; error: string } {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Take a photo of the machine display first.' };
  }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'The photo must be an image.' };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: 'The photo is too large. Take it again.' };
  return { ok: true, file };
}

async function uploadPhoto(path: string, file: File): Promise<string | null> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    console.error('[GUN] photo upload failed:', error.message);
    return error.message;
  }
  return null;
}

async function removePhoto(path: string) {
  await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => undefined);
}

function extFor(file: File): string {
  if (file.type.includes('png')) return 'png';
  if (file.type.includes('webp')) return 'webp';
  if (file.type.includes('heic')) return 'heic';
  return 'jpg';
}

function canActOn(user: AuthenticatedUser, ownerId: string | null): boolean {
  return user.role === 'super_admin' || user.role === 'manager' || ownerId === user.id;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Everything the attendant home screen shows, in one round trip. */
export async function getAttendantWorkspace(): Promise<{ success: true; data: WorkspaceData } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const dayStart = todayStartUtc();

    const [shift, activeRes, mineRes, pendingRes, rates] = await Promise.all([
      getActiveShift(user.id),
      supabaseAdmin
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('status', 'active')
        .not('gun', 'is', null),
      supabaseAdmin
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('attendant_id', user.id)
        .eq('recording_mode', 'manual_gun')
        .gte('created_at', dayStart)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('attendant_id', user.id)
        .eq('recording_mode', 'manual_gun')
        .eq('status', 'pending_payment')
        .order('start_time', { ascending: false })
        .limit(50),
      loadTiers(),
    ]);

    if (activeRes.error) throw activeRes.error;
    if (mineRes.error) throw mineRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const active = ((activeRes.data || []) as unknown as SessionRow[]).map(toSummary);
    const mine = ((mineRes.data || []) as unknown as SessionRow[]).map(toSummary);
    const pending = ((pendingRes.data || []) as unknown as SessionRow[]).map(toSummary);

    const gunStatus = (gun: Gun): GunStatus => {
      const s = active.find((a) => a.gun === gun) || null;
      return { gun, inUse: !!s, session: s };
    };

    const counted = mine.filter((s) => s.status !== 'cancelled');
    const perGun: WorkspaceData['today']['perGun'] = { A: { kwh: 0, sessions: 0 }, B: { kwh: 0, sessions: 0 } };
    for (const s of counted) {
      perGun[s.gun].sessions += 1;
      perGun[s.gun].kwh += s.units ?? 0;
    }
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      success: true,
      data: {
        user: { id: user.id, name: user.name, role: user.role },
        shift: shift ? { id: shift.id, startTime: shift.start_time } : null,
        guns: { A: gunStatus('A'), B: gunStatus('B') },
        today: {
          kwh: round1(perGun.A.kwh + perGun.B.kwh),
          sessions: counted.length,
          paid: counted.filter((s) => s.paymentStatus === 'paid').length,
          perGun: {
            A: { kwh: round1(perGun.A.kwh), sessions: perGun.A.sessions },
            B: { kwh: round1(perGun.B.kwh), sessions: perGun.B.sessions },
          },
        },
        inProgress: mine.filter((s) => s.status === 'active'),
        pending,
        done: mine.filter((s) => s.status !== 'active' && s.status !== 'pending_payment').slice(0, 12),
        rates,
      },
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] getAttendantWorkspace error:', err);
    // 42703 = column missing, 42P01 = table missing: the database update has not been run.
    const code = errorCode(err);
    if (code === '42703' || code === '42P01' || code === 'PGRST204') {
      return fail('The database has not been updated for the attendant app yet. Ask the administrator to run the pending database update (scripts/migrations/apply_pending_08_09_10.sql).');
    }
    return fail('Could not load your workspace. Check the connection and try again.');
  }
}

/** Find a registered driver by name, phone or plate. */
export async function searchDrivers(query: string): Promise<{ success: true; data: DriverMatch[] } | Fail> {
  try {
    await requireAuth(STAFF);
    // Keep only characters that are safe inside a PostgREST filter.
    const q = String(query || '').replace(/[^A-Za-z0-9 +.\-]/g, '').trim();
    if (q.length < 2) return { success: true, data: [] };

    const [byDriver, byPlate] = await Promise.all([
      supabaseAdmin.from('drivers').select('id').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8),
      supabaseAdmin.from('vehicles').select('driver_id').ilike('plate_number', `%${q}%`).limit(8),
    ]);

    const ids = Array.from(
      new Set([
        ...((byDriver.data || []) as { id: string }[]).map((d) => d.id),
        ...((byPlate.data || []) as { driver_id: string | null }[]).map((v) => v.driver_id).filter((x): x is string => !!x),
      ])
    ).slice(0, 8);
    if (ids.length === 0) return { success: true, data: [] };

    const [drivers, vehicles] = await Promise.all([
      supabaseAdmin.from('drivers').select('id, name, phone, wallet_balance, is_active').in('id', ids),
      supabaseAdmin.from('vehicles').select('id, driver_id, plate_number, brand, model, battery_capacity').in('driver_id', ids),
    ]);

    const driverRows = (drivers.data || []) as unknown as DriverRow[];
    const vehicleRows = (vehicles.data || []) as unknown as VehicleRow[];
    const data: DriverMatch[] = driverRows.map((d) => ({
      driverId: d.id,
      name: d.name,
      phone: d.phone,
      walletBalance: Number(d.wallet_balance || 0),
      isActive: d.is_active !== false,
      vehicles: vehicleRows
        .filter((v) => v.driver_id === d.id)
        .map((v) => ({
          id: v.id,
          plate: v.plate_number,
          label: [v.brand, v.model].filter(Boolean).join(' ') || 'Vehicle',
          batteryKwh: v.battery_capacity ? Number(v.battery_capacity) : null,
        })),
    }));
    return { success: true, data };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] searchDrivers error:', err);
    return fail('Search failed. Try again.');
  }
}

/** Every active registered driver with their cars, for the drop-down on the start screen. */
export async function listDriversForPicker(): Promise<{ success: true; data: DriverMatch[] } | Fail> {
  try {
    await requireAuth(STAFF);
    const { data: drivers, error } = await supabaseAdmin
      .from('drivers')
      .select('id, name, phone, wallet_balance, is_active')
      .neq('is_active', false)
      .order('name', { ascending: true })
      .limit(1000);
    if (error) throw error;
    const driverRows = (drivers || []) as unknown as DriverRow[];
    if (driverRows.length === 0) return { success: true, data: [] };

    const { data: vehicles, error: vErr } = await supabaseAdmin
      .from('vehicles')
      .select('id, driver_id, plate_number, brand, model, battery_capacity')
      .in('driver_id', driverRows.map((d) => d.id));
    if (vErr) throw vErr;
    const vehicleRows = (vehicles || []) as unknown as VehicleRow[];

    return {
      success: true,
      data: driverRows.map((d) => ({
        driverId: d.id,
        name: d.name,
        phone: d.phone,
        walletBalance: Number(d.wallet_balance || 0),
        isActive: true,
        vehicles: vehicleRows
          .filter((v) => v.driver_id === d.id)
          .map((v) => ({
            id: v.id,
            plate: v.plate_number,
            label: [v.brand, v.model].filter(Boolean).join(' ') || 'Vehicle',
            batteryKwh: v.battery_capacity ? Number(v.battery_capacity) : null,
          })),
      })),
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] listDriversForPicker error:', err);
    return fail('Could not load the drivers. Try again.');
  }
}

export interface HistoryFilter {
  from: string; // YYYY-MM-DD (Ghana time = UTC)
  to: string;
  gun?: Gun | 'all';
  status?: 'all' | 'paid' | 'unpaid' | 'voided';
  /** start_time of the last row already shown, for the next page */
  before?: string;
}

const HISTORY_PAGE = 40;

/** The signed-in person's own sessions, newest first, with totals for the whole range. */
export async function listMySessions(f: HistoryFilter): Promise<
  | {
      success: true;
      data: GunSessionSummary[];
      hasMore: boolean;
      totals: { sessions: number; kwh: number; collected: number; unpaid: number; voided: number };
    }
  | Fail
> {
  try {
    const user = await requireAuth(STAFF);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to)) return fail('Choose a valid date range.');
    const end = new Date(`${f.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const fromIso = `${f.from}T00:00:00.000Z`;

    const base = () => {
      let q = supabaseAdmin
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('recording_mode', 'manual_gun')
        .eq('attendant_id', user.id)
        .gte('start_time', fromIso)
        .lt('start_time', end.toISOString());
      if (f.gun === 'A' || f.gun === 'B') q = q.eq('gun', f.gun);
      if (f.status === 'paid') q = q.eq('payment_status', 'paid').neq('status', 'cancelled');
      if (f.status === 'unpaid') q = q.eq('status', 'pending_payment');
      if (f.status === 'voided') q = q.eq('status', 'cancelled');
      return q;
    };

    let page = base().order('start_time', { ascending: false }).limit(HISTORY_PAGE + 1);
    if (f.before) page = page.lt('start_time', f.before);
    const [pageRes, sumRes] = await Promise.all([
      page,
      base().select('status, payment_status, units_consumed, total_amount').limit(5000),
    ]);
    if (pageRes.error) throw pageRes.error;
    if (sumRes.error) throw sumRes.error;

    const totals = { sessions: 0, kwh: 0, collected: 0, unpaid: 0, voided: 0 };
    for (const r of (sumRes.data || []) as unknown as { status: string; payment_status: string | null; units_consumed: number | string | null; total_amount: number | string | null }[]) {
      if (r.status === 'cancelled') {
        totals.voided += 1;
        continue;
      }
      if (r.status === 'active') continue;
      totals.sessions += 1;
      totals.kwh += Number(r.units_consumed || 0);
      if (r.payment_status === 'paid') totals.collected += Number(r.total_amount || 0);
      else totals.unpaid += Number(r.total_amount || 0);
    }

    const rows = ((pageRes.data || []) as unknown as SessionRow[]);
    return {
      success: true,
      hasMore: rows.length > HISTORY_PAGE,
      data: rows.slice(0, HISTORY_PAGE).map(toSummary),
      totals: { ...totals, kwh: roundKwh(totals.kwh), collected: roundMoney(totals.collected), unpaid: roundMoney(totals.unpaid) },
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] listMySessions error:', err);
    return fail('Could not load your history.');
  }
}

/** One session, for the finish / collect / receipt screens. */
export async function getGunSession(sessionId: string): Promise<{ success: true; data: GunSessionView } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const { data: row, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('recording_mode', 'manual_gun')
      .maybeSingle();
    if (error) throw error;
    if (!row) return fail('Session not found.');
    if (!canActOn(user, row.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');

    const [veh, drv, att, pend, pay, proof] = await Promise.all([
      row.vehicle_id
        ? supabaseAdmin.from('vehicles').select('battery_capacity').eq('id', row.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      row.driver_id
        ? supabaseAdmin.from('drivers').select('wallet_balance').eq('id', row.driver_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from('profiles').select('name').eq('id', row.attendant_id).maybeSingle(),
      supabaseAdmin.from('session_void_requests').select('id', { count: 'exact', head: true }).eq('session_id', row.id).eq('status', 'pending'),
      supabaseAdmin.from('payments').select('amount').eq('session_id', row.id).limit(1).maybeSingle(),
      findPaymentProof(row.attendant_id, row.id),
    ]);

    return {
      success: true,
      data: {
        ...toSummary(row as SessionRow),
        mode: row.mode === 'prepaid' ? 'prepaid' : 'postpaid',
        unitType: String(row.unit_type || 'kwh'),
        prepaidAmount: Number(row.prepaid_amount || 0),
        rate: Number(row.rate_at_time || 0),
        paymentMethod: row.payment_method ?? null,
        amountPaid: pay.data ? Number((pay.data as { amount: number | string }).amount) : null,
        isGuest: !row.driver_id,
        walletBalance: drv.data ? Number((drv.data as { wallet_balance?: number | string | null }).wallet_balance || 0) : null,
        batteryKwh:
          veh.data && (veh.data as { battery_capacity?: number | string | null }).battery_capacity
            ? Number((veh.data as { battery_capacity: number | string }).battery_capacity)
            : null,
        attendantName: (att.data as { name?: string } | null)?.name || 'Attendant',
        isMine: row.attendant_id === user.id,
        voidPending: (pend.count || 0) > 0,
        hasPaymentProof: !!proof,
      },
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] getGunSession error:', err);
    return fail('Could not load this session.');
  }
}

/** kWh and session counts per gun and in total, for the management dashboard. */
export async function getGunTotals(period: 'today' | 'week' | 'month' = 'today'): Promise<{ success: true; data: GunTotals } | Fail> {
  try {
    await requireAuth(OVERSIGHT);
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('gun, status, units_consumed')
      .not('gun', 'is', null)
      .neq('status', 'cancelled')
      .gte('created_at', periodStartUtc(period));
    if (error) throw error;

    const perGun: GunTotals['perGun'] = { A: { kwh: 0, sessions: 0 }, B: { kwh: 0, sessions: 0 } };
    let charging = 0;
    let done = 0;
    for (const s of data || []) {
      const g = s.gun as Gun;
      if (!GUNS.includes(g)) continue;
      perGun[g].sessions += 1;
      perGun[g].kwh += Number(s.units_consumed || 0);
      if (s.status === 'active') charging += 1;
      else done += 1;
    }
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      success: true,
      data: {
        period,
        perGun: {
          A: { kwh: r1(perGun.A.kwh), sessions: perGun.A.sessions },
          B: { kwh: r1(perGun.B.kwh), sessions: perGun.B.sessions },
        },
        total: {
          kwh: r1(perGun.A.kwh + perGun.B.kwh),
          sessions: perGun.A.sessions + perGun.B.sessions,
          charging,
          done,
        },
      },
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] getGunTotals error:', err);
    return fail('Could not load gun totals.');
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Step 1: open a session on a gun for a driver (the original "start session").
 *  - postpaid: pay after charging
 *  - prepaid:  a set amount, paid before or after; the kWh follow from the amount
 * The rate is frozen on the session here. The gun is busy until the session is finalized.
 */
export async function startGunSession(
  formData: FormData
): Promise<{ success: true; sessionId: string; receiptNumber: string; mode: 'postpaid' | 'prepaid' } | Fail> {
  try {
    const user = await requireAuth(STAFF);

    const gun = String(formData.get('gun') || '') as Gun;
    if (!GUNS.includes(gun)) return fail('Pick Gun A or Gun B.');

    const mode = String(formData.get('mode') || 'postpaid') === 'prepaid' ? 'prepaid' : 'postpaid';
    let prepaidAmount = 0;
    if (mode === 'prepaid') {
      prepaidAmount = roundMoney(Number(String(formData.get('prepaidAmount') || '').replace(/[^\d.]/g, '')));
      if (!(prepaidAmount >= 1) || prepaidAmount > 100_000) return fail('Enter the prepaid amount in GHS.');
    }

    const shift = await getActiveShift(user.id);
    if (!shift && user.role === 'attendant') return fail('Start your shift before you record a session.');

    const who = await resolveWho(formData);
    if (!who.ok) return fail(who.error);

    // The gun must be free
    const busy = await supabaseAdmin.from('sessions').select('id').eq('gun', gun).eq('status', 'active').limit(1).maybeSingle();
    if (busy.data) return fail(`Gun ${gun} is already in use. Finalize that session first.`);

    // The price is read here and frozen on the session
    const rate = await resolveRate(String(formData.get('pricingId') || '') || null);
    if (!rate.ok) return fail(rate.error);

    const sessionId = randomUUID();
    const receiptNumber = generateReceiptNumber('SC');
    const { error: insertError } = await supabaseAdmin.from('sessions').insert([
      {
        id: sessionId,
        receipt_number: receiptNumber,
        driver_id: who.driverId,
        vehicle_id: who.vehicleId,
        shift_id: shift?.id ?? null,
        attendant_id: user.id,
        driver_name: who.driverName,
        vehicle_plate: who.vehiclePlate,
        vehicle_details: who.vehicleDetails,
        mode,
        unit_type: rate.unitType,
        status: 'active',
        payment_status: 'unpaid',
        rate_at_time: rate.perUnit,
        pricing_id: rate.id,
        prepaid_amount: prepaidAmount,
        // A prepaid session commits to its amount from the start
        total_amount: mode === 'prepaid' ? prepaidAmount : null,
        start_time: new Date().toISOString(),
        gun,
        review_flags: [],
        recording_mode: 'manual_gun',
      },
    ]);
    if (insertError) {
      if (errorCode(insertError) === '23505') return fail(`Gun ${gun} is already in use. Finalize that session first.`);
      console.error('[GUN] startGunSession insert error:', insertError);
      return fail('Could not start the session. Please try again.');
    }

    await logAudit({
      actor: user,
      action: 'session.start',
      resourceType: 'session',
      resourceId: sessionId,
      metadata: { receiptNumber, gun, mode, prepaidAmount, rate: rate.perUnit, driverId: who.driverId, isGuest: !who.driverId },
    });

    revalidatePath('/dashboard');
    return { success: true, sessionId, receiptNumber, mode };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] startGunSession error:', err);
    return fail('Could not start the session. Please try again.');
  }
}

/**
 * Step 2 (the original "finalize session"): the attendant types the units used. The server
 * works out the amount (units × the rate frozen at the start). A prepaid session needs no
 * units: they follow from the prepaid amount. A photo of the machine display is welcome but optional.
 */
export async function finishGunSession(
  formData: FormData
): Promise<{ success: true; units: number; amount: number; flags: ReviewFlag[]; status: 'pending_payment' | 'completed' } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const sessionId = String(formData.get('sessionId') || '');
    if (!sessionId) return fail('Session not found.');
    const photo = optionalPhoto(formData, 'photo', 'Photo');
    if (photo.error) return fail(photo.error);

    const { data: s, error } = await supabaseAdmin
      .from('sessions')
      .select('id, status, recording_mode, gun, mode, unit_type, prepaid_amount, payment_status, rate_at_time, start_time, review_flags, attendant_id, vehicle_id, receipt_number')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.status !== 'active') return fail('This session has already been finalized.');

    const rate = Number(s.rate_at_time);
    let units: number;
    let amount: number;
    if (s.mode === 'prepaid') {
      amount = roundMoney(Number(s.prepaid_amount || 0));
      units = prepaidUnits(amount, rate);
    } else {
      const typed = parseUnits(formData.get('units'));
      if (typed === null) return fail(`Enter the ${s.unit_type === 'kwh' ? 'kWh' : 'units'} used for this charge, for example 15.4.`);
      ({ units, amount } = billFromUnits(typed, rate));
    }
    if (!(amount > 0)) return fail('The amount for this session works out to zero. Check the units.');

    let batteryKwh: number | null = null;
    if (s.vehicle_id) {
      const { data: v } = await supabaseAdmin.from('vehicles').select('battery_capacity').eq('id', s.vehicle_id).maybeSingle();
      batteryKwh = v?.battery_capacity ? Number(v.battery_capacity) : null;
    }
    const endedAt = new Date();
    const newFlags =
      s.unit_type === 'kwh'
        ? evaluateFlags({ startGap: null, units, batteryKwh, startedAt: new Date(s.start_time), endedAt }, await loadLimits())
        : [];
    const flags = Array.from(new Set([...(s.review_flags || []), ...newFlags])) as ReviewFlag[];

    const photoPath = photo.file ? `${s.attendant_id}/${s.id}-end.${extFor(photo.file)}` : null;
    if (photo.file && photoPath) {
      const upErr = await uploadPhoto(photoPath, photo.file);
      if (upErr) return fail('Could not save the photo. Check the connection and try again.');
    }

    // A prepaid session that is already paid is complete; everything else waits for payment.
    const nextStatus: 'pending_payment' | 'completed' = s.mode === 'prepaid' && s.payment_status === 'paid' ? 'completed' : 'pending_payment';

    // Only an active session can be finalized, and only once.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('sessions')
      .update({
        units_consumed: units,
        total_amount: amount,
        end_time: endedAt.toISOString(),
        status: nextStatus,
        review_flags: flags,
        ...(photoPath ? { end_photo_path: photoPath } : {}),
      })
      .eq('id', s.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (updErr || !updated) {
      if (photoPath) await removePhoto(photoPath);
      if (updErr) console.error('[GUN] finishGunSession update error:', updErr);
      return fail(updErr ? 'Could not finalize the session. Please try again.' : 'This session has already been finalized.');
    }

    await logAudit({
      actor: user,
      action: 'session.finish',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, gun: s.gun, mode: s.mode, units, amount, flags, hasPhoto: !!photoPath },
    });

    revalidatePath('/dashboard');
    return { success: true, units, amount, flags, status: nextStatus };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] finishGunSession error:', err);
    return fail('Could not finalize the session. Please try again.');
  }
}

/**
 * A charge that already happened (the original "record past / backdated charge"): the
 * attendant sets the date and time and types the units used; the session goes straight to
 * payment. Always flagged for a manager. Never into a day that has been closed.
 */
export async function logPastGunSession(
  formData: FormData
): Promise<{ success: true; sessionId: string; receiptNumber: string; units: number; amount: number } | Fail> {
  try {
    const user = await requireAuth(STAFF);

    const gun = String(formData.get('gun') || '') as Gun;
    if (!GUNS.includes(gun)) return fail('Pick Gun A or Gun B.');

    // Entered as Ghana time, which is UTC
    const raw = String(formData.get('when') || '');
    const when = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? new Date(`${raw}:00.000Z`) : null;
    if (!when || Number.isNaN(when.getTime())) return fail('Set the date and time of the charge.');
    const now = new Date();
    if (when.getTime() > now.getTime() + 60_000) return fail('The date and time are in the future.');
    if (when.getTime() < now.getTime() - MAX_BACKDATE_DAYS * 86_400_000) {
      return fail(`Charges older than ${MAX_BACKDATE_DAYS} days cannot be added here. Ask a manager.`);
    }

    const typed = parseUnits(formData.get('units'));
    if (typed === null) return fail('Enter the kWh used for the charge.');
    const photo = optionalPhoto(formData, 'photo', 'Photo');
    if (photo.error) return fail(photo.error);

    const shift = await getActiveShift(user.id);
    if (!shift && user.role === 'attendant') return fail('Start your shift before you record a session.');

    const who = await resolveWho(formData);
    if (!who.ok) return fail(who.error);

    // Never into a day a manager has already closed
    const day = when.toISOString().slice(0, 10);
    const { data: closed } = await supabaseAdmin.from('daily_closes').select('close_date').eq('close_date', day).limit(1);
    if (closed && closed.length > 0) return fail(`${day} has already been closed by a manager. Ask a manager to handle this charge.`);

    const rate = await resolveRate(String(formData.get('pricingId') || '') || null);
    if (!rate.ok) return fail(rate.error);
    const { units, amount } = billFromUnits(typed, rate.perUnit);

    let batteryKwh: number | null = null;
    if (who.vehicleId) {
      const { data: v } = await supabaseAdmin.from('vehicles').select('battery_capacity').eq('id', who.vehicleId).maybeSingle();
      batteryKwh = v?.battery_capacity ? Number(v.battery_capacity) : null;
    }
    // No duration is known for a past charge, so only the battery check applies
    const flags = Array.from(
      new Set<ReviewFlag>([
        ...(rate.unitType === 'kwh' ? evaluateFlags({ startGap: null, units, batteryKwh }, await loadLimits()) : []),
        'backdated',
      ])
    );

    const sessionId = randomUUID();
    const photoPath = photo.file ? `${user.id}/${sessionId}-end.${extFor(photo.file)}` : null;
    if (photo.file && photoPath) {
      const upErr = await uploadPhoto(photoPath, photo.file);
      if (upErr) return fail('Could not save the photo. Check the connection and try again.');
    }

    const receiptNumber = generateReceiptNumber('SC');
    const { error: insertError } = await supabaseAdmin.from('sessions').insert([
      {
        id: sessionId,
        receipt_number: receiptNumber,
        driver_id: who.driverId,
        vehicle_id: who.vehicleId,
        shift_id: shift?.id ?? null,
        attendant_id: user.id,
        driver_name: who.driverName,
        vehicle_plate: who.vehiclePlate,
        vehicle_details: who.vehicleDetails,
        mode: 'postpaid',
        unit_type: rate.unitType,
        status: 'pending_payment',
        payment_status: 'unpaid',
        rate_at_time: rate.perUnit,
        pricing_id: rate.id,
        prepaid_amount: 0,
        // The charge's own date, so day totals and reports count it on the right day.
        // The real moment of entry is kept in the audit log.
        created_at: when.toISOString(),
        start_time: when.toISOString(),
        end_time: when.toISOString(),
        gun,
        units_consumed: units,
        total_amount: amount,
        review_flags: flags,
        recording_mode: 'manual_gun',
        ...(photoPath ? { end_photo_path: photoPath } : {}),
      },
    ]);
    if (insertError) {
      if (photoPath) await removePhoto(photoPath);
      console.error('[GUN] logPastGunSession insert error:', insertError);
      return fail('Could not save the session. Please try again.');
    }

    await logAudit({
      actor: user,
      action: 'session.backdated',
      resourceType: 'session',
      resourceId: sessionId,
      metadata: { receiptNumber, gun, enteredAt: now.toISOString(), when: when.toISOString(), units, amount, flags, driverId: who.driverId },
    });

    revalidatePath('/dashboard');
    return { success: true, sessionId, receiptNumber, units, amount };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] logPastGunSession error:', err);
    return fail('Could not save the session. Please try again.');
  }
}

/**
 * Step 3 (the original "collect payment"): the attendant picks the method and the amount the
 * driver handed over. Wallet takes exactly the amount due. Anything handed over above the
 * amount due is added to a registered driver's wallet as credit. The reference is generated
 * here, and the MoMo number is kept for records. The amount due is never taken from the browser.
 */
export async function collectGunPayment(
  formData: FormData
): Promise<{ success: true; receiptNumber: string; amount: number; amountPaid: number; credited: number } | Fail> {
  const sessionId = String(formData.get('sessionId') || '');
  const method = String(formData.get('method') || '');
  let claimed = false;
  let previousStatus: 'active' | 'pending_payment' = 'pending_payment';
  let walletDebited = 0;
  let driverId: string | null = null;
  try {
    const user = await requireAuth(STAFF);
    const allowed: string[] = [...PAY_METHODS, ...(ACCEPT_CASH ? ['cash'] : [])];
    if (!allowed.includes(method)) return fail('Choose how the driver paid.');

    const { data: s, error } = await supabaseAdmin
      .from('sessions')
      .select('id, status, payment_status, mode, total_amount, prepaid_amount, driver_id, receipt_number, shift_id, attendant_id, recording_mode, review_flags, end_time')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.payment_status !== 'unpaid') return fail('This session is already paid.');

    // Normally paid after the charge. A prepaid session can be paid before it.
    const prepaidFirst = s.status === 'active' && s.mode === 'prepaid';
    if (s.status !== 'pending_payment' && !prepaidFirst) {
      return fail('Finalize the session first, so the amount can be worked out.');
    }
    previousStatus = s.status === 'active' ? 'active' : 'pending_payment';

    const due = roundMoney(Number(prepaidFirst ? s.prepaid_amount : s.total_amount || 0));
    if (!(due > 0)) return fail('There is nothing to collect on this session.');
    driverId = s.driver_id;

    let handedOver = due;
    if (method !== 'wallet') {
      const typed = Number(String(formData.get('amountPaid') ?? due).replace(/[^\d.]/g, ''));
      handedOver = roundMoney(Number.isFinite(typed) && typed > 0 ? typed : due);
      if (handedOver < due) return fail(`The amount cannot be less than the GHS ${due.toFixed(2)} due.`);
      if (handedOver > due + 100_000) return fail('That amount is too large. Check it.');
      if (handedOver > due && !s.driver_id) return fail(`Guests cannot leave extra credit. Enter exactly GHS ${due.toFixed(2)}.`);
    }
    if (method === 'wallet' && !s.driver_id) return fail('Guests do not have a wallet. Choose MoMo.');
    const credited = roundMoney(handedOver - due);

    const momoPhone = String(formData.get('momoPhone') || '').replace(/[^\d+ ]/g, '').trim().slice(0, 20);
    const paidAt: string | undefined = ((s.review_flags || []) as string[]).includes('backdated') && s.end_time ? s.end_time : undefined;
    // As in the original process the reference is generated here; nothing is typed.
    const reference = isMomo(method) ? `${method.toUpperCase()}-${Date.now()}` : null;

    // Claim the payment. Only one request can move unpaid → paid, so a double tap
    // or a second tablet cannot charge the driver twice.
    const { data: claim, error: claimErr } = await supabaseAdmin
      .from('sessions')
      .update({ payment_status: 'paid', status: previousStatus === 'active' ? 'active' : 'completed', payment_method: method })
      .eq('id', s.id)
      .eq('status', previousStatus)
      .eq('payment_status', 'unpaid')
      .select('id')
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claim) return fail('This session is already paid.');
    claimed = true;

    // Wallet: debit atomically (refuses if the balance is too low)
    if (method === 'wallet' && s.driver_id) {
      const { data: adj, error: adjErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', { p_driver_id: s.driver_id, p_delta: -due })
        .single();
      if (adjErr || !adj) {
        await revertClaim(s.id, previousStatus);
        if (adjErr?.message?.includes('Insufficient')) return fail('The wallet balance is too low for this payment.');
        console.error('[GUN] wallet debit error:', adjErr);
        return fail('Could not take the payment from the wallet. Please try again.');
      }
      walletDebited = due;
      const { balance_before, balance_after } = adj as { balance_before: number; balance_after: number };
      await supabaseAdmin.from('wallet_transactions').insert([
        {
          driver_id: s.driver_id,
          type: 'debit',
          amount: due,
          balance_before,
          balance_after,
          description: `Payment for session ${s.receipt_number}`,
          session_id: s.id,
          created_by: user.id,
          ...(paidAt ? { created_at: paidAt } : {}),
        },
      ]);
    }

    const { error: payErr } = await supabaseAdmin.from('payments').insert([
      {
        session_id: s.id,
        receipt_number: s.receipt_number,
        driver_id: s.driver_id,
        amount: handedOver, // the actual amount received, as in the original process
        method,
        reference,
        status: 'completed',
        attendant_id: user.id,
        ...(paidAt ? { created_at: paidAt } : {}),
      },
    ]);
    if (payErr) {
      await undoWalletDebit(walletDebited, s.driver_id, s.id, s.receipt_number, user.id);
      walletDebited = 0;
      await revertClaim(s.id, previousStatus);
      console.error('[GUN] payment insert error:', payErr);
      return fail('Could not record the payment. Nothing was charged. Please try again.');
    }

    // Anything above the amount due becomes the driver's credit
    if (credited > 0 && s.driver_id) {
      const { data: adj, error: creditErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', { p_driver_id: s.driver_id, p_delta: credited })
        .single();
      if (creditErr || !adj) {
        console.error('[GUN] overpayment credit failed (payment is saved):', creditErr);
      } else {
        const { balance_before, balance_after } = adj as { balance_before: number; balance_after: number };
        await supabaseAdmin.from('wallet_transactions').insert([
          {
            driver_id: s.driver_id,
            type: 'credit',
            amount: credited,
            balance_before,
            balance_after,
            description: `Overpayment for session ${s.receipt_number}`,
            session_id: s.id,
            created_by: user.id,
            ...(paidAt ? { created_at: paidAt } : {}),
          },
        ]);
      }
    }

    if (s.shift_id) {
      const { error: shiftErr } = await supabaseAdmin.rpc('bump_shift_totals', {
        p_shift_id: s.shift_id,
        p_cash: method === 'cash' ? handedOver : 0,
        p_momo: isMomo(method) ? handedOver : 0,
        p_wallet: method === 'wallet' ? due : 0,
        p_sessions: 1,
      });
      if (shiftErr) console.error('[GUN] shift totals update failed (payment is saved):', shiftErr.message);
    }

    await logAudit({
      actor: user,
      action: 'payment.collect',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, due, handedOver, credited, method, reference, momoPhone: momoPhone || undefined },
    });

    revalidatePath('/dashboard');
    revalidatePath('/payments');
    return { success: true, receiptNumber: s.receipt_number, amount: due, amountPaid: handedOver, credited };
  } catch (err) {
    // Something unexpected after the claim: put the session back so it can be retried.
    if (claimed && sessionId) {
      if (walletDebited > 0 && driverId) await undoWalletDebit(walletDebited, driverId, sessionId, '', null);
      await revertClaim(sessionId, previousStatus);
    }
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] collectGunPayment error:', err);
    return fail('Could not record the payment. Nothing was charged. Please try again.');
  }
}

/** The MoMo confirmation photo, added after the payment is recorded (optional, as in the original process). */
export async function attachPaymentProof(formData: FormData): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const sessionId = String(formData.get('sessionId') || '');
    const proof = validatePhoto(formData.get('proof'));
    if (!proof.ok) return fail(proof.error.replace('machine display', 'MoMo confirmation'));

    const { data: s } = await supabaseAdmin
      .from('sessions')
      .select('id, attendant_id, payment_status, payment_method, recording_mode, receipt_number')
      .eq('id', sessionId)
      .maybeSingle();
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.payment_status !== 'paid' || !isMomo(String(s.payment_method || ''))) return fail('Only a paid MoMo session needs a confirmation photo.');

    // Keep one photo per session: replace an earlier one
    const existing = await findPaymentProof(s.attendant_id, s.id);
    if (existing) await removePhoto(`${s.attendant_id}/${existing}`);

    const path = `${s.attendant_id}/${s.id}-payment.${extFor(proof.file)}`;
    const upErr = await uploadPhoto(path, proof.file);
    if (upErr) return fail('Could not save the photo. Check the connection and try again.');

    await logAudit({ actor: user, action: 'payment.proof', resourceType: 'session', resourceId: s.id, metadata: { receiptNumber: s.receipt_number } });
    revalidatePath('/sessions');
    return { success: true };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] attachPaymentProof error:', err);
    return fail('Could not save the photo. Please try again.');
  }
}

/** The file name of the saved MoMo confirmation photo, when there is one. */
async function findPaymentProof(attendantId: string | null, sessionId: string): Promise<string | null> {
  if (!attendantId) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(attendantId, { search: `${sessionId}-payment` });
  return (data || []).find((f) => f.name.startsWith(`${sessionId}-payment`))?.name ?? null;
}

/**
 * Cancel a session that has no money on it (the original "cancel session"). Once the driver
 * has paid, only a manager can void it, through the approval flow.
 */
export async function cancelGunSession(sessionId: string): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const { data: s } = await supabaseAdmin
      .from('sessions')
      .select('id, status, payment_status, attendant_id, recording_mode, receipt_number')
      .eq('id', sessionId)
      .maybeSingle();
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.status === 'cancelled') return fail('This session is already cancelled.');
    if (s.payment_status !== 'unpaid') return fail('This session has been paid. Ask a manager to void it.');

    const res = await executeVoid({ sessionId: s.id, reason: 'Cancelled by attendant before payment', actorId: user.id });
    if (!res.ok) return fail(res.error);

    await logAudit({ actor: user, action: 'session.cancel', resourceType: 'session', resourceId: s.id, metadata: { receiptNumber: s.receipt_number } });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] cancelGunSession error:', err);
    return fail('Could not cancel the session. Please try again.');
  }
}

async function revertClaim(sessionId: string, status: 'active' | 'pending_payment' = 'pending_payment') {
  await supabaseAdmin.from('sessions').update({ payment_status: 'unpaid', status, payment_method: null }).eq('id', sessionId);
}

async function undoWalletDebit(amount: number, driverId: string | null, sessionId: string, receipt: string, userId: string | null) {
  if (!(amount > 0) || !driverId) return;
  const { data: adj } = await supabaseAdmin.rpc('adjust_wallet_balance', { p_driver_id: driverId, p_delta: amount }).single();
  if (adj) {
    const { balance_before, balance_after } = adj as { balance_before: number; balance_after: number };
    await supabaseAdmin.from('wallet_transactions').insert([
      {
        driver_id: driverId,
        type: 'credit',
        amount,
        balance_before,
        balance_after,
        description: `Reversed: payment for session ${receipt || sessionId} did not complete`,
        session_id: sessionId,
        created_by: userId,
      },
    ]);
  }
}
