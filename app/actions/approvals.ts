'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { executeVoid } from '@/lib/void-session';
import { createNotification } from '@/app/actions/notifications';
import type { Gun, ReviewFlag } from '@/lib/gun-session';
import type { ApprovalQueue, ReadingItem, TopUpItem, VoidItem } from '@/lib/management-types';

// ─────────────────────────────────────────────────────────────────────────────
// The approvals queue. Everything that needs a person to look: void requests,
// readings the system could not accept without a second opinion, and wallet
// top-ups. Decisions are written to the audit log with the manager's name.
// ─────────────────────────────────────────────────────────────────────────────

const MANAGERS = ['super_admin', 'manager'];
const STAFF = ['super_admin', 'manager', 'attendant'];

type Fail = { success: false; error: string };
const fail = (error: string): Fail => ({ success: false, error });

function authMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  return msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : null;
}

async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await supabaseAdmin.from('profiles').select('id, name').in('id', unique);
  return Object.fromEntries(((data || []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
}

async function notifyManagers(title: string, message: string, type: 'info' | 'warning' = 'info') {
  const { data } = await supabaseAdmin.from('profiles').select('id').in('role', MANAGERS).eq('is_active', true);
  for (const m of (data || []) as { id: string }[]) {
    await createNotification({ user_id: m.id, title, message, type });
  }
}

export async function getApprovalQueue(): Promise<{ success: true; data: ApprovalQueue } | Fail> {
  try {
    await requireAuth(MANAGERS);

    const [voidRes, readingRes, topupRes] = await Promise.all([
      supabaseAdmin
        .from('session_void_requests')
        .select('id, session_id, requested_by, reason, detail, requested_at')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true }),
      supabaseAdmin
        .from('sessions')
        .select('id, receipt_number, gun, driver_name, vehicle_plate, attendant_id, start_reading, end_reading, units_consumed, total_amount, review_flags, start_gap, end_time')
        .eq('recording_mode', 'manual_gun')
        .not('review_flags', 'eq', '{}')
        .is('reviewed_at', null)
        .neq('status', 'active')
        .neq('status', 'cancelled')
        .order('end_time', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('wallet_topup_requests')
        .select('id, amount, method, reference, requested_at, drivers(name, phone)')
        .eq('status', 'pending')
        .order('requested_at', { ascending: true }),
    ]);

    const voidRows = (voidRes.data || []) as { id: string; session_id: string; requested_by: string; reason: string; detail: string | null; requested_at: string }[];
    const sessionIds = voidRows.map((v) => v.session_id);
    const { data: voidSessions } = sessionIds.length
      ? await supabaseAdmin
          .from('sessions')
          .select('id, receipt_number, gun, driver_name, total_amount, payment_status, payment_method, units_consumed')
          .in('id', sessionIds)
      : { data: [] };
    const sessionById = Object.fromEntries(((voidSessions || []) as { id: string }[]).map((s) => [s.id, s]));

    const readingRows = (readingRes.data || []) as {
      id: string; receipt_number: string; gun: Gun; driver_name: string | null; vehicle_plate: string | null; attendant_id: string;
      start_reading: number | string; end_reading: number | string | null; units_consumed: number | string | null;
      total_amount: number | string | null; review_flags: string[]; start_gap: number | string | null; end_time: string | null;
    }[];

    const names = await namesFor([...voidRows.map((v) => v.requested_by), ...readingRows.map((r) => r.attendant_id)]);

    const voids: VoidItem[] = voidRows.map((v) => {
      const s = (sessionById[v.session_id] || {}) as Record<string, unknown>;
      return {
        requestId: v.id,
        sessionId: v.session_id,
        receiptNumber: String(s.receipt_number || ''),
        gun: (s.gun as Gun) || null,
        driverName: String(s.driver_name || 'Guest'),
        amount: Number(s.total_amount || 0),
        paymentStatus: (s.payment_status as string) ?? null,
        paymentMethod: (s.payment_method as string) ?? null,
        units: s.units_consumed === null || s.units_consumed === undefined ? null : Number(s.units_consumed),
        reason: v.reason,
        detail: v.detail,
        requestedBy: names[v.requested_by] || 'Attendant',
        requestedAt: v.requested_at,
      };
    });

    const readings: ReadingItem[] = readingRows.map((r) => ({
      sessionId: r.id,
      receiptNumber: r.receipt_number,
      gun: r.gun,
      driverName: r.driver_name || 'Guest',
      vehiclePlate: r.vehicle_plate || '',
      attendantName: names[r.attendant_id] || 'Attendant',
      startReading: Number(r.start_reading),
      endReading: r.end_reading === null ? null : Number(r.end_reading),
      units: r.units_consumed === null ? null : Number(r.units_consumed),
      amount: r.total_amount === null ? null : Number(r.total_amount),
      flags: (r.review_flags || []) as ReviewFlag[],
      startGap: r.start_gap === null ? null : Number(r.start_gap),
      endedAt: r.end_time,
    }));

    const topups: TopUpItem[] = ((topupRes.data || []) as unknown as {
      id: string; amount: number | string; method: string; reference: string | null; requested_at: string;
      drivers: { name: string; phone: string } | { name: string; phone: string }[] | null;
    }[]).map((t) => {
      const d = Array.isArray(t.drivers) ? t.drivers[0] : t.drivers;
      return {
        id: t.id,
        driverName: d?.name || 'Driver',
        driverPhone: d?.phone || '',
        amount: Number(t.amount),
        method: t.method,
        reference: t.reference,
        requestedAt: t.requested_at,
      };
    });

    return { success: true, data: { voids, readings, topups } };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[APPROVALS] getApprovalQueue error:', err);
    return fail('Could not load the approvals queue.');
  }
}

/** Just the number, for the badge in the menu. */
export async function getApprovalCount(): Promise<number> {
  try {
    await requireAuth(MANAGERS);
    const [v, r, t] = await Promise.all([
      supabaseAdmin.from('session_void_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('recording_mode', 'manual_gun')
        .not('review_flags', 'eq', '{}')
        .is('reviewed_at', null)
        .neq('status', 'active')
        .neq('status', 'cancelled'),
      supabaseAdmin.from('wallet_topup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    return (v.count || 0) + (r.count || 0) + (t.count || 0);
  } catch {
    return 0;
  }
}

/** An attendant (or manager) asks for a session to be voided. Nothing changes until a manager approves. */
export async function requestVoid(input: { sessionId: string; reason: string; detail?: string }): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(STAFF);
    const reason = String(input.reason || '').trim();
    const detail = String(input.detail || '').trim();
    if (reason.length < 3) return fail('Choose a reason.');
    if (detail.length < 5) return fail('Write what happened, so the manager can decide.');

    const { data: s } = await supabaseAdmin
      .from('sessions')
      .select('id, attendant_id, status, receipt_number, recording_mode')
      .eq('id', input.sessionId)
      .maybeSingle();
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');
    if (user.role === 'attendant' && s.attendant_id !== user.id) return fail('Forbidden: this session belongs to another attendant.');
    if (s.status === 'cancelled') return fail('This session is already voided.');

    const { error } = await supabaseAdmin
      .from('session_void_requests')
      .insert([{ session_id: s.id, requested_by: user.id, reason, detail }]);
    if (error) {
      if ((error as { code?: string }).code === '23505') return fail('A void request for this session is already waiting for a manager.');
      console.error('[APPROVALS] requestVoid error:', error);
      return fail('Could not send the request. Please try again.');
    }

    await logAudit({ actor: user, action: 'session.void.request', resourceType: 'session', resourceId: s.id, metadata: { receiptNumber: s.receipt_number, reason, detail } });
    await notifyManagers('Void requested', `${user.name} asked to void session ${s.receipt_number}: ${reason}.`, 'warning');
    revalidatePath('/approvals');
    return { success: true };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[APPROVALS] requestVoid error:', err);
    return fail('Could not send the request. Please try again.');
  }
}

export async function decideVoid(input: { requestId: string; approve: boolean; note?: string }): Promise<{ success: true; message: string } | Fail> {
  try {
    const user = await requireAuth(MANAGERS);
    const note = String(input.note || '').trim();
    if (!input.approve && note.length < 5) return fail('Say why the session is being kept, so the attendant knows.');

    const { data: req } = await supabaseAdmin
      .from('session_void_requests')
      .select('id, session_id, status, requested_by, reason')
      .eq('id', input.requestId)
      .maybeSingle();
    if (!req) return fail('Request not found.');
    if (req.status !== 'pending') return fail(`This request was already ${req.status}.`);

    // Claim the decision first, so two managers cannot both act on it.
    const { data: claimed } = await supabaseAdmin
      .from('session_void_requests')
      .update({
        status: input.approve ? 'approved' : 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq('id', req.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) return fail('This request was already decided.');

    let message = 'Session kept.';
    if (input.approve) {
      const res = await executeVoid({ sessionId: req.session_id, reason: req.reason, actorId: user.id });
      if (!res.ok) {
        // Put the request back so it can be tried again
        await supabaseAdmin
          .from('session_void_requests')
          .update({ status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null })
          .eq('id', req.id);
        return fail(res.error);
      }
      message = res.walletRefunded
        ? `Voided. GHS ${res.walletRefunded.toFixed(2)} went back to the driver's wallet.`
        : res.refundDue
          ? `Voided. GHS ${res.refundDue.toFixed(2)} must be paid back to the driver by MoMo.`
          : 'Voided.';
    }

    const { data: sess } = await supabaseAdmin.from('sessions').select('receipt_number').eq('id', req.session_id).maybeSingle();
    await logAudit({
      actor: user,
      action: input.approve ? 'session.void.approve' : 'session.void.reject',
      resourceType: 'session',
      resourceId: req.session_id,
      metadata: { receiptNumber: sess?.receipt_number, requestId: req.id, note },
    });
    await createNotification({
      user_id: req.requested_by,
      title: input.approve ? 'Void approved' : 'Void not approved',
      message: `Session ${sess?.receipt_number || ''}: ${input.approve ? 'voided' : `kept. ${note}`}`,
      type: input.approve ? 'success' : 'warning',
    });
    revalidatePath('/approvals');
    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true, message };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[APPROVALS] decideVoid error:', err);
    return fail('Could not save the decision. Please try again.');
  }
}

/** A manager looks at a flagged reading and accepts it, or marks it as a problem. */
export async function reviewReading(input: { sessionId: string; decision: 'accepted' | 'problem'; note?: string }): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(MANAGERS);
    const note = String(input.note || '').trim();
    if (input.decision === 'problem' && note.length < 5) return fail('Write what is wrong, so it can be followed up.');

    const { data: s } = await supabaseAdmin
      .from('sessions')
      .select('id, receipt_number, attendant_id, review_flags')
      .eq('id', input.sessionId)
      .maybeSingle();
    if (!s) return fail('Session not found.');

    const { data: done } = await supabaseAdmin
      .from('sessions')
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_decision: input.decision, review_note: note || null })
      .eq('id', s.id)
      .is('reviewed_at', null)
      .select('id')
      .maybeSingle();
    if (!done) return fail('This reading was already reviewed.');

    await logAudit({
      actor: user,
      action: input.decision === 'accepted' ? 'reading.accept' : 'reading.problem',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, flags: s.review_flags, note },
    });
    if (input.decision === 'problem') {
      await createNotification({ user_id: s.attendant_id, title: 'Reading marked as a problem', message: `Session ${s.receipt_number}: ${note}`, type: 'warning' });
    }
    revalidatePath('/approvals');
    return { success: true };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[APPROVALS] reviewReading error:', err);
    return fail('Could not save the decision. Please try again.');
  }
}

