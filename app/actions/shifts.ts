'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function startShift(attendantId: string) {
  try {
    const { error } = await supabaseAdmin.from('shifts').insert([{
      attendant_id: attendantId,
      start_time: new Date().toISOString(),
      status: 'active',
      cash_collected: 0,
      hubtel_collected: 0,
      paystack_collected: 0,
      wallet_deductions: 0,
      total_sessions: 0,
      outstanding_debts: 0,
    }]);
    if (error) throw error;
    revalidatePath('/shifts');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function closeShift(shiftId: string, closingCashCount: number) {
  try {
    // Get shift to calculate variance
    const { data: shift, error: fetchError } = await supabaseAdmin
      .from('shifts')
      .select('cash_collected')
      .eq('id', shiftId)
      .single();
    if (fetchError) throw fetchError;

    const cashVariance = closingCashCount - (shift.cash_collected || 0);

    const { error } = await supabaseAdmin.from('shifts').update({
      status: 'closed',
      end_time: new Date().toISOString(),
      closing_cash_count: closingCashCount,
      cash_variance: cashVariance,
    }).eq('id', shiftId);

    if (error) throw error;
    revalidatePath('/shifts');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
