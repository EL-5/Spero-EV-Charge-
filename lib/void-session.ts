import { supabaseAdmin } from '@/lib/supabase-server';
import { roundMoney } from '@/lib/gun-session';

export type VoidResult =
  | { ok: true; walletRefunded: number; refundDue: number | null }
  | { ok: false; error: string };

/**
 * Voids a session: the record stays, marked cancelled, and the gun is freed.
 *  - Paid from a wallet  → the amount goes back to the wallet, atomically.
 *  - Paid by MoMo        → the amount is recorded as `refund_due`: somebody has to
 *                          send the money back by hand and the manager sees it.
 *  - Not paid yet        → nothing to give back.
 * A session can be voided once.
 */
export async function executeVoid(args: { sessionId: string; reason: string; actorId: string }): Promise<VoidResult> {
  const { data: s, error } = await supabaseAdmin
    .from('sessions')
    .select('id, status, payment_status, payment_method, total_amount, driver_id, shift_id, receipt_number')
    .eq('id', args.sessionId)
    .maybeSingle();
  if (error || !s) return { ok: false, error: 'Session not found.' };
  if (s.status === 'cancelled') return { ok: false, error: 'This session is already voided.' };

  // Claim the void so two managers cannot both refund the same session.
  const { data: claim, error: claimErr } = await supabaseAdmin
    .from('sessions')
    .update({
      status: 'cancelled',
      voided_at: new Date().toISOString(),
      voided_by: args.actorId,
      void_reason: args.reason,
    })
    .eq('id', s.id)
    .neq('status', 'cancelled')
    .select('id')
    .maybeSingle();
  if (claimErr) return { ok: false, error: 'Could not void the session. Please try again.' };
  if (!claim) return { ok: false, error: 'This session is already voided.' };

  const revert = async () => {
    await supabaseAdmin
      .from('sessions')
      .update({ status: s.status, voided_at: null, voided_by: null, void_reason: null })
      .eq('id', s.id);
  };

  let walletRefunded = 0;
  let refundDue: number | null = null;

  if (s.payment_status === 'paid') {
    const amount = roundMoney(Number(s.total_amount || 0));

    if (s.payment_method === 'wallet' && s.driver_id) {
      const { data: adj, error: adjErr } = await supabaseAdmin
        .rpc('adjust_wallet_balance', { p_driver_id: s.driver_id, p_delta: amount })
        .single();
      if (adjErr || !adj) {
        await revert();
        return { ok: false, error: 'Could not return the money to the wallet. Nothing was changed.' };
      }
      const { balance_before, balance_after } = adj as { balance_before: number; balance_after: number };
      await supabaseAdmin.from('wallet_transactions').insert([
        {
          driver_id: s.driver_id,
          type: 'credit',
          amount,
          balance_before,
          balance_after,
          description: `Refund: session ${s.receipt_number} was voided`,
          session_id: s.id,
          created_by: args.actorId,
        },
      ]);
      walletRefunded = amount;
      await supabaseAdmin.from('sessions').update({ payment_status: 'refunded' }).eq('id', s.id);
    } else {
      refundDue = amount;
      await supabaseAdmin.from('sessions').update({ refund_due: amount }).eq('id', s.id);
    }

    if (s.shift_id) {
      const isWallet = s.payment_method === 'wallet';
      const { error: shiftErr } = await supabaseAdmin.rpc('bump_shift_totals', {
        p_shift_id: s.shift_id,
        p_cash: 0,
        p_momo: isWallet ? 0 : -amount,
        p_wallet: isWallet ? -amount : 0,
        p_sessions: -1,
      });
      if (shiftErr) console.error('[VOID] shift totals not adjusted:', shiftErr.message);
    }
  }

  return { ok: true, walletRefunded, refundDue };
}
