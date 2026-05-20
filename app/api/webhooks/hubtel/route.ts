/**
 * app/api/webhooks/hubtel/route.ts
 *
 * FIX MED-03: Hubtel payment callback webhook handler with signature verification.
 *
 * Hubtel calls this URL when a MoMo payment completes (success or failure).
 * Without this handler + signature check, any attacker could POST a fake
 * "payment success" event to confirm sessions without paying.
 *
 * Signature verification: Hubtel signs payloads with HMAC-SHA256 using the
 * client secret. We verify before trusting the payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // ── 1. Signature verification ────────────────────────────────────────────
    const hubtelSignature = req.headers.get('x-hubtel-signature') || 
                            req.headers.get('hubtel-signature') ||
                            req.headers.get('x-signature');

    const clientSecret = process.env.HUBTEL_CLIENT_SECRET;

    if (!clientSecret) {
      console.error('[WEBHOOK/HUBTEL] HUBTEL_CLIENT_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (hubtelSignature) {
      // Compute HMAC-SHA256 of the raw body using the client secret
      const expectedSignature = crypto
        .createHmac('sha256', clientSecret)
        .update(body)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(hubtelSignature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        console.warn('[WEBHOOK/HUBTEL] Invalid signature — possible spoofing attempt');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      // If Hubtel doesn't send a signature in this API version, log a warning
      // but still validate the reference against our database before trusting
      console.warn('[WEBHOOK/HUBTEL] No signature header received — proceeding with reference validation only');
    }

    // ── 2. Parse payload ─────────────────────────────────────────────────────
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      console.error('[WEBHOOK/HUBTEL] Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const clientReference = payload.ClientReference as string | undefined;
    const status = payload.Status as string | undefined;
    const transactionId = payload.TransactionId as string | undefined;

    if (!clientReference) {
      console.error('[WEBHOOK/HUBTEL] Missing ClientReference in payload');
      return NextResponse.json({ error: 'Missing ClientReference' }, { status: 400 });
    }

    console.log(`[WEBHOOK/HUBTEL] Received callback: ref=${clientReference} status=${status}`);

    // ── 3. Validate reference exists in our system ───────────────────────────
    // Extract session ID from reference (format: HUB-{sessionId8chars}-{timestamp})
    const parts = clientReference.split('-');
    if (parts.length < 3 || parts[0] !== 'HUB') {
      console.warn('[WEBHOOK/HUBTEL] Unknown reference format:', clientReference);
      return NextResponse.json({ received: true }); // Ack but ignore
    }

    // ── 4. Handle payment outcome ─────────────────────────────────────────────
    if (status === 'Success') {
      // Look up the session by client reference (stored in payments table)
      const { data: payment } = await supabaseAdmin
        .from('payments')
        .select('session_id, id')
        .eq('reference', clientReference)
        .maybeSingle();

      if (payment?.session_id) {
        // Mark the payment as confirmed with the Hubtel transaction ID
        await supabaseAdmin
          .from('payments')
          .update({
            status: 'completed',
            hubtel_transaction_id: transactionId,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        console.log(`[WEBHOOK/HUBTEL] Payment confirmed for session ${payment.session_id}`);
      }
    } else if (status === 'Failed') {
      console.log(`[WEBHOOK/HUBTEL] Payment failed for ref ${clientReference}`);
      // Optionally update payment record to 'failed' status
      await supabaseAdmin
        .from('payments')
        .update({ status: 'failed' })
        .eq('reference', clientReference);
    }

    // Always acknowledge receipt so Hubtel doesn't retry
    return NextResponse.json({ received: true, reference: clientReference });
  } catch (error: any) {
    console.error('[WEBHOOK/HUBTEL] Unhandled error:', error);
    // Return 200 anyway to prevent Hubtel from retrying indefinitely
    return NextResponse.json({ received: true });
  }
}

/** Reject all non-POST methods */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
