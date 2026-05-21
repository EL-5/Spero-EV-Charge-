'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

export async function addCharger(formData: {
  charge_point_id: string;
  name: string;
  vendor?: string;
  model?: string;
  serial_number?: string;
  location?: string;
}) {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { error } = await supabaseAdmin.from('chargers').insert([
      {
        charge_point_id: formData.charge_point_id,
        name: formData.name,
        vendor: formData.vendor || null,
        model: formData.model || null,
        serial_number: formData.serial_number || null,
        location: formData.location || null,
        status: 'offline',
      },
    ]);

    if (error) throw error;

    // By default, let's create a single connector for the new charger
    const { data: charger } = await supabaseAdmin
      .from('chargers')
      .select('id')
      .eq('charge_point_id', formData.charge_point_id)
      .single();

    if (charger) {
      await supabaseAdmin.from('connectors').insert([
        {
          charger_id: charger.id,
          connector_number: 1,
          status: 'Available',
          power_type: 'AC',
          max_power: 22.0,
        },
      ]);
    }

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding charger:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateCharger(id: string, formData: {
  name: string;
  vendor?: string;
  model?: string;
  serial_number?: string;
  location?: string;
}) {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { error } = await supabaseAdmin
      .from('chargers')
      .update({
        name: formData.name,
        vendor: formData.vendor || null,
        model: formData.model || null,
        serial_number: formData.serial_number || null,
        location: formData.location || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating charger:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteCharger(id: string) {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { error } = await supabaseAdmin
      .from('chargers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting charger:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendOcppCommand(data: {
  chargePointId: string;
  command: string;
  payload?: any;
}) {
  try {
    await requireAuth(['super_admin', 'manager', 'attendant']);

    const { data: cmd, error } = await supabaseAdmin
      .from('ocpp_commands')
      .insert([
        {
          charge_point_id: data.chargePointId,
          command: data.command,
          payload: data.payload || {},
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/chargers');
    return { success: true, command: cmd };
  } catch (error: any) {
    console.error('Error queuing OCPP command:', error.message);
    return { success: false, error: error.message };
  }
}

export async function clearOcppLogs(chargePointId?: string) {
  try {
    await requireAuth(['super_admin', 'manager']);

    let query = supabaseAdmin.from('ocpp_logs').delete();
    if (chargePointId) {
      query = query.eq('charge_point_id', chargePointId);
    } else {
      query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    }

    const { error } = await query;
    if (error) throw error;

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('Error clearing OCPP logs:', error.message);
    return { success: false, error: error.message };
  }
}
