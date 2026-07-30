'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';
import { generateReceiptNumber } from '@/lib/utils';

/**
 * Records a debt repayment:
 * 1. Reduces the driver's debt_balance by the paid amount (floors at 0)
 * 2. Logs a credit entry in wallet_transactions
 */
export async function recordDebtPayment(payload: {
  driverId: string;
  amount: number;
  method: string;
}) {
  try {
    // 1. Authenticate and authorize caller
    const user = await requireAuth(['super_admin', 'manager']);
    const { driverId, amount, method } = payload;

    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Enter a valid repayment amount.' };
    }

    // Atomic read + floor-at-zero + write — avoids a lost update if the
    // driver's debt is adjusted concurrently (another repayment, a new debt).
    const { data: adjustment, error: adjustError } = await supabaseAdmin
      .rpc('adjust_debt_balance', {
        p_driver_id: driverId,
        p_delta: -amount,
      })
      .single();

    if (adjustError || !adjustment) {
      console.error('[DEBTS] recordDebtPayment adjust error:', adjustError);
      return { success: false, error: 'Driver not found or failed to update debt balance.' };
    }

    const { balance_before: debtBefore, balance_after: debtAfter } = adjustment as {
      balance_before: number;
      balance_after: number;
    };

    if (amount > debtBefore + 0.01) {
      console.warn(
        `[DEBTS] Repayment of GHS ${amount.toFixed(2)} exceeds outstanding debt of GHS ${debtBefore.toFixed(2)} for driver ${driverId} — floored at zero.`
      );
    }

    // Get staff name for notification (using verified user id)
    const { data: staff } = await supabaseAdmin.from('profiles').select('name').eq('id', user.id).single();
    const { data: driverInfo } = await supabaseAdmin.from('drivers').select('name').eq('id', driverId).single();

    // Log payment in wallet_transactions — balance_before/after here reflect
    // the debt balance change (debt going down), not the wallet balance,
    // which this operation never touches.
    await supabaseAdmin.from('wallet_transactions').insert({
      driver_id: driverId,
      type: 'credit',
      amount,
      balance_before: debtBefore,
      balance_after: debtAfter,
      description: `Debt repayment via ${method} — GHS ${amount.toFixed(2)}`,
      created_by: user.id,
    });

    // Also log in payments table
    await supabaseAdmin.from('payments').insert({
      driver_id: driverId,
      amount,
      method: method.toLowerCase().replace(' ', '_').replace('hubtel_momo', 'hubtel'),
      status: 'completed',
      receipt_number: generateReceiptNumber('DEBT'),
    });

    // Notify all admins about the repayment
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin');

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
