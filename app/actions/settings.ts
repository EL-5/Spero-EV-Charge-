'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function saveSettings(settings: Record<string, any>) {
  try {
    // Get the single settings row id
    const { data: existing } = await supabaseAdmin
      .from('settings')
      .select('id')
      .limit(1)
      .single();

    if (!existing) {
      return { success: false, error: 'No settings row found. Run the SQL migration.' };
    }

    const { error } = await supabaseAdmin
      .from('settings')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updatePricingRate(payload: {
  unit_type: 'kwh' | 'minutes' | 'hours';
  unit_quantity: number;
  rate: number;
}) {
  try {
    // 1. Insert the new active rate first
    const { data: newRate, error: insertError } = await supabaseAdmin
      .from('pricing')
      .insert({
        unit_type: payload.unit_type,
        unit_quantity: payload.unit_quantity,
        rate: payload.rate,
        description: `GHS ${payload.rate} per ${payload.unit_quantity} ${payload.unit_type}`,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Deactivate all OTHER rates of the same type
    if (newRate) {
      await supabaseAdmin
        .from('pricing')
        .update({ is_active: false })
        .eq('unit_type', payload.unit_type)
        .neq('id', newRate.id);
    }

    revalidatePath('/settings');
    return { success: true };
  } catch (e: any) {
    console.error('Pricing update error:', e);
    return { success: false, error: e.message };
  }
}
