'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import type { DriverType } from '@/lib/types';

export async function addDriver(formData: {
  name: string;
  phone: string;
  email?: string;
  type: DriverType;
}) {
  try {
    const { data, error } = await supabaseAdmin.from('drivers').insert([
      {
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        type: formData.type,
        wallet_balance: 0,
        debt_balance: 0,
        total_sessions: 0,
      },
    ]).select('id').single();

    if (error) throw error;

    revalidatePath('/drivers');
    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('Error adding driver:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateDriver(id: string, formData: {
  name: string;
  phone: string;
  email?: string;
  type: DriverType;
  vehicle?: {
    brand: string;
    model: string;
    plate_number: string;
  };
}) {
  try {
    // 1. Update Driver
    const { error: dError } = await supabaseAdmin
      .from('drivers')
      .update({
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        type: formData.type,
      })
      .eq('id', id);

    if (dError) throw dError;

    // 2. Update Vehicle if provided
    if (formData.vehicle) {
      const { error: vError } = await supabaseAdmin
        .from('vehicles')
        .update({
          brand: formData.vehicle.brand,
          model: formData.vehicle.model,
          plate_number: formData.vehicle.plate_number,
        })
        .eq('driver_id', id);
      
      if (vError) throw vError;
    }

    revalidatePath('/drivers');
    revalidatePath('/vehicles');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating driver:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteDriver(id: string) {
  try {
    // 1. Attempt to dissociate related records
    // This preserves history if the schema allows NULLs
    
    // Vehicles
    const { error: vError } = await supabaseAdmin
      .from('vehicles')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (vError) {
      // If we can't set to NULL, we must delete to satisfy the clean start requirement
      await supabaseAdmin.from('vehicles').delete().eq('driver_id', id);
    }

    // Sessions
    const { error: sError } = await supabaseAdmin
      .from('sessions')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (sError) {
      await supabaseAdmin.from('sessions').delete().eq('driver_id', id);
    }

    // Payments
    const { error: pError } = await supabaseAdmin
      .from('payments')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (pError) {
      await supabaseAdmin.from('payments').delete().eq('driver_id', id);
    }

    // Wallet Transactions
    const { error: wtError } = await supabaseAdmin
      .from('wallet_transactions')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (wtError) {
      await supabaseAdmin.from('wallet_transactions').delete().eq('driver_id', id);
    }

    // 2. Finally delete the driver
    const { error: finalError } = await supabaseAdmin
      .from('drivers')
      .delete()
      .eq('id', id);

    if (finalError) throw finalError;

    revalidatePath('/drivers');
    revalidatePath('/vehicles');
    revalidatePath('/sessions');
    revalidatePath('/payments');
    revalidatePath('/wallets');
    
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting driver:', error.message);
    return { success: false, error: error.message };
  }
}
