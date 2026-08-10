/**
 * Simple deterministic energy & payment reconciliation analysis engine.
 * No external AI or API calls — all analysis is computed from the raw numbers.
 */

export interface FileDataPayload {
  fileName: string;
  totalKwh?: number;
  totalAmount?: number;
  totalCount?: number;
  dailyRows?: Array<{ date: string; kwh?: number; amount?: number }>;
}

export interface ReconciliationAnalysisInput {
  periodStart: string;
  periodEnd: string;
  smartMeter?: FileDataPayload;
  notebook?: FileDataPayload;
  hubtel?: FileDataPayload;
  appSessionsKwh: number;
  appRevenueGhs: number;
  dbHubtelCollectedGhs: number;
}

export interface ReconciliationAnalysisResult {
  summary: string;
  energyAnalysis: string;
  financialAnalysis: string;
  forensicRiskAssessment: string;
  rootCauses: string[];
  recommendations: string[];
  isAiGenerated: boolean;
  provider: string;
  auditGrade: 'A (Clean)' | 'B (Minor Variance)' | 'C (Attention Required)' | 'D (High Discrepancy Alert)';
  financialLeakageGhs: number;
  energyVariancePct: number;
}

/**
 * Generates a simple rule-based reconciliation analysis from uploaded documents and live DB data.
 * Produces an audit grade, variance calculations, root causes, and recommendations.
 */
