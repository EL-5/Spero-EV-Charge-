'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

// ─────────────────────────────────────────────────────────────────────────────
// FIX MED-01: requireAuth guards added. Only managers/super_admins can credit
//             wallets (high financial-risk operation).
// FIX LOW-01: Raw DB errors no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function topUpWallet(formData: {
  driver_id: string;
  amount: number;
  type: 'top_up' | 'bonus' | 'credit';
  description: string;
  createdBy: string;
}) {
  try {
    // Wallet top-ups are high-trust operations — managers and above only
    await requireAuth(['super_admin', 'manager']);

    // Input validation — prevent negative or zero amounts
    if (formData.amount <= 0) {
      return { success: false, error: 'Top-up amount must be greater than zero.' };
    }

    // Cap single top-up to prevent accidental over-crediting
    const MAX_TOPUP = 10_000; // GHS 10,000 per transaction
    if (formData.amount > MAX_TOPUP) {
      return { success: false, error: `Top-up amount cannot exceed GHS ${MAX_TOPUP.toLocaleString()} per transaction.` };
    }

    // 1. Get current balance
    const { data: driver, error: fetchError } = await supabaseAdmin
      .from('drivers')
      .select('wallet_balance')
      .eq('id', formData.driver_id)
      .single();

    if (fetchError || !driver) {
      console.error('[WALLETS] Driver fetch error:', fetchError);
      return { success: false, error: 'Driver not found. Please try again.' };
    }

    const balanceBefore = driver.wallet_balance || 0;
    const balanceAfter = balanceBefore + formData.amount;

    // 2. Update driver balance
    const { error: updateError } = await supabaseAdmin
      .from('drivers')
      .update({ wallet_balance: balanceAfter })
      .eq('id', formData.driver_id);

    if (updateError) {
      console.error('[WALLETS] Balance update error:', updateError);
      return { success: false, error: 'Failed to update wallet balance. Please try again.' };
    }

    // 3. Log transaction
    const { error: logError } = await supabaseAdmin.from('wallet_transactions').insert([
      {
        driver_id: formData.driver_id,
        type: formData.type,
        amount: formData.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: formData.description,
        created_by: formData.createdBy,
      },
    ]);

    if (logError) {
      console.error('[WALLETS] Transaction log error:', logError);
      // Balance was updated but log failed — non-critical, report as warning
      return { success: true, warning: 'Balance updated but transaction log failed.' };
    }

    revalidatePath('/wallets');
    revalidatePath('/drivers');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('[WALLETS] topUpWallet error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
