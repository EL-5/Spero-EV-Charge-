import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import type { AuthenticatedUser } from '@/lib/auth-guard';

/**
 * Writes one row to the write-once audit_logs table.
 *
 * Never throws: a failed audit write must not break the money operation it
 * describes, but it is logged loudly so it is noticed. (The table is created by
 * scripts/migrations/10_gun_session_recording.sql.)
 */
export async function logAudit(args: {
  actor: Pick<AuthenticatedUser, 'id' | 'name' | 'role'>;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const write = async () => {
    try {
      const { error } = await supabaseAdmin.from('audit_logs').insert({
        actor_id: args.actor.id,
        actor_name: args.actor.name,
        actor_role: args.actor.role,
        action: args.action,
        resource_type: args.resourceType,
        resource_id: args.resourceId ?? null,
        metadata: args.metadata ?? {},
      });
      if (error) console.error('[AUDIT] write failed:', args.action, error.message);
    } catch (err) {
      console.error('[AUDIT] write threw:', args.action, err);
    }
  };
  // The write runs after the response has gone out, so the screen does not wait for it.
  // Outside a request (a script, a test) there is no "after", so it is simply awaited.
  try {
    after(write);
  } catch {
    await write();
  }
}
