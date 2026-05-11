'use server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Service role client for bypass RLS and perform bulk deletes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function resetSystem(userId: string) {
  try {
    // 1. Verify user is super_admin
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'super_admin') {
      return { success: false, error: 'Unauthorized: Only super admins can reset the system.' };
    }

    // 2. Perform bulk deletions using the admin client (bypass RLS)
    // Order matters to handle foreign keys if they exist (though we mostly use soft relations or cascade)
    
    // Clear notifications
    await supabaseAdmin.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear payments
    await supabaseAdmin.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear wallet transactions
    await supabaseAdmin.from('wallet_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear charging sessions
    await supabaseAdmin.from('charging_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear vehicles
    await supabaseAdmin.from('vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear drivers
    await supabaseAdmin.from('drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Clear shifts (close any active ones first then delete)
    await supabaseAdmin.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Log the reset action
    console.log(`System reset triggered by user ${userId} at ${new Date().toISOString()}`);

    return { success: true };
  } catch (err: any) {
    console.error('System reset error:', err);
    return { success: false, error: err.message || 'Failed to reset system.' };
  }
}
