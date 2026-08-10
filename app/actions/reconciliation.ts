'use server';

import { supabaseAdmin } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-guard';
import { ReconciliationAnalysisResult, FileDataPayload, generateSimpleAnalysis } from '@/lib/analysis';

export interface MultiDocReportPayload {
  periodStart: string;
  periodEnd: string;
  smartMeter?: { fileName: string; totalKwh: number; dailyRows?: Array<{ day: string; dateStr?: string; kwh: number }> };
  notebook?: { fileName: string; totalKwh: number; totalSessions?: number; dailyRows?: Array<{ day: string; dateStr?: string; kwh: number }> };
  hubtel?: { fileName: string; totalAmount: number; totalCount?: number };
  notes?: string;
}

export async function addReconciliation(formData: {
  period_start: string;
  period_end: string;
  meter_kwh: number;
  notes?: string;
}) {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'finance']);

    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('units_consumed')
      .eq('unit_type', 'kwh')
      .gte('created_at', formData.period_start)
      .lte('created_at', formData.period_end);

    if (sessionsError) throw sessionsError;

    const appKwh = (sessions || []).reduce((sum, s) => sum + (Number(s.units_consumed) || 0), 0);

    const { error: insertError } = await supabaseAdmin
      .from('energy_reconciliation')
      .insert([
        {
          period_start: formData.period_start,
          period_end: formData.period_end,
          meter_kwh: formData.meter_kwh,
          app_kwh: appKwh,
          notes: formData.notes,
          created_by: user.id,
        }
      ]);

    if (insertError) throw insertError;

    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[RECONCILIATION] error:', error);
    return { success: false, error: error.message || 'Failed to add reconciliation record.' };
  }
}

/**
 * Processes multi-document uploads (Smart Meter Log, Attendant Notebook Log, Hubtel Export),
 * cross-reconciles against live app database sessions & payments, and stores a simple analysis in history.
 */
export async function saveMultiDocumentReconciliationReport(payload: MultiDocReportPayload) {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'finance']);

    if (!payload.smartMeter && !payload.notebook && !payload.hubtel) {
      return { success: false, error: 'At least one document (Smart Meter, Notebook, or Hubtel Export) must be uploaded.' };
    }

    // 1. Fetch live DB sessions for the date range
    const { data: dbSessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, units_consumed, total_amount, created_at')
      .gte('created_at', payload.periodStart)
      .lte('created_at', payload.periodEnd);

    if (sessionsError) throw sessionsError;

    const totalAppKwh = (dbSessions || []).reduce((sum, s) => sum + (Number(s.units_consumed) || 0), 0);
    const totalAppRevenue = (dbSessions || []).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    // 2. Fetch live DB payments for Hubtel comparison
    const { data: dbPayments, error: paymentsError } = await supabaseAdmin
      .from('payments')
      .select('amount, method, status, created_at')
      .gte('created_at', payload.periodStart)
      .lte('created_at', payload.periodEnd);

    if (paymentsError) throw paymentsError;

    const dbHubtelCollected = (dbPayments || [])
      .filter(p => p.status === 'success' && (p.method === 'mtn' || p.method === 'telecel' || p.method === 'airteltigo'))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // 3. Format file payloads
    const smartMeterPayload: FileDataPayload | undefined = payload.smartMeter ? {
      fileName: payload.smartMeter.fileName,
      totalKwh: payload.smartMeter.totalKwh,
      dailyRows: payload.smartMeter.dailyRows?.map(r => ({ date: r.dateStr || r.day, kwh: r.kwh })),
    } : undefined;

    const notebookPayload: FileDataPayload | undefined = payload.notebook ? {
      fileName: payload.notebook.fileName,
      totalKwh: payload.notebook.totalKwh,
      totalCount: payload.notebook.totalSessions,
      dailyRows: payload.notebook.dailyRows?.map(r => ({ date: r.dateStr || r.day, kwh: r.kwh })),
    } : undefined;

    const hubtelPayload: FileDataPayload | undefined = payload.hubtel ? {
      fileName: payload.hubtel.fileName,
      totalAmount: payload.hubtel.totalAmount,
      totalCount: payload.hubtel.totalCount,
    } : undefined;

    // 4. Run simple deterministic analysis (no external AI call)
    const analysis: ReconciliationAnalysisResult = generateSimpleAnalysis({
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      smartMeter: smartMeterPayload,
      notebook: notebookPayload,
      hubtel: hubtelPayload,
      appSessionsKwh: totalAppKwh,
      appRevenueGhs: totalAppRevenue,
      dbHubtelCollectedGhs: dbHubtelCollected,
    });

    const primaryTitle = [
      payload.smartMeter?.fileName,
      payload.notebook?.fileName,
      payload.hubtel?.fileName,
    ].filter(Boolean).join(' + ') || 'Multi-Document Audit';

    const meterKwhVal = payload.smartMeter?.totalKwh || payload.notebook?.totalKwh || totalAppKwh;

    // 5. Build full JSON metadata object
    const reportMetadata = {
      primaryTitle,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      smartMeter: payload.smartMeter,
      notebook: payload.notebook,
      hubtel: payload.hubtel,
      appSessionsKwh: totalAppKwh,
      appRevenueGhs: totalAppRevenue,
      dbHubtelCollectedGhs: dbHubtelCollected,
      aiAnalysis: analysis,
      userNotes: payload.notes || '',
      createdByName: user.email || 'Admin',
      createdAt: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('energy_reconciliation')
      .insert([
        {
          period_start: payload.periodStart,
          period_end: payload.periodEnd,
          meter_kwh: meterKwhVal,
          app_kwh: totalAppKwh,
          notes: JSON.stringify(reportMetadata),
          created_by: user.id,
        }
      ])
      .select('id')
      .single();

    if (insertError) throw insertError;

    revalidatePath('/reconciliation');
    return {
      success: true,
      id: inserted.id,
      report: reportMetadata,
    };
  } catch (error: any) {
    console.error('[RECONCILIATION] saveMultiDocumentReconciliationReport error:', error);
    return { success: false, error: error.message || 'Failed to process multi-document reconciliation.' };
  }
}

export async function deleteReconciliation(id: string) {
  try {
    await requireAuth(['super_admin']);
    const { error } = await supabaseAdmin.from('energy_reconciliation').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[RECONCILIATION] delete error:', error);
    return { success: false, error: error.message || 'Failed to delete record.' };
  }
}

// ─── Daily kWh Readings ──────────────────────────────────────────────────────

export async function addKwhDailyReading(formData: {
  reading_date: string;
  source: 'smart_meter' | 'machine' | 'notebook';
  kwh: number;
  notes?: string;
}) {
  try {
    const user = await requireAuth(['super_admin', 'manager', 'finance']);

    const { error } = await supabaseAdmin
      .from('kwh_daily_readings')
      .insert([{
        reading_date: formData.reading_date,
        source: formData.source,
        kwh: formData.kwh,
        notes: formData.notes || null,
        created_by: user.id,
      }]);

    if (error) throw error;

    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[KWH-DAILY] add error:', error);
    return { success: false, error: error.message || 'Failed to add kWh reading.' };
  }
}

export async function deleteKwhDailyReading(id: string) {
  try {
    await requireAuth(['super_admin', 'manager', 'finance']);
    const { error } = await supabaseAdmin.from('kwh_daily_readings').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/reconciliation');
    return { success: true };
  } catch (error: any) {
    console.error('[KWH-DAILY] delete error:', error);
    return { success: false, error: error.message || 'Failed to delete reading.' };
  }
}
