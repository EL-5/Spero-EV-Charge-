'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { ACCEPT_CASH, roundMoney } from '@/lib/gun-session';

// ─────────────────────────────────────────────────────────────────────────────
// FIX MED-01: requireAuth guard added — any authenticated user can start a
//             shift, only managers/admins can close one.
// FIX LOW-01: Raw DB errors no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function startShift(attendantId: string) {
  try {
    // Any authenticated station staff can start a shift
    const user = await requireAuth(['super_admin', 'manager', 'accountant', 'attendant']);

    // Prevent regular attendants from starting shifts on behalf of other users
    // Managers and super_admins may start shifts on behalf of anyone
    const isElevated = user.role === 'super_admin' || user.role === 'manager';
    if (!isElevated && attendantId !== user.id) {
      return { success: false, error: 'Forbidden: You can only start shifts for yourself.' };
    }

    // Prevent an attendant from having more than one active shift simultaneously
    const { data: existingShift } = await supabaseAdmin
      .from('shifts')
      .select('id')
      .eq('attendant_id', attendantId)
      .eq('status', 'active')
      .maybeSingle();

    if (existingShift) {
      return { success: false, error: 'You already have an active shift. Close it before starting a new one.' };
    }

    const { data: created, error } = await supabaseAdmin
      .from('shifts')
      .insert([
        {
          attendant_id: attendantId,
          start_time: new Date().toISOString(),
          status: 'active',
          cash_collected: 0,
          hubtel_collected: 0,
          paystack_collected: 0,
          wallet_deductions: 0,
          total_sessions: 0,
          outstanding_debts: 0,
        },
      ])
      .select('id')
      .single();

    if (error) {
      console.error('[SHIFTS] startShift error:', error);
      return { success: false, error: 'Failed to start shift. Please try again.' };
    }

    await logAudit({
      actor: user,
      action: 'shift.start',
      resourceType: 'shift',
      resourceId: created?.id,
      metadata: { attendantId },
    });

    revalidatePath('/shifts');
    return { success: true };
  } catch (error: unknown) {
    console.error('[SHIFTS] startShift error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Unauthenticated') || message.startsWith('Forbidden')) {
      return { success: false, error: message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

/**
 * Closes a shift from the cash the attendant counted.
 *
 * The attendant counts BLIND: this never returns the expected cash or the
 * difference to an attendant. Managers and above get the variance back.
 * An attendant can only close their own shift, and not while a session is
 * still charging or waiting for payment — that money would otherwise fall
 * outside every shift's totals.
 */
export async function closeShift(shiftId: string, closingCashCount: number, notes?: string) {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'attendant']);

    if (!Number.isFinite(closingCashCount) || closingCashCount < 0) {
      return { success: false, error: 'Enter the cash you counted. It cannot be negative.' };
    }

    const { data: shift, error: fetchError } = await supabaseAdmin
      .from('shifts')
      .select('attendant_id, cash_collected, status')
      .eq('id', shiftId)
      .single();

    if (fetchError || !shift) {
      console.error('[SHIFTS] Shift fetch error:', fetchError);
      return { success: false, error: 'Shift not found. Please try again.' };
    }

    if (user.role === 'attendant' && shift.attendant_id !== user.id) {
      return { success: false, error: 'Forbidden: You can only close your own shift.' };
    }

    if (shift.status === 'closed') {
      return { success: false, error: 'This shift has already been closed.' };
    }

    if (user.role === 'attendant') {
      const { data: open } = await supabaseAdmin
        .from('sessions')
        .select('receipt_number, status')
        .eq('shift_id', shiftId)
        .in('status', ['active', 'pending_payment']);
      if (open && open.length > 0) {
        const running = open.filter((s) => s.status === 'active').length;
        const unpaid = open.length - running;
        const parts = [
          running ? `${running} session${running > 1 ? 's' : ''} still charging` : '',
          unpaid ? `${unpaid} waiting for payment` : '',
        ].filter(Boolean);
        return { success: false, error: `Finish these first: ${parts.join(' and ')}.` };
      }
    }

    const expected = roundMoney(Number(shift.cash_collected || 0));
    // The station takes no cash, so an attendant has no drawer to count: closing
    // just confirms the shift, and there is nothing to be short.
    const counted = !ACCEPT_CASH && user.role === 'attendant' ? expected : roundMoney(closingCashCount);
    const cashVariance = roundMoney(counted - expected);

    // Only an open shift can be closed, and only once.
    const { data: closed, error } = await supabaseAdmin
      .from('shifts')
      .update({
        status: 'closed',
        end_time: new Date().toISOString(),
        closing_cash_count: counted,
        cash_variance: cashVariance,
        closing_notes: notes?.trim() || null,
      })
      .eq('id', shiftId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[SHIFTS] closeShift error:', error);
      return { success: false, error: 'Failed to close shift. Please try again.' };
    }
    if (!closed) {
      return { success: false, error: 'This shift has already been closed.' };
    }

    await logAudit({
      actor: user,
      action: cashVariance === 0 ? 'shift.close' : 'shift.close.variance',
      resourceType: 'shift',
      resourceId: shiftId,
      metadata: { counted, expected, cashVariance, attendantId: shift.attendant_id },
    });

    revalidatePath('/shifts');
    revalidatePath('/dashboard');
    // Variance is for managers only — an attendant never sees the expected figure.
    return user.role === 'attendant' ? { success: true } : { success: true, variance: cashVariance };
  } catch (error: unknown) {
    console.error('[SHIFTS] closeShift error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Unauthenticated') || message.startsWith('Forbidden')) {
      return { success: false, error: message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

/** The signed-in person's open shift, without any cash figures. */
export async function getMyShift() {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'attendant']);
    const { data: shift } = await supabaseAdmin
      .from('shifts')
      .select('id, start_time, total_sessions')
      .eq('attendant_id', user.id)
      .eq('status', 'active')
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!shift) return { success: true as const, shift: null };

    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('status, units_consumed')
      .eq('shift_id', shift.id)
      .neq('status', 'cancelled');

    const open = (sessions || []).filter((s) => s.status === 'active' || s.status === 'pending_payment').length;
    const kwh = (sessions || []).reduce((sum, s) => sum + Number(s.units_consumed || 0), 0);

    return {
      success: true as const,
      shift: {
        id: shift.id as string,
        startTime: shift.start_time as string,
        sessions: (sessions || []).length,
        openSessions: open,
        kwh: Math.round(kwh * 10) / 10,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Unauthenticated') || message.startsWith('Forbidden')) {
      return { success: false as const, error: message };
    }
    console.error('[SHIFTS] getMyShift error:', error);
    return { success: false as const, error: 'Could not load your shift.' };
  }
}
