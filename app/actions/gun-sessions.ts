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
  GUNS,
  computeBill,
  computeStartGap,
  dbPaymentMethod,
  endReadingProblem,
  evaluateFlags,
  normaliseMomoReference,
  parseReading,
  roundMoney,
  startReadingProblem,
  type Gun,
  type MomoNetwork,
  type PayChoice,
  type ReviewFlag,
} from '@/lib/gun-session';
import type {
  DriverMatch,
  GunSessionSummary,
  GunSessionView,
  GunStatus,
  GunTotals,
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

async function getLastEndReading(gun: Gun): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('end_reading')
    .eq('gun', gun)
    .not('end_reading', 'is', null)
    .order('end_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.end_reading === null || data?.end_reading === undefined ? null : Number(data.end_reading);
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

    const [shift, activeRes, mineRes, lastA, lastB] = await Promise.all([
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
      getLastEndReading('A'),
      getLastEndReading('B'),
    ]);

    if (activeRes.error) throw activeRes.error;
    if (mineRes.error) throw mineRes.error;

    const active = ((activeRes.data || []) as unknown as SessionRow[]).map(toSummary);
    const mine = ((mineRes.data || []) as unknown as SessionRow[]).map(toSummary);

    const gunStatus = (gun: Gun, last: number | null): GunStatus => {
      const s = active.find((a) => a.gun === gun) || null;
      return { gun, inUse: !!s, lastEndReading: last, session: s };
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
        guns: { A: gunStatus('A', lastA), B: gunStatus('B', lastB) },
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
        done: mine.filter((s) => s.status !== 'active').slice(0, 12),
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

    const [veh, drv, att, pend] = await Promise.all([
      row.vehicle_id
        ? supabaseAdmin.from('vehicles').select('battery_capacity').eq('id', row.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null }),
      row.driver_id
        ? supabaseAdmin.from('drivers').select('wallet_balance').eq('id', row.driver_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from('profiles').select('name').eq('id', row.attendant_id).maybeSingle(),
      supabaseAdmin.from('session_void_requests').select('id', { count: 'exact', head: true }).eq('session_id', row.id).eq('status', 'pending'),
    ]);

    return {
      success: true,
      data: {
        ...toSummary(row as SessionRow),
        startReading: row.start_reading === null || row.start_reading === undefined ? null : Number(row.start_reading),
        endReading: row.end_reading === null || row.end_reading === undefined ? null : Number(row.end_reading),
        rate: Number(row.rate_at_time || 0),
        paymentMethod: row.payment_method ?? null,
        walletBalance: drv.data ? Number((drv.data as { wallet_balance?: number | string | null }).wallet_balance || 0) : null,
        batteryKwh:
          veh.data && (veh.data as { battery_capacity?: number | string | null }).battery_capacity
            ? Number((veh.data as { battery_capacity: number | string }).battery_capacity)
            : null,
        attendantName: (att.data as { name?: string } | null)?.name || 'Attendant',
        startGap: row.start_gap === null || row.start_gap === undefined ? null : Number(row.start_gap),
        isMine: row.attendant_id === user.id,
        lastEndReading: row.status === 'active' ? await getLastEndReading(row.gun as Gun) : null,
        voidPending: (pend.count || 0) > 0,
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
 * Step 1: the attendant opens a session on a gun for a driver. No kWh yet: the
 * readings are logged in step 2, once charging is done. Opening the session
 * marks the gun busy and stamps the start time.
 */
export async function startGunSession(
  formData: FormData
): Promise<{ success: true; sessionId: string; receiptNumber: string } | Fail> {
  try {
    const user = await requireAuth(STAFF);

    const gun = String(formData.get('gun') || '') as Gun;
    if (!GUNS.includes(gun)) return fail('Pick Gun A or Gun B.');

    const shift = await getActiveShift(user.id);
    if (!shift && user.role === 'attendant') return fail('Start your shift before you record a session.');

    // Who is charging
    const isGuest = String(formData.get('isGuest') || '') === 'true';
    let driverId: string | null = null;
    let vehicleId: string | null = null;
    let driverName = 'Guest';
    let vehiclePlate = '';
    let vehicleDetails = 'Guest vehicle';

    if (isGuest) {
      vehiclePlate = String(formData.get('guestPlate') || '').trim().toUpperCase();
      driverName = String(formData.get('guestName') || '').trim() || 'Guest';
      if (vehiclePlate.length < 3) return fail('Enter the car number plate for a guest.');
    } else {
      driverId = String(formData.get('driverId') || '') || null;
      vehicleId = String(formData.get('vehicleId') || '') || null;
      if (!driverId || !vehicleId) return fail('Choose the driver and the car.');
      const [d, v] = await Promise.all([
        supabaseAdmin.from('drivers').select('name, is_active').eq('id', driverId).maybeSingle(),
        supabaseAdmin.from('vehicles').select('plate_number, brand, model, driver_id').eq('id', vehicleId).maybeSingle(),
      ]);
      if (!d.data) return fail('Driver not found.');
      if (d.data.is_active === false) return fail('This driver account is deactivated.');
      if (!v.data || v.data.driver_id !== driverId) return fail('That car does not belong to this driver.');
      driverName = d.data.name;
      vehiclePlate = v.data.plate_number;
      vehicleDetails = [v.data.brand, v.data.model].filter(Boolean).join(' ') || 'Vehicle';
    }

    // The gun must be free
    const busy = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('gun', gun)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (busy.data) return fail(`Gun ${gun} is already in use. Finish that session first.`);

    // The rate is read here and frozen on the session
    const { data: rateRow } = await supabaseAdmin
      .from('pricing')
      .select('id, rate, unit_quantity')
      .eq('unit_type', 'kwh')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rateRow) return fail('No kWh price is set. Ask a manager to set one in Pricing.');
    const ratePerKwh = Number(rateRow.rate) / Number(rateRow.unit_quantity || 1);

    const sessionId = randomUUID();
    const receiptNumber = generateReceiptNumber('SC');
    const { error: insertError } = await supabaseAdmin.from('sessions').insert([
      {
        id: sessionId,
        receipt_number: receiptNumber,
        driver_id: driverId,
        vehicle_id: vehicleId,
        shift_id: shift?.id ?? null,
        attendant_id: user.id,
        driver_name: driverName,
        vehicle_plate: vehiclePlate,
        vehicle_details: vehicleDetails,
        mode: 'postpaid',
        unit_type: 'kwh',
        status: 'active',
        payment_status: 'unpaid',
        rate_at_time: ratePerKwh,
        pricing_id: rateRow.id,
        prepaid_amount: 0,
        start_time: new Date().toISOString(),
        gun,
        // Readings and photos are added in step 2
        review_flags: [],
        recording_mode: 'manual_gun',
      },
    ]);

    if (insertError) {
      if (errorCode(insertError) === '23505') return fail(`Gun ${gun} is already in use. Finish that session first.`);
      console.error('[GUN] startGunSession insert error:', insertError);
      return fail('Could not start the session. Please try again.');
    }

    await logAudit({
      actor: user,
      action: 'session.start',
      resourceType: 'session',
      resourceId: sessionId,
      metadata: { receiptNumber, gun, driverId, isGuest },
    });

    revalidatePath('/dashboard');
    return { success: true, sessionId, receiptNumber };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] startGunSession error:', err);
    return fail('Could not start the session. Please try again.');
  }
}

/**
 * Step 2: after charging, the attendant logs the start and end readings, each with a
 * photo of the display. The server checks the start continues from where this gun last
 * stopped, then works out the kWh and the bill.
 */
export async function finishGunSession(
  formData: FormData
): Promise<{ success: true; units: number; amount: number; flags: ReviewFlag[] } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const sessionId = String(formData.get('sessionId') || '');
    if (!sessionId) return fail('Session not found.');

    const startReading = parseReading(formData.get('startReading'));
    if (startReading === null) return fail('Enter the start reading: the kWh the display showed before charging.');
    const endReading = parseReading(formData.get('endReading'));
    if (endReading === null) return fail('Enter the end reading: the kWh the display shows now.');
    const startPhoto = validatePhoto(formData.get('startPhoto'));
    if (!startPhoto.ok) return fail(`Start photo: ${startPhoto.error}`);
    const endPhoto = validatePhoto(formData.get('endPhoto'));
    if (!endPhoto.ok) return fail(`End photo: ${endPhoto.error}`);

    const { data: s, error } = await supabaseAdmin
      .from('sessions')
      .select('id, status, recording_mode, gun, rate_at_time, start_time, review_flags, attendant_id, vehicle_id, receipt_number')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.status !== 'active') return fail('This session has already been finished.');

    // The start must continue from where this gun last stopped
    const lastEnd = await getLastEndReading(s.gun as Gun);
    const startProblem = startReadingProblem(startReading, lastEnd);
    if (startProblem) return fail(startProblem);
    const startGap = computeStartGap(startReading, lastEnd);
    const problem = endReadingProblem(startReading, endReading);
    if (problem) return fail(problem);

    const { units, amount } = computeBill(startReading, endReading, Number(s.rate_at_time));

    let batteryKwh: number | null = null;
    if (s.vehicle_id) {
      const { data: v } = await supabaseAdmin.from('vehicles').select('battery_capacity').eq('id', s.vehicle_id).maybeSingle();
      batteryKwh = v?.battery_capacity ? Number(v.battery_capacity) : null;
    }
    const endedAt = new Date();
    const newFlags = evaluateFlags(
      {
        startGap,
        units,
        batteryKwh,
        startedAt: new Date(s.start_time),
        endedAt,
      },
      await loadLimits()
    );
    const flags = Array.from(new Set([...(s.review_flags || []), ...newFlags])) as ReviewFlag[];

    const startPhotoPath = `${s.attendant_id}/${s.id}-start.${extFor(startPhoto.file)}`;
    const endPhotoPath = `${s.attendant_id}/${s.id}-end.${extFor(endPhoto.file)}`;
    const [upStart, upEnd] = await Promise.all([
      uploadPhoto(startPhotoPath, startPhoto.file),
      uploadPhoto(endPhotoPath, endPhoto.file),
    ]);
    if (upStart || upEnd) {
      await Promise.all([removePhoto(startPhotoPath), removePhoto(endPhotoPath)]);
      return fail('Could not save the photos. Check the connection and try again.');
    }

    // Only an active session can be finished, and only once.
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('sessions')
      .update({
        start_reading: startReading,
        start_photo_path: startPhotoPath,
        start_gap: startGap,
        end_reading: endReading,
        end_photo_path: endPhotoPath,
        units_consumed: units,
        total_amount: amount,
        end_time: endedAt.toISOString(),
        status: 'pending_payment',
        review_flags: flags,
      })
      .eq('id', s.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (updErr || !updated) {
      await Promise.all([removePhoto(startPhotoPath), removePhoto(endPhotoPath)]);
      if (updErr) console.error('[GUN] finishGunSession update error:', updErr);
      return fail(updErr ? 'Could not finish the session. Please try again.' : 'This session has already been finished.');
    }

    await logAudit({
      actor: user,
      action: 'session.finish',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, gun: s.gun, startReading, endReading, startGap, units, amount, flags },
    });

    revalidatePath('/dashboard');
    return { success: true, units, amount, flags };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] finishGunSession error:', err);
    return fail('Could not finish the session. Please try again.');
  }
}

