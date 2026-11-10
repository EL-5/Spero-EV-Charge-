'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import type { Gun, ReviewFlag } from '@/lib/gun-session';
import type { SessionEvidence, SessionRecord } from '@/lib/management-types';

type Fail = { success: false; error: string };
const fail = (error: string): Fail => ({ success: false, error });
const READERS = ['super_admin', 'manager', 'accountant', 'finance'];
const BUCKET = 'meter-photos';

function authMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  return msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : null;
}

interface Row {
  id: string; receipt_number: string; gun: Gun | null; status: string; payment_status: string | null; payment_method: string | null;
  driver_name: string | null; vehicle_plate: string | null; attendant_id: string | null; start_time: string; end_time: string | null;
  units_consumed: number | string | null; total_amount: number | string | null; review_flags: string[] | null; reviewed_at: string | null;
  recording_mode: string | null;
  start_reading?: number | string | null; end_reading?: number | string | null; rate_at_time?: number | string | null;
  start_gap?: number | string | null; start_photo_path?: string | null; end_photo_path?: string | null;
  review_decision?: string | null; review_note?: string | null; void_reason?: string | null; refund_due?: number | string | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

function toRecord(r: Row, attendant: string): SessionRecord {
  return {
    id: r.id,
    receiptNumber: r.receipt_number,
    gun: r.gun,
    status: r.status,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method,
    driverName: r.driver_name || 'Guest',
    vehiclePlate: r.vehicle_plate || '',
    attendantName: attendant,
    startTime: r.start_time,
    endTime: r.end_time,
    units: num(r.units_consumed),
    amount: num(r.total_amount),
    flags: (r.review_flags || []) as ReviewFlag[],
    reviewed: !!r.reviewed_at,
    recordedByHand: r.recording_mode === 'manual_gun',
  };
}

export interface RecordFilter {
  from: string; // YYYY-MM-DD (UTC, the station runs on UTC+0)
  to: string;
  gun?: Gun | 'all';
  view?: 'all' | 'flagged' | 'unreviewed' | 'voided' | 'unpaid';
}

export async function listSessionRecords(f: RecordFilter): Promise<{ success: true; data: SessionRecord[]; capped: boolean } | Fail> {
  try {
    await requireAuth(READERS);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to)) return fail('Choose a valid date range.');
    const end = new Date(`${f.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);

    let q = supabaseAdmin
      .from('sessions')
      .select(
        'id, receipt_number, gun, status, payment_status, payment_method, driver_name, vehicle_plate, attendant_id, start_time, end_time, units_consumed, total_amount, review_flags, reviewed_at, recording_mode'
      )
      .eq('recording_mode', 'manual_gun')
      .gte('start_time', `${f.from}T00:00:00.000Z`)
      .lt('start_time', end.toISOString())
      .order('start_time', { ascending: false })
      .limit(301);

    if (f.gun === 'A' || f.gun === 'B') q = q.eq('gun', f.gun);
    if (f.view === 'flagged') q = q.not('review_flags', 'eq', '{}');
    if (f.view === 'unreviewed') q = q.not('review_flags', 'eq', '{}').is('reviewed_at', null);
    if (f.view === 'voided') q = q.eq('status', 'cancelled');
    if (f.view === 'unpaid') q = q.eq('status', 'pending_payment');

    const { data, error } = await q;
    if (error) {
      console.error('[RECORDS] list error:', error);
      return fail('Could not load sessions. Has the latest database update been run?');
    }
    const rows = (data || []) as Row[];
    const ids = Array.from(new Set(rows.map((r) => r.attendant_id).filter((x): x is string => !!x)));
    const { data: profs } = ids.length ? await supabaseAdmin.from('profiles').select('id, name').in('id', ids) : { data: [] };
    const names = Object.fromEntries(((profs || []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

    return {
      success: true,
      capped: rows.length > 300,
      data: rows.slice(0, 300).map((r) => toRecord(r, (r.attendant_id && names[r.attendant_id]) || 'Attendant')),
    };
  } catch (err) {
    return fail(authMessage(err) || 'Could not load sessions.');
  }
}

async function signed(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** The payment screenshot is stored beside the meter photos as <session id>-payment.<ext>. */
async function paymentProofUrl(attendantId: string | null, sessionId: string): Promise<string | null> {
  if (!attendantId) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(attendantId, { search: `${sessionId}-payment` });
  const file = (data || []).find((f) => f.name.startsWith(`${sessionId}-payment`));
  return file ? signed(`${attendantId}/${file.name}`) : null;
}

/** One session with both meter photos. Photo links last 10 minutes. */
export async function getSessionEvidence(sessionId: string): Promise<{ success: true; data: SessionEvidence } | Fail> {
  try {
    await requireAuth(READERS);
    const { data: r } = await supabaseAdmin.from('sessions').select('*').eq('id', sessionId).eq('recording_mode', 'manual_gun').maybeSingle();
    if (!r) return fail('Session not found.');
    const row = r as Row;

    const [att, startUrl, endUrl, pay, pend, proofUrl] = await Promise.all([
      row.attendant_id ? supabaseAdmin.from('profiles').select('name').eq('id', row.attendant_id).maybeSingle() : Promise.resolve({ data: null }),
      signed(row.start_photo_path),
      signed(row.end_photo_path),
      supabaseAdmin.from('payments').select('reference').eq('session_id', row.id).limit(1).maybeSingle(),
      supabaseAdmin.from('session_void_requests').select('id', { count: 'exact', head: true }).eq('session_id', row.id).eq('status', 'pending'),
      paymentProofUrl(row.attendant_id, row.id),
    ]);

    return {
      success: true,
      data: {
        ...toRecord(row, (att.data as { name?: string } | null)?.name || 'Attendant'),
        startReading: num(row.start_reading),
        endReading: num(row.end_reading),
        rate: num(row.rate_at_time),
        startGap: num(row.start_gap),
        startPhotoUrl: startUrl,
        endPhotoUrl: endUrl,
        paymentProofUrl: proofUrl,
        reference: (pay.data as { reference?: string | null } | null)?.reference ?? null,
        reviewDecision: row.review_decision ?? null,
        reviewNote: row.review_note ?? null,
        voidReason: row.void_reason ?? null,
        refundDue: num(row.refund_due),
        voidPending: (pend.count || 0) > 0,
      },
    };
  } catch (err) {
    return fail(authMessage(err) || 'Could not load this session.');
  }
}
