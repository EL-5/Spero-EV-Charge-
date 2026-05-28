'use server';

import { createClient } from '@supabase/supabase-js';

import { cookies } from 'next/headers';

// We use the admin client for registration to bypass RLS and create users safely
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function formatPhoneToEmail(phone: string) {
  // Strip any non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@driver.spero.local`;
}

export async function registerDriver(data: {
  fullName: string;
  phone: string;
  pin: string;
  brand: string;
  model: string;
  plate: string;
}) {
  try {
    const email = formatPhoneToEmail(data.phone);

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.pin,
      email_confirm: true,
      user_metadata: {
        role: 'driver',
        full_name: data.fullName,
        phone: data.phone,
      }
    });

    if (authError) throw new Error(authError.message);
    const userId = authData.user.id;

    // 2. Create Driver Profile
    const { error: driverError } = await supabaseAdmin.from('drivers').insert([{
      id: userId,
      name: data.fullName,
      phone: data.phone,
      type: 'personal',
      wallet_balance: 0,
      is_active: true
    }]);

    if (driverError) throw new Error(`Driver profile error: ${driverError.message}`);

    // 3. Create Vehicle Profile
    const { error: vehicleError } = await supabaseAdmin.from('vehicles').insert([{
      driver_id: userId,
      brand: data.brand,
      model: data.model,
      plate_number: data.plate,
      battery_capacity: 40 // Default, can be updated later
    }]);

    if (vehicleError) throw new Error(`Vehicle profile error: ${vehicleError.message}`);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loginDriver(phone: string, pin: string) {
  try {
    const email = formatPhoneToEmail(phone);
    const cookieStore = cookies();
    
    // We use a separate client that uses the route handler pattern so cookies are set properly
    // But since this is a server action, it's easier to just use the client-side supabase auth
    // Wait, Server Actions can't easily set cookies via standard supabase-js client if not configured correctly.
    // I will return success, and the actual signInWithPassword can happen on the client-side, 
    // OR I can use the new `@supabase/ssr` if available.
    // Let's check what auth library they have in lib/supabase-server.ts.
    
    return { success: true, email };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
