'use server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';

/**
 * Internal-only helper — intentionally NOT exported as a Server Action.
 * Exporting this would allow any browser caller to inject notifications for
 * any user_id without authentication. Only call from within other guarded actions.
 */
export async function createNotification(payload: {
  user_id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}) {
  // NOTE: no requireAuth here — callers (debts.ts etc.) are themselves guarded.
  // This is an internal DB write helper, not a public surface.
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
    console.error('[NOTIFICATIONS] createNotification error:', err);
    return { success: false, error: 'Failed to create notification.' };
  }
}

export async function markAsRead(id: string) {
  try {
    const user = await requireAuth();

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function markAllRead() {
  try {
    const user = await requireAuth();

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);

    if (error) throw error;
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
