'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';
import type { DriverType } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// FIX MED-01: requireAuth guards added to all mutating actions.
// FIX LOW-01: Raw DB errors no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function addDriver(formData: {
  name: string;
  phone: string;
  email?: string;
  type: DriverType;
}) {
  try {
    // Attendants, managers, and super_admins can register new drivers
    await requireAuth(['super_admin', 'manager', 'attendant']);

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .insert([
        {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          type: formData.type,
          wallet_balance: 0,
          debt_balance: 0,
          total_sessions: 0,
        },
      ])
      .select('id')
      .single();

    if (error) {
      console.error('[DRIVERS] addDriver error:', error);
      return { success: false, error: 'Failed to add driver. Please try again.' };
    }

    revalidatePath('/drivers');
    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('[DRIVERS] addDriver error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function updateDriver(
  id: string,
  formData: {
    name: string;
    phone: string;
    email?: string;
    type: DriverType;
    vehicle?: {
      brand: string;
      model: string;
      plate_number: string;
    };
  }
) {
  try {
    // Attendants and above can update driver info
    await requireAuth(['super_admin', 'manager', 'attendant']);

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

    if (dError) {
      console.error('[DRIVERS] updateDriver driver error:', dError);
      return { success: false, error: 'Failed to update driver. Please try again.' };
    }

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

      if (vError) {
        console.error('[DRIVERS] updateDriver vehicle error:', vError);
        return { success: false, error: 'Failed to update vehicle info. Please try again.' };
      }
    }

    revalidatePath('/drivers');
    revalidatePath('/vehicles');
    return { success: true };
  } catch (error: any) {
    console.error('[DRIVERS] updateDriver error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function deleteDriver(id: string) {
  try {
    // Only managers and super_admins can delete drivers
    await requireAuth(['super_admin', 'manager']);

    // 1. SAFETY CHECK: Block deletion if the driver has active or pending-payment sessions
    //    These represent in-progress financial transactions that must be resolved first.
    const { data: activeSessions, error: checkError } = await supabaseAdmin
      .from('sessions')
      .select('id, receipt_number, status')
      .eq('driver_id', id)
      .in('status', ['active', 'pending_payment']);

    if (checkError) {
      console.error('[DRIVERS] deleteDriver session check error:', checkError);
      return { success: false, error: 'Could not verify driver session status. Please try again.' };
    }

    if (activeSessions && activeSessions.length > 0) {
      const refs = activeSessions.map(s => s.receipt_number).join(', ');
      return {
        success: false,
        error: `Cannot delete driver: ${activeSessions.length} active session(s) in progress (${refs}). Resolve all sessions first.`,
      };
    }

    // 2. Attempt to dissociate related records (preserves history if schema allows NULLs)

    // Vehicles — preserve by nullifying driver link
    const { error: vError } = await supabaseAdmin
      .from('vehicles')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (vError) {
      console.warn('[DRIVERS] deleteDriver: vehicle nullification failed, falling back to hard delete', vError);
      await supabaseAdmin.from('vehicles').delete().eq('driver_id', id);
    }

    // Sessions — preserve completed/cancelled history by nullifying FK
    const { error: sError } = await supabaseAdmin
      .from('sessions')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (sError) {
      console.warn('[DRIVERS] deleteDriver: session nullification failed, falling back to hard delete', sError);
      await supabaseAdmin.from('sessions').delete().eq('driver_id', id);
    }

    // Payments — preserve by nullifying FK
    const { error: pError } = await supabaseAdmin
      .from('payments')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (pError) {
      console.warn('[DRIVERS] deleteDriver: payment nullification failed, falling back to hard delete', pError);
      await supabaseAdmin.from('payments').delete().eq('driver_id', id);
    }

    // Wallet Transactions — preserve by nullifying FK
    const { error: wtError } = await supabaseAdmin
      .from('wallet_transactions')
      .update({ driver_id: null })
      .eq('driver_id', id);
    if (wtError) {
      console.warn('[DRIVERS] deleteDriver: wallet_transactions nullification failed, falling back to hard delete', wtError);
      await supabaseAdmin.from('wallet_transactions').delete().eq('driver_id', id);
    }

    // 3. Finally delete the driver
    const { error: finalError } = await supabaseAdmin.from('drivers').delete().eq('id', id);

    if (finalError) {
      console.error('[DRIVERS] deleteDriver final error:', finalError);
      return { success: false, error: 'Failed to delete driver. Please try again.' };
    }

    revalidatePath('/drivers');
    revalidatePath('/vehicles');
    revalidatePath('/sessions');
    revalidatePath('/payments');
    revalidatePath('/wallets');

    return { success: true };
  } catch (error: any) {
    console.error('[DRIVERS] deleteDriver error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
