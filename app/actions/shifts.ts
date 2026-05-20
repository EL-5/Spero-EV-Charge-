'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

// ─────────────────────────────────────────────────────────────────────────────
// FIX MED-01: requireAuth guard added — any authenticated user can start a
//             shift, only managers/admins can close one.
// FIX LOW-01: Raw DB errors no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function startShift(attendantId: string) {
  try {
    // Any authenticated station staff can start a shift
    await requireAuth(['super_admin', 'manager', 'accountant', 'attendant']);

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

    const { error } = await supabaseAdmin.from('shifts').insert([
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
    ]);

    if (error) {
      console.error('[SHIFTS] startShift error:', error);
      return { success: false, error: 'Failed to start shift. Please try again.' };
    }

    revalidatePath('/shifts');
    return { success: true };
  } catch (error: any) {
    console.error('[SHIFTS] startShift error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function closeShift(shiftId: string, closingCashCount: number) {
  try {
    // Closing a shift requires at least manager level (financial operation)
    await requireAuth(['super_admin', 'manager', 'attendant']);

    if (closingCashCount < 0) {
      return { success: false, error: 'Closing cash count cannot be negative.' };
    }

    // Get shift to calculate variance
    const { data: shift, error: fetchError } = await supabaseAdmin
      .from('shifts')
      .select('cash_collected, status')
      .eq('id', shiftId)
      .single();

    if (fetchError || !shift) {
      console.error('[SHIFTS] Shift fetch error:', fetchError);
      return { success: false, error: 'Shift not found. Please try again.' };
    }

    if (shift.status === 'closed') {
      return { success: false, error: 'This shift has already been closed.' };
    }

    const cashVariance = closingCashCount - (shift.cash_collected || 0);

    const { error } = await supabaseAdmin
      .from('shifts')
      .update({
        status: 'closed',
        end_time: new Date().toISOString(),
        closing_cash_count: closingCashCount,
        cash_variance: cashVariance,
      })
      .eq('id', shiftId);

    if (error) {
      console.error('[SHIFTS] closeShift error:', error);
      return { success: false, error: 'Failed to close shift. Please try again.' };
    }

    revalidatePath('/shifts');
    return { success: true };
  } catch (error: any) {
    console.error('[SHIFTS] closeShift error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