/** Step 3: record how the driver paid. The amount is the session's total — it is never taken from the browser. */
export async function collectGunPayment(input: {
  sessionId: string;
  method: PayChoice;
  network?: MomoNetwork;
  reference?: string;
}): Promise<{ success: true; receiptNumber: string; amount: number } | Fail> {
  let claimed = false;
  let walletDebited = 0;
  let sessionId = '';
  let driverId: string | null = null;
  try {
    const user = await requireAuth(STAFF);
    sessionId = String(input.sessionId || '');
    if (!['cash', 'momo', 'wallet'].includes(input.method)) return fail('Choose how the driver paid.');
    if (input.method === 'cash' && !ACCEPT_CASH) return fail('The station does not take cash. Choose MoMo or wallet.');

    const { data: s, error } = await supabaseAdmin
      .from('sessions')
      .select('id, status, payment_status, total_amount, driver_id, receipt_number, shift_id, attendant_id, recording_mode')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (!canActOn(user, s.attendant_id)) return fail('Forbidden: this session belongs to another attendant.');
    if (s.status === 'active') return fail('Finish the session first, so the amount can be worked out.');
    if (s.status !== 'pending_payment' || s.payment_status !== 'unpaid') return fail('This session is already paid.');

    const amount = roundMoney(Number(s.total_amount || 0));
    if (!(amount > 0)) return fail('There is nothing to collect on this session.');
    driverId = s.driver_id;

    let reference: string | null = null;
    if (input.method === 'momo') {
      reference = normaliseMomoReference(String(input.reference || ''));
      if (reference.length < 6) return fail('Enter the MoMo transaction ID from the driver’s SMS.');
      // Older payments may hold the same ID in their free-text reference.
      const prior = await supabaseAdmin
        .from('payments')
        .select('id')
        .in('reference', [reference, String(input.reference || '').trim()])
        .limit(1)
        .maybeSingle();
      if (prior.data) return fail('This MoMo ID was already used on another payment.');
    }
    if (input.method === 'wallet' && !s.driver_id) return fail('Guests do not have a wallet. Choose cash or MoMo.');

    const method = dbPaymentMethod(input.method, input.network);

    // Claim the payment. Only one request can move unpaid → paid, so a double tap
    // or a second tablet cannot charge the driver twice.
    const { data: claim, error: claimErr } = await supabaseAdmin
      .from('sessions')
      .update({ payment_status: 'paid', status: 'completed', payment_method: method })
      .eq('id', s.id)
      .eq('status', 'pending_payment')
      .eq('payment_status', 'unpaid')
      .select('id')
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claim) return fail('This session is already paid.');
    claimed = true;

    // Wallet: debit atomically (refuses if the balance is too low)
    if (input.method === 'wallet' && s.driver_id) {
      const { data: adj, error: adjErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', { p_driver_id: s.driver_id, p_delta: -amount })
        .single();
      if (adjErr || !adj) {
        await revertClaim(s.id);
        if (adjErr?.message?.includes('Insufficient')) return fail('The wallet balance is too low for this payment.');
        console.error('[GUN] wallet debit error:', adjErr);
        return fail('Could not take the payment from the wallet. Please try again.');
      }
      walletDebited = amount;
      const { balance_before, balance_after } = adj as { balance_before: number; balance_after: number };
      await supabaseAdmin.from('wallet_transactions').insert([
        {
          driver_id: s.driver_id,
          type: 'debit',
          amount,
          balance_before,
          balance_after,
          description: `Payment for session ${s.receipt_number}`,
          session_id: s.id,
          created_by: user.id,
        },
      ]);
    }

    const { error: payErr } = await supabaseAdmin.from('payments').insert([
      {
        session_id: s.id,
        receipt_number: s.receipt_number,
        driver_id: s.driver_id,
        amount,
        method,
        reference,
        // Unique across new payments: a MoMo ID can be used once.
        momo_ref_key: reference,
        status: 'completed',
        attendant_id: user.id,
      },
    ]);
    if (payErr) {
      await undoWalletDebit(walletDebited, s.driver_id, s.id, s.receipt_number, user.id);
      walletDebited = 0;
      await revertClaim(s.id);
      if (errorCode(payErr) === '23505') return fail('This MoMo ID was already used on another payment.');
      console.error('[GUN] payment insert error:', payErr);
      return fail('Could not record the payment. Nothing was charged. Please try again.');
    }

    if (s.shift_id) {
      const { error: shiftErr } = await supabaseAdmin.rpc('bump_shift_totals', {
        p_shift_id: s.shift_id,
        p_cash: input.method === 'cash' ? amount : 0,
        p_momo: input.method === 'momo' ? amount : 0,
        p_wallet: input.method === 'wallet' ? amount : 0,
        p_sessions: 1,
      });
      if (shiftErr) console.error('[GUN] shift totals update failed (payment is saved):', shiftErr.message);
    }

    await logAudit({
      actor: user,
      action: 'payment.collect',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, amount, method, reference },
    });

    revalidatePath('/dashboard');
    revalidatePath('/payments');
    return { success: true, receiptNumber: s.receipt_number, amount };
  } catch (err) {
    // Something unexpected after the claim: put the session back so it can be retried.
    if (claimed && sessionId) {
      if (walletDebited > 0 && driverId) await undoWalletDebit(walletDebited, driverId, sessionId, '', null);
      await revertClaim(sessionId);
    }
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[GUN] collectGunPayment error:', err);
    return fail('Could not record the payment. Nothing was charged. Please try again.');
  }
}

async function revertClaim(sessionId: string) {
  await supabaseAdmin
    .from('sessions')
    .update({ payment_status: 'unpaid', status: 'pending_payment', payment_method: null })
    .eq('id', sessionId);
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
