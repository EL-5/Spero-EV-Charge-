'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function addVehicle(formData: {
  brand: string;
  model: string;
  plate_number: string;
  driver_id?: string;
  corporate_account_id?: string;
}) {
  try {
    const { error } = await supabaseAdmin.from('vehicles').insert([
      {
        brand: formData.brand,
        model: formData.model,
        plate_number: formData.plate_number,
        driver_id: formData.driver_id || null,
        corporate_account_id: formData.corporate_account_id || null,
        total_sessions: 0,
      },
    ]);

    if (error) throw error;

    revalidatePath('/vehicles');
    return { success: true };
  } catch (error: any) {
    console.error('Error adding vehicle:', error.message);
    return { success: false, error: error.message };
  }
}
export async function updateVehicle(id: string, formData: {
  brand: string;
  model: string;
  plate_number: string;
  driver_id?: string;
}) {
  try {
    const { error } = await supabaseAdmin
      .from('vehicles')
      .update({
        brand: formData.brand,
        model: formData.model,
        plate_number: formData.plate_number,
        driver_id: formData.driver_id || null,
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/vehicles');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating vehicle:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteVehicle(id: string) {
  try {
    const { error } = await supabaseAdmin
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/vehicles');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting vehicle:', error.message);
    return { success: false, error: error.message };
  }
}
