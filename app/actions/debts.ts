'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Records a debt repayment:
 * 1. Reduces the driver's debt_balance by the paid amount (floors at 0)
 * 2. Logs a credit entry in wallet_transactions
 */
export async function recordDebtPayment(payload: {
  driverId: string;
  amount: number;
  method: string;
  createdBy: string;
}) {
  try {
    const { driverId, amount, method, createdBy } = payload;

    // Fetch current driver state
    const { data: driver, error: fetchErr } = await supabaseAdmin
      .from('drivers')
      .select('debt_balance, wallet_balance')
      .eq('id', driverId)
      .single();

    if (fetchErr || !driver) return { success: false, error: 'Driver not found' };

    const newDebt = Math.max(0, Number(driver.debt_balance) - amount);

    // Update driver debt balance
    const { error: updateErr } = await supabaseAdmin
      .from('drivers')
      .update({ debt_balance: newDebt })
      .eq('id', driverId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Get staff name for notification
    const { data: staff } = await supabaseAdmin.from('profiles').select('name').eq('id', createdBy).single();
    const { data: driverInfo } = await supabaseAdmin.from('drivers').select('name').eq('id', driverId).single();

    // Log payment in wallet_transactions
    await supabaseAdmin.from('wallet_transactions').insert({
      driver_id: driverId,
      type: 'credit',
      amount,
      balance_before: driver.wallet_balance,
      balance_after: driver.wallet_balance,
      description: `Debt repayment via ${method} — GHS ${amount.toFixed(2)}`,
      created_by: createdBy,
    });

    // Also log in payments table
    await supabaseAdmin.from('payments').insert({
      driver_id: driverId,
      amount,
      method: method.toLowerCase().replace(' ', '_').replace('hubtel_momo', 'hubtel'),
      status: 'completed',
      receipt_number: `DEBT-${Date.now()}`,
    });

    // Notify all admins about the repayment
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'superadmin');

    if (admins) {
      const { createNotification } = await import('@/app/actions/notifications');
      for (const admin of admins) {
        await createNotification({
          user_id: admin.id,
          title: 'Debt Repayment Received',
          message: `${staff?.name || 'Staff'} collected GHS ${amount.toFixed(2)} from ${driverInfo?.name || 'Driver'}.`,
          type: 'success',
        });
      }
    }

    revalidatePath('/debts');
    revalidatePath('/payments');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
