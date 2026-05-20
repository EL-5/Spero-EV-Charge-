'use server';

import { supabaseAdmin, getServerSupabase } from '@/lib/supabase-server';

// ─────────────────────────────────────────────────────────────────────────────
// FIX HIGH-02: resetSystem now derives identity from the real server session
// instead of trusting a caller-supplied userId parameter.
//
// FIX MED-01: Role check now uses supabaseAdmin (bypasses RLS) to prevent a
// misconfigured RLS policy from allowing privilege escalation.
//
// FIX LOW-01: Raw error messages are no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function resetSystem() {
  try {
    // 1. Derive identity from the real Supabase session — cannot be spoofed
    const supabase = await getServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Unauthenticated: You must be signed in.' };
    }

    // 2. Verify role using admin client (bypasses RLS — authoritative check)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: 'Unauthorized: User profile not found.' };
    }

    if (profile.role !== 'super_admin') {
      return { success: false, error: 'Unauthorized: Only Super Admins can reset the system.' };
    }

    // 3. Perform bulk deletions using the admin client (bypasses RLS)
    // Order respects foreign key dependencies

    await supabaseAdmin.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('wallet_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('charging_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseAdmin.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Audit log — record the reset with actor identity server-side
    console.log(
      `[AUDIT] System reset triggered by ${profile.name} (${user.id}) at ${new Date().toISOString()}`
    );

    // 5. Write audit record to database
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      actor_name: profile.name,
      action: 'system.reset',
      resource_type: 'system',
      metadata: { timestamp: new Date().toISOString() },
    }).maybeSingle(); // maybeSingle so it doesn't throw if audit_logs table doesn't exist yet

    return { success: true };
  } catch (err: any) {
    // LOW-01: Log full details server-side, return generic message to client
    console.error('[SYSTEM_RESET] Unexpected error:', err);
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}
