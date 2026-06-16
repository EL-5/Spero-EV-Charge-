'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

export async function addReconciliation(formData: {
  period_start: string;
  period_end: string;
  meter_kwh: number;
  notes?: string;
}) {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'finance']);

    // Fetch all kWh sessions in the period
    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('units_consumed')
      .eq('unit_type', 'kwh')
      .gte('created_at', formData.period_start)
      .lte('created_at', formData.period_end);

    if (sessionsError) throw sessionsError;

    const appKwh = sessions.reduce((sum, s) => sum + (Number(s.units_consumed) || 0), 0);

    const { error: insertError } = await supabaseAdmin
      .from('energy_reconciliation')
      .insert([
        {
          period_start: formData.period_start,
          period_end: formData.period_end,
          meter_kwh: formData.meter_kwh,
          app_kwh: appKwh,
          notes: formData.notes,
          created_by: user.id,
        }
      ]);

    if (insertError) throw insertError;

    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[RECONCILIATION] error:', error);
    return { success: false, error: error.message || 'Failed to add reconciliation record.' };
  }
}

export async function deleteReconciliation(id: string) {
  try {
    await requireAuth(['super_admin']);
    const { error } = await supabaseAdmin.from('energy_reconciliation').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[RECONCILIATION] delete error:', error);
    return { success: false, error: error.message || 'Failed to delete record.' };
  }
}
