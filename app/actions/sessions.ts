'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import type { ChargingMode, UnitType } from '@/lib/types';
import { initiateHubtelCharge as hubtelCharge, checkHubtelStatus } from '@/lib/hubtel';

export async function initiateHubtelPayment(data: {
  sessionId: string;
  amount: number;
  phone: string;
  provider: 'mtn' | 'telecel' | 'airteltigo';
  email: string;
}) {
  try {
    const reference = `HUB-${data.sessionId.substring(0, 8)}-${Date.now()}`;
    
    const result = await hubtelCharge({
      amount: data.amount,
      phone: data.phone,
      provider: data.provider,
      description: `Charging Session Payment - ${data.sessionId}`,
      clientReference: reference,
    });

    console.log('[HUBTEL] Charge result:', result);

    // Hubtel Response Handling
    // Success code is usually '000' or similar in ResponseCode
    if (result.responseCode === '000' || result.status === 'Success' || result.status === 'Pending') {
      return { 
        success: true, 
        status: 'pending', 
        reference, 
        message: result.message || 'Mobile Money prompt initiated' 
      };
    }

    return { success: false, error: result.message || 'Payment initiation failed' };
  } catch (error: any) {
    console.error('[HUBTEL] Server Error:', error);
    return { success: false, error: error.message };
  }
}

export async function verifyHubtelPayment(clientReference: string) {
  try {
    const result = await checkHubtelStatus(clientReference);
    console.log('[HUBTEL] Status Check:', result);
    
    // Hubtel returns a status field like 'Success', 'Failed', 'Pending'
    if (result.status === 'Success' || (result.data && result.data[0]?.status === 'Success')) {
      return { success: true, status: 'success', message: 'Payment confirmed!' };
    }
    
    return { 
      success: false, 
      status: result.status || 'pending', 
      message: result.message || 'Payment still pending or failed' 
    };
  } catch (error: any) {
    console.error('[HUBTEL] Verify Error:', error);
    return { success: false, error: error.message };
  }
}

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

    const receiptNumber = `RCP-${Math.floor(100000 + Math.random() * 900000)}`;

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
    console.error('Error starting session:', error.message);
    return { success: false, error: error.message };
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
    // Fetch session details for the payment record
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('receipt_number, driver_id, driver_name, total_amount')
      .eq('id', data.session_id)
      .single();

    if (!session) throw new Error('Session not found');

    const sessionCost = session.total_amount || 0;
    const excessAmount = Math.max(0, data.amount - sessionCost);

    // 1. Create payment record
    const { error: payError } = await supabaseAdmin.from('payments').insert([{
      session_id: data.session_id,
      receipt_number: session.receipt_number,
      driver_id: session.driver_id,
      amount: data.amount, // Record the actual total paid
      method: data.method,
      reference: data.reference,
      status: 'completed',
      attendant_id: data.attendant_id,
    }]);
    if (payError) throw payError;

    // 2. Update session status
    await supabaseAdmin.from('sessions').update({ 
      status: 'completed',
      payment_method: data.method,
      total_amount: sessionCost // Keep the session cost as the total_amount for the session
    }).eq('id', data.session_id);

    // 3. Update shift totals
    const shiftColumn = 
      data.method === 'cash' ? 'cash_collected' : 
      data.method === 'wallet' ? 'wallet_deductions' : 
      'hubtel_collected'; 

    // 0. Handle Wallet Deduction
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

    revalidatePath('/sessions');
    revalidatePath('/shifts');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Payment processing error:', error);
    return { success: false, error: error.message };
  }
}
export async function updateSessionStatus(id: string, status: string) {
  try {
    const { error } = await supabaseAdmin
      .from('sessions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/sessions');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating session status:', error.message);
    return { success: false, error: error.message };
  }
}

export async function completeSession(id: string, data: {
  units_consumed: number;
  total_amount: number;
}) {
  try {
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
    console.error('Error completing session:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteSession(id: string, adminId: string) {
  try {
    // 1. Verify caller is super_admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (!profile || profile.role !== 'super_admin') {
      throw new Error('Unauthorized: Only Super Admins can delete sessions.');
    }

    // 2. Delete associated payments first (if any)
    await supabaseAdmin.from('payments').delete().eq('session_id', id);
    
    // 3. Delete the session
    const { error } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/sessions');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting session:', error.message);
    return { success: false, error: error.message };
  }
}
