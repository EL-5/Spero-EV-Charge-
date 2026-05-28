'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import type { ChargingMode, UnitType } from '@/lib/types';
import { requireAuth } from '@/lib/auth-guard';
import { generateReceiptNumber } from '@/lib/utils';
import { sendOcppCommand } from './chargers';

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Hubtel API integration has been removed.
// All payment methods (Cash, MTN MoMo, Telecel Cash, Tigo Cash, Wallet) are
// recorded directly via processPayment — no external payment gateway calls.
// ─────────────────────────────────────────────────────────────────────────────


export async function startSession(formData: {
  driver_id: string;
  vehicle_id: string;
  mode: ChargingMode;
  unit_type: UnitType;
  prepaid_amount?: number;
  rate_at_time: number;
  attendant_id: string;
  shift_id?: string;
  pricing_id?: string;
}) {
  try {
    await requireAuth(['super_admin', 'manager', 'attendant']);
    const [driverRes, vehicleRes] = await Promise.all([
      supabaseAdmin.from('drivers').select('name').eq('id', formData.driver_id).single(),
      supabaseAdmin.from('vehicles').select('plate_number, brand, model').eq('id', formData.vehicle_id).single(),
    ]);

    // Fetch the specific rate if pricing_id is provided, otherwise fallback to the most recent active rate for the unit type
    let rateData = null;
    if (formData.pricing_id) {
      const { data } = await supabaseAdmin
        .from('pricing')
        .select('rate, unit_quantity')
        .eq('id', formData.pricing_id)
        .single();
      rateData = data;
    }

    if (!rateData) {
      const { data } = await supabaseAdmin
        .from('pricing')
        .select('rate, unit_quantity')
        .eq('unit_type', formData.unit_type)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      rateData = data;
    }

    if (!rateData) throw new Error(`No active rate found for ${formData.unit_type}. Please configure pricing in Settings.`);
    
    // Calculate the actual rate per 1 unit if quantity > 1
    const actualRate = Number(rateData.rate) / Number(rateData.unit_quantity || 1);

    const receiptNumber = generateReceiptNumber();

    const { error } = await supabaseAdmin.from('sessions').insert([
      {
        receipt_number: receiptNumber,
        driver_id: formData.driver_id,
        vehicle_id: formData.vehicle_id,
        shift_id: formData.shift_id,
        pricing_id: formData.pricing_id, // Store the tier used
        driver_name: driverRes.data?.name || 'Unknown',
        vehicle_plate: vehicleRes.data?.plate_number || 'Unknown',
        vehicle_details: `${vehicleRes.data?.brand} ${vehicleRes.data?.model}`,
        mode: formData.mode,
        unit_type: formData.unit_type,
        status: 'active',
        rate_at_time: actualRate,
        prepaid_amount: formData.prepaid_amount || 0,
        attendant_id: formData.attendant_id,
        start_time: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('[SESSIONS] startSession error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to start session. Please try again.' };
  }
}

export async function processPayment(data: {
  session_id: string;
  shift_id: string;
  amount: number; // The total amount handed over by the driver
  method: string;
  reference?: string;
  attendant_id: string;
}) {
  try {
    const authUser = await requireAuth(['super_admin', 'manager', 'attendant']);
    const attendantId = data.attendant_id === 'system' ? authUser.id : data.attendant_id;

    // Fetch session details for the payment record
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('receipt_number, driver_id, driver_name, total_amount, charger_id, connector_number, mode, chargers(charge_point_id)')
      .eq('id', data.session_id)
      .single();

    if (!session) throw new Error('Session not found');

    const sessionCost = session.total_amount || 0;
    const excessAmount = Math.max(0, data.amount - sessionCost);

    // 0. Handle Wallet Deduction for registered drivers using wallet
    if (data.method === 'wallet' && session.driver_id) {
      const { data: driver } = await supabaseAdmin.from('drivers').select('wallet_balance').eq('id', session.driver_id).single();
      const currentBalance = driver?.wallet_balance || 0;
      
      if (currentBalance < data.amount) {
        throw new Error(`Insufficient wallet balance. Available: GHS ${currentBalance.toFixed(2)}`);
      }

      const newBalance = currentBalance - data.amount;
      await supabaseAdmin.from('drivers').update({ wallet_balance: newBalance }).eq('id', session.driver_id);

      // Record transaction
      await supabaseAdmin.from('wallet_transactions').insert([{
        driver_id: session.driver_id,
        type: 'debit',
        amount: data.amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        description: `Payment for Session ${session.receipt_number}`,
      }]);
    }

    // 1. Create payment record
    const { error: payError } = await supabaseAdmin.from('payments').insert([{
      session_id: data.session_id,
      receipt_number: session.receipt_number,
      driver_id: session.driver_id,
      amount: data.amount, // Record the actual total paid
      method: data.method,
      reference: data.reference,
      status: 'completed',
      attendant_id: attendantId,
    }]);
    if (payError) throw payError;

    // 2. Update session status
    let nextStatus = 'completed';
    // If it's a prepaid session that was just paid for, it should transition to active to allow charging
    if (session.mode === 'prepaid') {
      nextStatus = 'active';
    }

    await supabaseAdmin.from('sessions').update({ 
      status: nextStatus,
      payment_status: 'paid',
      payment_method: data.method,
      total_amount: sessionCost // Keep the session cost as the total_amount for the session
    }).eq('id', data.session_id);

    // 3. Update shift totals
    if (data.shift_id) {
      const shiftColumn = 
        data.method === 'cash' ? 'cash_collected' : 
        data.method === 'wallet' ? 'wallet_deductions' : 
        'hubtel_collected'; 

      const { data: shift, error: fetchShiftError } = await supabaseAdmin
        .from('shifts')
        .select('cash_collected, hubtel_collected, paystack_collected, wallet_deductions, total_sessions')
        .eq('id', data.shift_id)
        .single();

      if (fetchShiftError) throw new Error('Could not find active shift to update totals');

      if (shift) {
        const s = shift as any;
        const { error: shiftUpdateError } = await supabaseAdmin.from('shifts').update({
          [shiftColumn]: (s[shiftColumn] || 0) + data.amount,
          total_sessions: (s.total_sessions || 0) + 1
        }).eq('id', data.shift_id);

        if (shiftUpdateError) throw shiftUpdateError;
      }
    }

    // 4. Handle Excess Payment (Credit to Wallet)
    if (excessAmount > 0 && session.driver_id) {
      const { data: driver } = await supabaseAdmin.from('drivers').select('wallet_balance').eq('id', session.driver_id).single();
      const currentBalance = driver?.wallet_balance || 0;
      const newBalance = currentBalance + excessAmount;

      await supabaseAdmin.from('drivers').update({ wallet_balance: newBalance }).eq('id', session.driver_id);

      // Record transaction
      await supabaseAdmin.from('wallet_transactions').insert([{
        driver_id: session.driver_id,
        type: 'credit',
        amount: excessAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        description: `Overpayment for Session ${session.receipt_number}`,
      }]);
    }

    // 5. Trigger RemoteStartTransaction if a charger is mapped to this session
    // (This replaces the physical RFID authorization flow)
    if (session.charger_id && (session.chargers as any)?.charge_point_id) {
      const chargePointId = (session.chargers as any).charge_point_id;
      const connectorId = session.connector_number || 1;
      const idTag = session.receipt_number;

      console.log(`[SESSIONS] Session Paid. Triggering RemoteStartTransaction for ${chargePointId} (Connector ${connectorId}) with idTag ${idTag}`);
      
      await sendOcppCommand({
        chargePointId: chargePointId,
        command: 'RemoteStartTransaction',
        payload: {
          connectorId: connectorId,
          idTag: idTag
        }
      });
    }

    revalidatePath('/sessions');
    revalidatePath('/shifts');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('[SESSIONS] processPayment error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden') || error.message?.startsWith('Insufficient')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Payment processing failed. Please try again.' };
  }
}
export async function updateSessionStatus(id: string, status: string) {
  try {
    await requireAuth(['super_admin', 'manager', 'attendant']);

    const VALID_STATUSES = ['active', 'pending_payment', 'completed', 'cancelled'];
    if (!VALID_STATUSES.includes(status)) {
      return { success: false, error: `Invalid session status: ${status}` };
    }

    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/sessions');
    return { success: true };
  } catch (error: any) {
    console.error('[SESSIONS] updateSessionStatus error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden') || error.message?.startsWith('Invalid')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update session status. Please try again.' };
  }
}

export async function completeSession(id: string, data: {
  units_consumed: number;
  total_amount: number;
}) {
  try {
    await requireAuth(['super_admin', 'manager', 'attendant']);

    // 1. Fetch current session details to check payment status
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('payment_status, prepaid_amount, rate_at_time, driver_id, receipt_number, attendant_id')
      .eq('id', id)
      .single();

    if (session && session.payment_status === 'paid') {
      // If it's a prepaid session that has been paid, delegate directly to the refund stop flow
      return await stopSessionWithRefund(id, data.units_consumed);
    }

    const { error } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'pending_payment',
        units_consumed: data.units_consumed,
        total_amount: data.total_amount,
        end_time: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/sessions');
    return { success: true };
  } catch (error: any) {
    console.error('[SESSIONS] completeSession error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to complete session. Please try again.' };
  }
}

export async function deleteSession(id: string) {
  try {
    // Derive identity from the server-verified token — client-supplied IDs cannot be trusted
    await requireAuth(['super_admin']);

    // 1. Delete associated payments first (if any)
    await supabaseAdmin.from('payments').delete().eq('session_id', id);
    
    // 2. Delete the session
    const { error } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('[SESSIONS] deleteSession error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden') || error.message?.startsWith('Unauthorized')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to delete session. Please try again.' };
  }
}

export async function initiatePrepaidSession(data: {
  driver_id?: string;
  vehicle_id?: string;
  charger_id?: string;
  connector_number?: number;
  mode: 'charge_to_full' | 'fixed_budget';
  start_soc?: number;
  budget_amount?: number;
  attendant_id?: string;
  shift_id?: string;
  is_guest?: boolean;
  guest_name?: string;
  guest_phone?: string;
  guest_plate?: string;
}) {
  try {
    const authUser = await requireAuth(['super_admin', 'manager', 'attendant']);
    const isAttendantMode = !!data.attendant_id;

    let driverName = data.guest_name || 'Guest Driver';
    let vehiclePlate = data.guest_plate || 'Unknown Plate';
    let vehicleDetails = 'Guest Vehicle';
    let batteryCapacity = 40.0; // Default fallback for guests
    let walletBalance = 0;

    // Fetch vehicle capacity & driver details if registered
    if (!data.is_guest && data.driver_id && data.vehicle_id) {
      const [driverRes, vehicleRes] = await Promise.all([
        supabaseAdmin.from('drivers').select('name, wallet_balance').eq('id', data.driver_id).single(),
        supabaseAdmin.from('vehicles').select('plate_number, brand, model, battery_capacity').eq('id', data.vehicle_id).single(),
      ]);

      if (vehicleRes.error) throw new Error('Vehicle not found');

      driverName = driverRes.data?.name || 'Unknown';
      walletBalance = Number(driverRes.data?.wallet_balance || 0);
      vehiclePlate = vehicleRes.data?.plate_number || 'Unknown';
      vehicleDetails = `${vehicleRes.data?.brand} ${vehicleRes.data?.model}`;
      batteryCapacity = Number(vehicleRes.data?.battery_capacity || 40.0);
    }
    
    // Fetch active pricing rate for kWh
    const { data: rateData } = await supabaseAdmin
      .from('pricing')
      .select('rate, unit_quantity')
      .eq('unit_type', 'kwh')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!rateData) throw new Error('No active kWh pricing configured. Please set pricing in settings.');

    const ratePerKwh = Number(rateData.rate) / Number(rateData.unit_quantity || 1);

    let targetUnits = 0;
    let prepaidAmount = 0;

    if (data.mode === 'charge_to_full') {
      const currentSoc = data.start_soc ?? 20;
      const percentNeeded = 100 - currentSoc;
      const fullChargeUnits = batteryCapacity * (percentNeeded / 100);
      const fullChargeCost = fullChargeUnits * ratePerKwh;

      // Dynamic Wallet Budgeting
      // If a registered driver doesn't have enough wallet balance for a full charge,
      // cap the charge to whatever they currently have in their wallet.
      if (!data.is_guest && walletBalance < fullChargeCost) {
        prepaidAmount = walletBalance;
        targetUnits = walletBalance / ratePerKwh;
      } else {
        prepaidAmount = fullChargeCost;
        targetUnits = fullChargeUnits;
      }
    } else {
      prepaidAmount = data.budget_amount ?? 50.0;
      targetUnits = prepaidAmount / ratePerKwh;
    }

    const receiptNumber = generateReceiptNumber();

    const insertData: any = {
      receipt_number: receiptNumber,
      driver_id: data.is_guest ? null : data.driver_id,
      vehicle_id: data.is_guest ? null : data.vehicle_id,
      charger_id: data.charger_id || null,
      connector_number: data.connector_number || null,
      driver_name: driverName,
      vehicle_plate: vehiclePlate,
      vehicle_details: vehicleDetails,
      mode: 'prepaid',
      unit_type: 'kwh',
      status: 'pending_payment',
      payment_status: 'unpaid',
      rate_at_time: ratePerKwh,
      total_amount: prepaidAmount, // this tracks the exact cost they committed to
      prepaid_amount: prepaidAmount,
      target_units: targetUnits,
      start_time: new Date().toISOString(),
      start_battery_percentage: data.mode === 'charge_to_full' ? data.start_soc : null,
      target_percentage: data.mode === 'charge_to_full' ? 100 : null,
    };

    if (isAttendantMode) {
      insertData.attendant_id = data.attendant_id;
      insertData.shift_id = data.shift_id || null;
    } else {
      // Driver self charging — associate with driver's system login ID
      insertData.attendant_id = authUser.id;
    }

    const { data: newSession, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert([insertData])
      .select()
      .single();

    if (insertError) throw insertError;

    revalidatePath('/sessions');
    return { success: true, session: newSession };
  } catch (error: any) {
    console.error('[SESSIONS] initiatePrepaidSession error:', error);
    return { success: false, error: error.message || 'Failed to initiate prepayment' };
  }
}

export async function stopSessionWithRefund(sessionId: string, actualUnitsConsumed: number) {
  try {
    await requireAuth(['super_admin', 'manager', 'attendant']);

    // 1. Fetch current session details
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) throw new Error('Session not found');

    if (session.status === 'completed') {
      return { success: true, refundAmount: 0 };
    }

    const prepaidAmount = Number(session.prepaid_amount || 0);
    const rateAtTime = Number(session.rate_at_time || 0);
    const actualCost = actualUnitsConsumed * rateAtTime;
    const refundAmount = prepaidAmount - actualCost;

    console.log(`[REFUND] Session: ${session.receipt_number}. Paid: GHS ${prepaidAmount}. Consumed: ${actualUnitsConsumed} kWh. Cost: GHS ${actualCost}. Refund: GHS ${refundAmount}`);

    const updatePayload: any = {
      status: 'completed',
      units_consumed: actualUnitsConsumed,
      total_amount: actualCost,
      end_time: new Date().toISOString(),
    };

    // If there is an unused balance to refund
    if (session.payment_status === 'paid' && refundAmount > 0.01 && session.driver_id) {
      // 1. Fetch current driver wallet balance
      const { data: driver } = await supabaseAdmin
        .from('drivers')
        .select('wallet_balance')
        .eq('id', session.driver_id)
        .single();

      if (driver) {
        const currentBalance = Number(driver.wallet_balance || 0);
        const newBalance = currentBalance + refundAmount;

        // 2. Perform the credit update
        const { error: walletUpdateError } = await supabaseAdmin
          .from('drivers')
          .update({ wallet_balance: newBalance })
          .eq('id', session.driver_id);

        if (walletUpdateError) {
          console.error('[REFUND] Failed to update wallet:', walletUpdateError);
        } else {
          // 3. Log wallet transaction
          await supabaseAdmin.from('wallet_transactions').insert([{
            driver_id: session.driver_id,
            type: 'credit',
            amount: refundAmount,
            balance_before: currentBalance,
            balance_after: newBalance,
            description: `Refund of unused charging balance from Session ${session.receipt_number}`,
            session_id: session.id,
            created_by: session.attendant_id,
          }]);
          
          updatePayload.payment_status = 'refunded';
        }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update(updatePayload)
      .eq('id', sessionId);

    if (updateError) throw updateError;

    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true, refundAmount: Math.max(0, refundAmount) };
  } catch (error: any) {
    console.error('[SESSIONS] stopSessionWithRefund error:', error);
    return { success: false, error: error.message || 'Failed to complete session with refund' };
  }
}
