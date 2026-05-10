'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export async function createNotification(payload: {
  user_id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: payload.user_id,
        title: payload.title,
        message: payload.message,
        type: payload.type || 'info',
      });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Failed to create notification:', err);
    return { success: false, error: err.message };
  }
}

export async function markAsRead(id: string) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function markAllRead(userId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (error) throw error;
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
