'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';
import { generateReceiptNumber } from '@/lib/utils';

/**
 * Records a debt repayment:
 * 1. Resolves/pays outstanding unpaid/pending sessions first (oldest first).
 * 2. Applies any remaining payment to reduce the driver's database column debt_balance.
 * 3. Logs a credit entry in wallet_transactions.
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

    // A. Fetch all unpaid/pending sessions for this driver, ordered oldest to newest
    const { data: unpaidSessions, error: sessionsFetchError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: true });

    if (sessionsFetchError) {
      throw sessionsFetchError;
    }

    // Filter for truly unpaid/pending sessions
    const sessionsToPay = (unpaidSessions || []).filter(s =>
      s.status !== 'cancelled' &&
      s.payment_status !== 'paid' &&
      s.payment_status !== 'refunded'
    );

    let remainingPayment = amount;

    // Apply repayment to sessions first
    for (const s of sessionsToPay) {
      if (remainingPayment <= 0) break;
      const cost = Number(s.total_amount || s.prepaid_amount || 0);
      if (cost <= 0) continue;

      if (remainingPayment >= cost) {
        // Fully pay this session
        const { error: updateErr } = await supabaseAdmin
          .from('sessions')
          .update({
            status: 'completed',
            payment_status: 'paid',
            payment_method: method.toLowerCase(),
          })
          .eq('id', s.id);

        if (updateErr) throw updateErr;
        remainingPayment -= cost;
      } else {
        // Partially pay this session: deduct the partial amount from its total_amount
        const newCost = cost - remainingPayment;
        const { error: updateErr } = await supabaseAdmin
          .from('sessions')
          .update({
            total_amount: newCost,
            prepaid_amount: s.mode === 'prepaid' ? newCost : s.prepaid_amount,
          })
          .eq('id', s.id);

        if (updateErr) throw updateErr;
        remainingPayment = 0;
      }
    }

    // B. Get driver details
    const { data: driverInfo, error: driverFetchError } = await supabaseAdmin
      .from('drivers')
      .select('name, debt_balance')
      .eq('id', driverId)
      .single();

    if (driverFetchError) throw driverFetchError;

    const initialDbDebt = Number(driverInfo?.debt_balance || 0);
    let dbDebtDelta = 0;
    let debtAfter = initialDbDebt;

    // Apply remaining payment to database column debt_balance if driver has any
    if (remainingPayment > 0 && initialDbDebt > 0) {
      dbDebtDelta = -Math.min(initialDbDebt, remainingPayment);
      
      const { data: adjustment, error: adjustError } = await supabaseAdmin
        .rpc('adjust_debt_balance', {
          p_driver_id: driverId,
          p_delta: dbDebtDelta,
        })
        .single();

      if (adjustError) {
        console.error('[DEBTS] recordDebtPayment adjust error:', adjustError);
        throw new Error('Failed to update debt balance.');
      }

      debtAfter = (adjustment as any)?.balance_after ?? (initialDbDebt + dbDebtDelta);
    }

    // Get staff name for notification
    const { data: staff } = await supabaseAdmin.from('profiles').select('name').eq('id', user.id).single();

    // Log payment in wallet_transactions
    await supabaseAdmin.from('wallet_transactions').insert({
      driver_id: driverId,
      type: 'credit',
      amount,
      balance_before: initialDbDebt,
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
    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (e: any) {
    console.error('[DEBTS] recordDebtPayment error:', e);
    return { success: false, error: e.message || 'An unexpected error occurred.' };
  }
}
