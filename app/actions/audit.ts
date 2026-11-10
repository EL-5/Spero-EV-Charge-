'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import type { AuditRow } from '@/lib/management-types';

type Fail = { success: false; error: string };

export interface AuditFilter {
  /** Matches the start of the action, e.g. "session." or "day.close" */
  actionPrefix?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD, inclusive
  search?: string;
  before?: string; // created_at of the last row seen, for the next page
}

const PAGE = 100;

/** Read-only view of the write-once audit table. Nobody can edit or delete from here. */
export async function listAuditLogs(filter: AuditFilter = {}): Promise<{ success: true; data: AuditRow[]; hasMore: boolean } | Fail> {
  try {
    await requireAuth(['super_admin', 'manager']);

    let q = supabaseAdmin
      .from('audit_logs')
      .select('id, created_at, actor_name, actor_role, action, resource_type, resource_id, metadata')
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);

    const prefix = (filter.actionPrefix || '').replace(/[%_,()]/g, '');
    if (prefix) q = q.like('action', `${prefix}%`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(filter.from || '')) q = q.gte('created_at', `${filter.from}T00:00:00.000Z`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(filter.to || '')) {
      const end = new Date(`${filter.to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      q = q.lt('created_at', end.toISOString());
    }
    if (filter.before) q = q.lt('created_at', filter.before);
    const search = (filter.search || '').replace(/[%_,()]/g, '').trim();
    if (search) q = q.or(`actor_name.ilike.%${search}%,action.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) {
      console.error('[AUDIT] list error:', error);
      return { success: false, error: 'Could not load the audit log. Has the latest database update been run?' };
    }
    const rows = (data || []) as {
      id: string; created_at: string; actor_name: string | null; actor_role: string | null; action: string;
      resource_type: string | null; resource_id: string | null; metadata: Record<string, unknown> | null;
    }[];
    return {
      success: true,
      hasMore: rows.length > PAGE,
      data: rows.slice(0, PAGE).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        actorName: r.actor_name || 'System',
        actorRole: r.actor_role || '',
        action: r.action,
        resourceType: r.resource_type || '',
        resourceId: r.resource_id || '',
        metadata: r.metadata || {},
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    return { success: false, error: msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : 'Could not load the audit log.' };
  }
}