export function generateSimpleAnalysis(input: ReconciliationAnalysisInput): ReconciliationAnalysisResult {
  const smartMeterKwh = input.smartMeter?.totalKwh || 0;
  const notebookKwh = input.notebook?.totalKwh || 0;
  const hubtelGhs = input.hubtel?.totalAmount || 0;

  const uploadedSources = [
    input.smartMeter ? `Smart Meter Log: "${input.smartMeter.fileName}" (${input.smartMeter.totalKwh?.toFixed(2)} kWh)` : null,
    input.notebook ? `Attendant Notebook Log: "${input.notebook.fileName}" (${input.notebook.totalKwh?.toFixed(2)} kWh)` : null,
    input.hubtel ? `Hubtel Export: "${input.hubtel.fileName}" (GHS ${input.hubtel.totalAmount?.toFixed(2)})` : null,
  ].filter(Boolean) as string[];

  // Core variance calculations
  const energyVarianceKwh = smartMeterKwh > 0 ? smartMeterKwh - input.appSessionsKwh : 0;
  const energyVariancePct = smartMeterKwh > 0 ? (energyVarianceKwh / smartMeterKwh) * 100 : 0;
  const financialLeakageGhs =
    hubtelGhs > 0
      ? Math.max(0, input.appRevenueGhs - hubtelGhs)
      : Math.max(0, input.appRevenueGhs - input.dbHubtelCollectedGhs);

  const isHighVariance = Math.abs(energyVariancePct) > 5;
  const isCriticalLeakage = financialLeakageGhs > 50;

  // Build root causes
  const rootCauses: string[] = [];
  const recommendations: string[] = [];

  if (smartMeterKwh > 0) {
    if (isHighVariance) {
      rootCauses.push(
        `Grid Energy Loss: Physical meter recorded ${smartMeterKwh.toFixed(2)} kWh vs ${input.appSessionsKwh.toFixed(2)} kWh in app sessions — a ${energyVariancePct.toFixed(1)}% variance exceeding the standard 5% transformer dissipation threshold.`
      );
      recommendations.push(
        'Urgent (24 h): Inspect transformer sub-meter CT coils and audit attendant session logs against OCPP connector timestamps.'
      );
    } else {
      rootCauses.push(
        `Grid efficiency is within tolerance: ${energyVariancePct.toFixed(1)}% variance is within the standard 3–5% transformer and line loss range.`
      );
      recommendations.push(
        'Weekly: Continue uploading smart meter logs and cross-verifying against attendant shift notebooks.'
      );
    }
  }

  if (notebookKwh > 0) {
    const diff = Math.abs(notebookKwh - input.appSessionsKwh);
    if (diff > 5) {
      rootCauses.push(
        `Attendant Log Variance: Notebook recorded ${notebookKwh.toFixed(2)} kWh vs SCMS ${input.appSessionsKwh.toFixed(2)} kWh — a ${diff.toFixed(2)} kWh discrepancy.`
      );
      recommendations.push(
        '7 days: Require attendants to match physical log against digital receipts before shift handover.'
      );
    } else {
      rootCauses.push(
        `Attendant notebook is closely aligned with app data (${diff.toFixed(2)} kWh difference).`
      );
    }
  }

  if (hubtelGhs > 0 || financialLeakageGhs > 10) {
    rootCauses.push(
      `Financial Settlement Gap: Sales of GHS ${input.appRevenueGhs.toFixed(2)} show an unmatched gap of GHS ${financialLeakageGhs.toFixed(2)} against gateway records.`
    );
    recommendations.push(
      '30 days: Request Hubtel daily settlement bank transfer advice to reconcile pending MoMo transaction references.'
    );
  }

  // Determine audit grade
  let grade: ReconciliationAnalysisResult['auditGrade'] = 'B (Minor Variance)';
  if (isCriticalLeakage && isHighVariance) grade = 'D (High Discrepancy Alert)';
  else if (isHighVariance || isCriticalLeakage) grade = 'C (Attention Required)';
  else if (Math.abs(energyVariancePct) < 2 && financialLeakageGhs < 5) grade = 'A (Clean)';

  // Build narrative sections
  const periodLabel = `${new Date(input.periodStart).toLocaleDateString()} – ${new Date(input.periodEnd).toLocaleDateString()}`;

  const summary =
    `Reconciliation audit for ${periodLabel} covering ${uploadedSources.length} verification source(s). ` +
    `Total recorded energy sales: ${input.appSessionsKwh.toFixed(2)} kWh / GHS ${input.appRevenueGhs.toFixed(2)}. ` +
    `Overall audit grade: ${grade}.` +
    (financialLeakageGhs > 0
      ? ` Revenue gap of GHS ${financialLeakageGhs.toFixed(2)} requires follow-up.`
      : ' No significant financial gap detected.');

  const energyAnalysis =
    smartMeterKwh > 0
      ? `Smart meter recorded ${smartMeterKwh.toFixed(2)} kWh grid draw vs ${input.appSessionsKwh.toFixed(2)} kWh in SCMS sessions. ` +
        `Variance: ${energyVarianceKwh > 0 ? '+' : ''}${energyVarianceKwh.toFixed(2)} kWh (${energyVariancePct.toFixed(1)}%). ` +
        (isHighVariance
          ? 'This exceeds the standard 3–5% transformer line loss benchmark and requires investigation.'
          : 'This is within the standard 3–5% transformer line loss benchmark.')
      : notebookKwh > 0
      ? `Attendant notebook logged ${notebookKwh.toFixed(2)} kWh vs ${input.appSessionsKwh.toFixed(2)} kWh in SCMS sessions. ` +
        `Difference: ${Math.abs(notebookKwh - input.appSessionsKwh).toFixed(2)} kWh.`
      : `No external meter source uploaded. SCMS recorded ${input.appSessionsKwh.toFixed(2)} kWh across sessions in this period.`;

  const financialAnalysis =
    `App-recorded customer sales: GHS ${input.appRevenueGhs.toFixed(2)}. ` +
    `Hubtel gateway settlements: GHS ${hubtelGhs > 0 ? hubtelGhs.toFixed(2) : input.dbHubtelCollectedGhs.toFixed(2)}. ` +
    `Net unmatched gap: GHS ${financialLeakageGhs.toFixed(2)}.` +
    (financialLeakageGhs > 0
      ? ' This gap may represent pending MoMo clearance, processing delays, or unrecorded cash sessions.'
      : ' No financial leakage detected — revenue and gateway settlements are aligned.');

  const forensicRiskAssessment =
    isHighVariance
      ? 'Elevated risk of unrecorded attendant session bypass or meter calibration drift. Physical CT sensor inspection is recommended.'
      : isCriticalLeakage
      ? 'Financial leakage exceeds GHS 50 threshold. Potential unrecorded cash sessions or gateway settlement delays.'
      : 'Low operational risk. No strong indicators of unauthorized charging, bypass activity, or significant revenue leakage.';

  return {
    auditGrade: grade,
    summary,
    energyAnalysis,
    financialAnalysis,
    forensicRiskAssessment,
    rootCauses,
    recommendations,
    isAiGenerated: false,
    provider: 'SCMS Automated Reconciliation Engine',
    financialLeakageGhs: Number(financialLeakageGhs.toFixed(2)),
    energyVariancePct: Number(energyVariancePct.toFixed(2)),
  };
}