/** A manager voids a session directly. Same refund rules as an approved request; the reason is audited. */
export async function voidSessionNow(input: { sessionId: string; reason: string }): Promise<{ success: true; message: string } | Fail> {
  try {
    const user = await requireAuth(MANAGERS);
    const reason = String(input.reason || '').trim();
    if (reason.length < 5) return fail('Write why this session is being voided.');

    const { data: s } = await supabaseAdmin
      .from('sessions')
      .select('id, receipt_number, recording_mode')
      .eq('id', input.sessionId)
      .maybeSingle();
    if (!s || s.recording_mode !== 'manual_gun') return fail('Session not found.');

    const res = await executeVoid({ sessionId: s.id, reason, actorId: user.id });
    if (!res.ok) return fail(res.error);

    // Any request still waiting for this session is now settled
    await supabaseAdmin
      .from('session_void_requests')
      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: 'Voided directly by a manager' })
      .eq('session_id', s.id)
      .eq('status', 'pending');

    await logAudit({
      actor: user,
      action: 'session.void.direct',
      resourceType: 'session',
      resourceId: s.id,
      metadata: { receiptNumber: s.receipt_number, reason, walletRefunded: res.walletRefunded, refundDue: res.refundDue },
    });
    revalidatePath('/approvals');
    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    const message = res.walletRefunded
      ? `Voided. GHS ${res.walletRefunded.toFixed(2)} went back to the driver's wallet.`
      : res.refundDue
        ? `Voided. GHS ${res.refundDue.toFixed(2)} must be paid back to the driver by MoMo.`
        : 'Voided.';
    return { success: true, message };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[APPROVALS] voidSessionNow error:', err);
    return fail('Could not void the session. Please try again.');
  }
}
