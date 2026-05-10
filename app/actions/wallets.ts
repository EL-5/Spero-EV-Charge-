'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function topUpWallet(formData: {
  driver_id: string;
  amount: number;
  type: 'top_up' | 'bonus' | 'credit';
  description: string;
  createdBy: string;
}) {
  try {
    // 1. Get current balance
    const { data: driver, error: fetchError } = await supabaseAdmin
      .from('drivers')
      .select('wallet_balance')
      .eq('id', formData.driver_id)
      .single();

    if (fetchError) throw fetchError;

    const balanceBefore = driver.wallet_balance || 0;
    const balanceAfter = balanceBefore + formData.amount;

    // 2. Update driver balance
    const { error: updateError } = await supabaseAdmin
      .from('drivers')
      .update({ wallet_balance: balanceAfter })
      .eq('id', formData.driver_id);

    if (updateError) throw updateError;

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

    if (logError) throw logError;

    revalidatePath('/wallets');
    revalidatePath('/drivers');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Error topping up wallet:', error.message);
    return { success: false, error: error.message };
  }
}
