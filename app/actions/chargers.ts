'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

export async function addCharger(formData: {
  charge_point_id: string;
  vendor?: string;
  model?: string;
  station_id?: string;
  ocpp_version?: string;
  security_profile?: number;
  auth_password?: string;
  heartbeat_interval?: number;
  guns_count?: number;
  connector_type?: string;
  max_power?: number;
}) {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { error } = await supabaseAdmin.from('chargers').insert([
      {
        charge_point_id: formData.charge_point_id,
        name: formData.charge_point_id,
        vendor: formData.vendor || null,
        model: formData.model || null,
        station_id: formData.station_id || null,
        status: 'offline',
        ocpp_version: formData.ocpp_version || '1.6-J',
        security_profile: Number(formData.security_profile !== undefined ? formData.security_profile : 1),
        auth_password: formData.auth_password || null,
        heartbeat_interval: Number(formData.heartbeat_interval || 60),
      },
    ]);

    if (error) throw error;

    // Fetch the newly created charger
    const { data: charger } = await supabaseAdmin
      .from('chargers')
      .select('id')
      .eq('charge_point_id', formData.charge_point_id)
      .single();

    if (charger) {
      const gunsCount = Number(formData.guns_count || 2);
      const isAC = formData.connector_type?.toLowerCase().includes('ac') || formData.connector_type === 'Type 2';
      
      const connectorsToInsert = Array.from({ length: gunsCount }, (_, i) => ({
        charger_id: charger.id,
        connector_number: i + 1,
        status: 'Available',
        power_type: isAC ? 'AC' : 'DC',
        max_power: Number(formData.max_power || 22.0),
      }));

      const { error: connectorError } = await supabaseAdmin
        .from('connectors')
        .insert(connectorsToInsert);
      
      if (connectorError) throw connectorError;
    }

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('[CHARGERS] addCharger error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to add charger. Please try again.' };
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
    console.error('[CHARGERS] updateCharger error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update charger. Please try again.' };
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
    console.error('[CHARGERS] deleteCharger error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to delete charger. Please try again.' };
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
    console.error('[CHARGERS] sendOcppCommand error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to send command. Please try again.' };
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
    console.error('[CHARGERS] clearOcppLogs error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to clear logs. Please try again.' };
  }
}

export async function addStation(formData: {
  name: string;
  location: string;
}) {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { error } = await supabaseAdmin.from('stations').insert([
      {
        name: formData.name,
        location: formData.location,
        status: 'active',
      },
    ]);

    if (error) throw error;

    revalidatePath('/chargers');
    return { success: true };
  } catch (error: any) {
    console.error('[STATIONS] addStation error:', error.message);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to add station. Please try again.' };
  }
}

