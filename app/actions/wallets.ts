'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth, requireDriverAuth } from '@/lib/auth-guard';

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
}) {
  try {
    // Wallet top-ups are high-trust operations — managers and above only
    const user = await requireAuth(['super_admin', 'manager']);

    // Input validation — prevent negative or zero amounts
    if (formData.amount <= 0) {
      return { success: false, error: 'Top-up amount must be greater than zero.' };
    }

    // Cap single top-up to prevent accidental over-crediting
    const MAX_TOPUP = 10_000; // GHS 10,000 per transaction
    if (formData.amount > MAX_TOPUP) {
      return { success: false, error: `Top-up amount cannot exceed GHS ${MAX_TOPUP.toLocaleString()} per transaction.` };
    }

    // 1 & 2. Atomically read + bound-check + write the new balance (avoids
    // lost updates when two adjustments to the same driver race each other)
    const { data: adjustment, error: adjustError } = await supabaseAdmin
      .rpc('adjust_wallet_balance', {
        p_driver_id: formData.driver_id,
        p_delta: formData.amount,
      })
      .single();

    if (adjustError || !adjustment) {
      console.error('[WALLETS] Balance adjustment error:', adjustError);
      return { success: false, error: 'Failed to update wallet balance. Please try again.' };
    }

    const { balance_before: balanceBefore, balance_after: balanceAfter } = adjustment as {
      balance_before: number;
      balance_after: number;
    };

    // 3. Log transaction
    const { error: logError } = await supabaseAdmin.from('wallet_transactions').insert([
      {
        driver_id: formData.driver_id,
        type: formData.type,
        amount: formData.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: formData.description,
        created_by: user.id,
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

// ─────────────────────────────────────────────────────────────────────────────
// Manual wallet top-up requests (driver-submitted, staff-approved).
// There is no live Hubtel/Paystack integration wired up yet, so a driver
// pays an attendant/manager directly (cash or MoMo) and staff confirm the
// payment really happened before the wallet is credited. The driver-facing
// action below only ever creates a 'pending' record — it never touches
// wallet_balance itself; only approveWalletTopUpRequest (staff-only) does,
// via the atomic adjust_wallet_balance RPC.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOPUP_REQUEST = 10_000; // GHS 10,000 — mirrors the staff top-up cap

export async function requestWalletTopUp(data: {
  amount: number;
  method: 'momo_manual' | 'cash';
  reference?: string;
}) {
  try {
    const driver = await requireDriverAuth();

    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      return { success: false, error: 'Enter a valid top-up amount.' };
    }

    if (data.amount > MAX_TOPUP_REQUEST) {
      return {
        success: false,
        error: `Top-up requests are capped at GHS ${MAX_TOPUP_REQUEST.toLocaleString()}. Contact an attendant for larger amounts.`,
      };
    }

    const { error } = await supabaseAdmin.from('wallet_topup_requests').insert([
      {
        driver_id: driver.id,
        amount: data.amount,
        method: data.method,
        reference: data.reference?.trim() || null,
      },
    ]);

    if (error) {
      console.error('[WALLETS] requestWalletTopUp insert error:', error);
      return { success: false, error: 'Failed to submit top-up request. Please try again.' };
    }

    revalidatePath('/driver/wallet');
    revalidatePath('/wallets');
    return { success: true };
  } catch (error: any) {
    console.error('[WALLETS] requestWalletTopUp error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function getMyWalletTopUpRequests() {
  try {
    const driver = await requireDriverAuth();

    const { data, error } = await supabaseAdmin
      .from('wallet_topup_requests')
      .select('*')
      .eq('driver_id', driver.id)
      .order('requested_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[WALLETS] getMyWalletTopUpRequests error:', error);
      return { success: false, error: 'Failed to load top-up requests.', data: [] as any[] };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] as any[] };
  }
}

export async function getPendingWalletTopUpRequests() {
  try {
    await requireAuth(['super_admin', 'manager']);

    const { data, error } = await supabaseAdmin
      .from('wallet_topup_requests')
      .select('*, drivers(name, phone)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (error) {
      console.error('[WALLETS] getPendingWalletTopUpRequests error:', error);
      return { success: false, error: 'Failed to load pending requests.', data: [] as any[] };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] as any[] };
  }
}

export async function approveWalletTopUpRequest(requestId: string) {
  try {
    const user = await requireAuth(['super_admin', 'manager']);

    const { data: request, error: fetchError } = await supabaseAdmin
      .from('wallet_topup_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return { success: false, error: 'Top-up request not found.' };
    }
    if (request.status !== 'pending') {
      return { success: false, error: `This request has already been ${request.status}.` };
    }

    const { data: adjustment, error: adjustError } = await supabaseAdmin
      .rpc('adjust_wallet_balance', {
        p_driver_id: request.driver_id,
        p_delta: request.amount,
      })
      .single();

    if (adjustError || !adjustment) {
      console.error('[WALLETS] approveWalletTopUpRequest adjust error:', adjustError);
      return { success: false, error: 'Failed to credit wallet. Please try again.' };
    }

    const { balance_before: balanceBefore, balance_after: balanceAfter } = adjustment as {
      balance_before: number;
      balance_after: number;
    };

    await supabaseAdmin.from('wallet_transactions').insert([
      {
        driver_id: request.driver_id,
        type: 'top_up',
        amount: request.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Approved manual top-up (${request.method}${request.reference ? `, ref: ${request.reference}` : ''})`,
        created_by: user.id,
      },
    ]);

    await supabaseAdmin
      .from('wallet_topup_requests')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    revalidatePath('/wallets');
    revalidatePath('/drivers');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('[WALLETS] approveWalletTopUpRequest error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function rejectWalletTopUpRequest(requestId: string, reason?: string) {
  try {
    const user = await requireAuth(['super_admin', 'manager']);

    const { data: request } = await supabaseAdmin
      .from('wallet_topup_requests')
      .select('status')
      .eq('id', requestId)
      .single();

    if (!request) {
      return { success: false, error: 'Top-up request not found.' };
    }
    if (request.status !== 'pending') {
      return { success: false, error: `This request has already been ${request.status}.` };
    }

    await supabaseAdmin
      .from('wallet_topup_requests')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason?.trim() || null,
      })
      .eq('id', requestId);

    revalidatePath('/wallets');
    return { success: true };
  } catch (error: any) {
    console.error('[WALLETS] rejectWalletTopUpRequest error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}
