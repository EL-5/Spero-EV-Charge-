'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function createUser(formData: {
  name: string;
  email: string;
  phone: string;
  role: string;
  password?: string;
}) {
  const { name, email, phone, role, password } = formData;

  try {
    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || Math.random().toString(36).slice(-12), // Fallback to random if not provided
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (authError) throw authError;

    // 2. Update the profile created by the DB trigger with extra details (phone)
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

    if (profileError) throw profileError;

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('Error creating user:', error.message);
    return { success: false, error: error.message };
  }
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: !currentStatus })
      .eq('id', userId);

    if (error) throw error;

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('Error toggling user status:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateUser(userId: string, data: {
  name: string;
  email: string;
  phone: string;
  role: string;
  password?: string;
}) {
  try {
    // 1. Update Auth data (Email, Password, Metadata)
    const authUpdate: any = {
      email: data.email,
      user_metadata: { name: data.name, role: data.role }
    };

    if (data.password && data.password.trim() !== '') {
      authUpdate.password = data.password;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      authUpdate
    );

    if (authError) throw authError;

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

    if (profileError) throw profileError;

    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating user:', error.message);
    return { success: false, error: error.message };
  }
}
