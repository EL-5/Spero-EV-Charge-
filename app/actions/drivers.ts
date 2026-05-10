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
    const { error } = await supabaseAdmin
      .from('drivers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/drivers');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting driver:', error.message);
    return { success: false, error: error.message };
  }
}
