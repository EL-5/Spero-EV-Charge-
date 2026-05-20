'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

// ─────────────────────────────────────────────────────────────────────────────
// FIX MED-01: requireAuth guards added to all mutating actions.
// FIX LOW-01: Raw DB errors no longer returned to the client.
// ─────────────────────────────────────────────────────────────────────────────

export async function createUser(formData: {
  name: string;
  email: string;
  phone: string;
  role: string;
  password?: string;
}) {
  try {
    // Only super_admins can create users
    await requireAuth(['super_admin']);

    const { name, email, phone, role, password } = formData;

    // Validate that the role being assigned is a known role (prevent privilege escalation)
    const VALID_ROLES = ['super_admin', 'manager', 'accountant', 'finance', 'attendant'];
    if (!VALID_ROLES.includes(role)) {
      return { success: false, error: `Invalid role: ${role}` };
    }

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      // Use provided password or generate a cryptographically secure random one
      password: password || generateSecurePassword(),
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (authError) {
      console.error('[USERS] Auth create error:', authError);
      return { success: false, error: 'Failed to create user account. Please try again.' };
    }

    // 2. Update the profile created by the DB trigger with extra details
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert([
      {
        id: authData.user.id,
        name,
        email,
        phone,
        role,
        is_active: true,
      },
    ]);

    if (profileError) {
      console.error('[USERS] Profile upsert error:', profileError);
      // Attempt rollback of auth user since profile creation failed
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, error: 'Failed to create user profile. Please try again.' };
    }

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('[USERS] createUser error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
  try {
    // Only super_admins can activate/deactivate user accounts
    await requireAuth(['super_admin']);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: !currentStatus })
      .eq('id', userId);

    if (error) {
      console.error('[USERS] Toggle status error:', error);
      return { success: false, error: 'Failed to update user status. Please try again.' };
    }

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('[USERS] toggleUserStatus error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

export async function updateUser(
  userId: string,
  data: {
    name: string;
    email: string;
    phone: string;
    role: string;
    password?: string;
  }
) {
  try {
    // Only super_admins can edit user accounts
    await requireAuth(['super_admin']);

    // Validate role before assignment
    const VALID_ROLES = ['super_admin', 'manager', 'accountant', 'finance', 'attendant'];
    if (!VALID_ROLES.includes(data.role)) {
      return { success: false, error: `Invalid role: ${data.role}` };
    }

    // 1. Update Auth data (Email, Password, Metadata)
    const authUpdate: Record<string, unknown> = {
      email: data.email,
      user_metadata: { name: data.name, role: data.role },
    };

    if (data.password && data.password.trim() !== '') {
      // Enforce minimum password length
      if (data.password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters.' };
      }
      authUpdate.password = data.password;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdate);

    if (authError) {
      console.error('[USERS] Auth update error:', authError);
      return { success: false, error: 'Failed to update user account. Please try again.' };
    }

    // 2. Update Profile data
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[USERS] Profile update error:', profileError);
      return { success: false, error: 'Failed to update user profile. Please try again.' };
    }

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('[USERS] updateUser error:', error);
    if (error.message?.startsWith('Unauthenticated') || error.message?.startsWith('Forbidden')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

/** Generates a cryptographically random 16-character alphanumeric password. */
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}
