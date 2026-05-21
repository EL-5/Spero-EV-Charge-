import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[HUBTEL-WEBHOOK] Received payload:', body);

    // Support both Hubtel's official payload structure and a simplified simulator payload structure
    let clientReference = '';
    let isSuccess = false;
    let amount = 0;
    let transactionId = '';

    if (body.ResponseCode !== undefined && body.Data) {
      // Official Hubtel structure
      clientReference = body.Data.ClientReference || '';
      isSuccess = body.ResponseCode === '0000' || String(body.Data.Status).toLowerCase() === 'success';
      amount = Number(body.Data.Amount || 0);
      transactionId = body.Data.TransactionId || '';
    } else {
      // Simplified simulator structure
      clientReference = body.clientReference || '';
      isSuccess = String(body.status).toLowerCase() === 'success';
      amount = Number(body.amount || 0);
      transactionId = body.transactionId || `SIM-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    if (!clientReference) {
      return NextResponse.json({ success: false, error: 'Missing ClientReference/clientReference' }, { status: 400 });
    }

    if (!isSuccess) {
      console.warn(`[HUBTEL-WEBHOOK] Transaction failed for Reference: ${clientReference}`);
      return NextResponse.json({ success: true, message: 'Transaction failure logged' });
    }

    // 1. Fetch the corresponding session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, driver_id, attendant_id, shift_id, prepaid_amount, receipt_number, payment_status')
      .eq('receipt_number', clientReference)
      .maybeSingle();

    if (sessionError) {
      console.error('[HUBTEL-WEBHOOK] Fetch session error:', sessionError);
      return NextResponse.json({ success: false, error: 'Database error fetching session' }, { status: 500 });
    }

    if (!session) {
      console.warn(`[HUBTEL-WEBHOOK] Session not found for Reference: ${clientReference}`);
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    if (session.payment_status === 'paid') {
      console.log(`[HUBTEL-WEBHOOK] Session ${clientReference} is already paid. Skipping double execution.`);
      return NextResponse.json({ success: true, message: 'Session already marked paid' });
    }

    // 2. Perform database updates in a sequential flow
    // A. Update session payment_status to 'paid' and ensure total_amount reflects the prepaid cost
    const { error: sessionUpdateError } = await supabaseAdmin
      .from('sessions')
      .update({
        payment_status: 'paid',
        total_amount: session.prepaid_amount || amount
      })
      .eq('id', session.id);

    if (sessionUpdateError) {
      console.error('[HUBTEL-WEBHOOK] Session update error:', sessionUpdateError);
      throw sessionUpdateError;
    }

    // B. Insert transaction record into payments table
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert([{
        session_id: session.id,
        receipt_number: session.receipt_number,
        driver_id: session.driver_id,
        amount: amount,
        method: 'hubtel',
        reference: transactionId,
        status: 'completed',
        attendant_id: session.attendant_id
      }]);

    if (paymentError) {
      console.error('[HUBTEL-WEBHOOK] Payment insert error:', paymentError);
      throw paymentError;
    }

    // C. Update shift metrics if shift is active
    if (session.shift_id) {
      const { data: shift } = await supabaseAdmin
        .from('shifts')
        .select('hubtel_collected, total_sessions')
        .eq('id', session.shift_id)
        .maybeSingle();

      if (shift) {
        await supabaseAdmin
          .from('shifts')
          .update({
            hubtel_collected: Number(shift.hubtel_collected || 0) + amount
          })
          .eq('id', session.shift_id);
      }
    }

    // D. Log transaction to OCPP logs as audit entry
    await supabaseAdmin
      .from('ocpp_logs')
      .insert([{
        direction: 'IN',
        message_type: 'HubtelPaymentCallback',
        payload: {
          clientReference,
          transactionId,
          amount,
          status: 'success'
        }
      }]);

    console.log(`[HUBTEL-WEBHOOK] Prepayment successfully validated & unlocked for: ${clientReference}`);
    return NextResponse.json({ success: true, message: 'Payment recorded, session unlocked' });

  } catch (error: any) {
    console.error('[HUBTEL-WEBHOOK] Webhook handler crashed:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
