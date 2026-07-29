'use server';

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
 * Analyzes multi-source energy and payment reconciliation reports using Claude API (Anthropic).
 * Generates an Industry-Standard Executive Forensic Audit Report suitable for C-Suite / CEO review.
 */
export async function analyzeReconciliationWithClaude(
  input: ReconciliationAnalysisInput
): Promise<ReconciliationAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  const uploadedSources = [
    input.smartMeter ? `Smart Meter Log: "${input.smartMeter.fileName}" (${input.smartMeter.totalKwh?.toFixed(2)} kWh)` : null,
    input.notebook ? `Attendant Notebook Log: "${input.notebook.fileName}" (${input.notebook.totalKwh?.toFixed(2)} kWh)` : null,
    input.hubtel ? `Hubtel Export Sheet: "${input.hubtel.fileName}" (GHS ${input.hubtel.totalAmount?.toFixed(2)})` : null,
  ].filter(Boolean);

  const smartMeterKwh = input.smartMeter?.totalKwh || 0;
  const notebookKwh = input.notebook?.totalKwh || 0;
  const hubtelGhs = input.hubtel?.totalAmount || 0;

  // Calculate variances
  const energyVarianceKwh = smartMeterKwh > 0 ? smartMeterKwh - input.appSessionsKwh : 0;
  const energyVariancePct = smartMeterKwh > 0 ? (energyVarianceKwh / smartMeterKwh) * 100 : 0;
  const financialLeakageGhs = hubtelGhs > 0 ? Math.max(0, input.appRevenueGhs - hubtelGhs) : Math.max(0, input.appRevenueGhs - input.dbHubtelCollectedGhs);

  if (apiKey) {
    try {
      const prompt = `You are the Chief Energy Infrastructure Auditor & Financial Forensic Director for Spero EV Charging Networks.
Generate an Industry-Standard Executive Forensic Audit Report for the Chief Executive Officer (CEO) and Board of Directors.

Audit Period: ${new Date(input.periodStart).toLocaleDateString()} to ${new Date(input.periodEnd).toLocaleDateString()}
Uploaded Verification Source Documents:
${uploadedSources.map(s => `- ${s}`).join('\n')}

DATA LEDGER CONTEXT:
1. Grid & Physical Energy Balance:
   - Primary Smart Meter Utility Draw: ${smartMeterKwh > 0 ? `${smartMeterKwh.toFixed(2)} kWh` : 'Not Provided'}
   - Attendant Manual Shift Notebook Record: ${notebookKwh > 0 ? `${notebookKwh.toFixed(2)} kWh` : 'Not Provided'}
   - SCMS Digital Application Recorded Sessions: ${input.appSessionsKwh.toFixed(2)} kWh
   - Grid-to-App Energy Variance: ${energyVarianceKwh > 0 ? '+' : ''}${energyVarianceKwh.toFixed(2)} kWh (${energyVariancePct.toFixed(2)}%)

2. Financial Revenue & Settlement Audit:
   - SCMS Recorded Customer Sales Revenue: GHS ${input.appRevenueGhs.toFixed(2)}
   - Hubtel Payment Gateway Export Statement: ${hubtelGhs > 0 ? `GHS ${hubtelGhs.toFixed(2)}` : 'Not Provided'}
   - SCMS Internal DB Hubtel Payments Received: GHS ${input.dbHubtelCollectedGhs.toFixed(2)}
   - Financial Settlement Gap / Unmatched Revenue Leakage: GHS ${financialLeakageGhs.toFixed(2)}

3. Daily Log Breakdown (Sample):
${(input.smartMeter?.dailyRows || input.notebook?.dailyRows || []).slice(0, 10).map(d => `- Date ${d.date}: ${d.kwh !== undefined ? `${d.kwh} kWh` : ''}`).join('\n')}

REQUIREMENTS:
Write an authoritative, mathematically precise, and executive-level forensic audit report in JSON format:
{
  "auditGrade": "A (Clean)" | "B (Minor Variance)" | "C (Attention Required)" | "D (High Discrepancy Alert)",
  "summary": "3-4 sentence high-level executive summary written specifically for CEO and Board decision-makers.",
  "energyAnalysis": "Detailed paragraph evaluating technical energy balance, grid transformer/cable loss (benchmarked against standard 3.0-5.0%), smart meter CT accuracy, and attendant shift notebook alignment.",
  "financialAnalysis": "Detailed paragraph evaluating revenue integrity, app sales vs Hubtel settlement statements, gateway processing fees (~1.0%), and mobile money clearance status.",
  "forensicRiskAssessment": "Detailed paragraph assessing operational risk, potential unrecorded attendant bypass charging, offline charger heartbeat dropouts, and cash/MoMo leakage exposures.",
  "rootCauses": [
    "Specific technical or financial root cause 1 with quantified impact",
    "Specific technical or financial root cause 2 with quantified impact",
    "Specific technical or financial root cause 3 with quantified impact"
  ],
  "recommendations": [
    "Immediate 24-Hour Action: High priority operational control",
    "7-Day Action: Technical or financial auditing procedure",
    "30-Day Action: Long-term infrastructure or gateway optimization"
  ]
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1600,
          messages: [
            { role: 'user', content: prompt }
          ]
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.content?.[0]?.text || '';
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            auditGrade: parsed.auditGrade || (Math.abs(energyVariancePct) > 5 ? 'C (Attention Required)' : 'B (Minor Variance)'),
            summary: parsed.summary || 'Executive Forensic Audit completed successfully by Claude AI.',
            energyAnalysis: parsed.energyAnalysis || 'Technical energy balance evaluated across physical meter readings and digital session logs.',
            financialAnalysis: parsed.financialAnalysis || 'Revenue integrity verified against gateway settlement statements.',
            forensicRiskAssessment: parsed.forensicRiskAssessment || 'Low operational risk identified across primary station infrastructure.',
            rootCauses: parsed.rootCauses || [],
            recommendations: parsed.recommendations || [],
            isAiGenerated: true,
            provider: 'Claude Sonnet 4.6 (Forensic Infrastructure Audit AI)',
            financialLeakageGhs: Number(financialLeakageGhs.toFixed(2)),
            energyVariancePct: Number(energyVariancePct.toFixed(2)),
          };
        }
      } else {
        console.warn('[CLAUDE-API] API error:', response.status);
      }
    } catch (err: any) {
      console.error('[CLAUDE-API] Error:', err.message);
    }
  }

  // Fallback Executive Rule-Based Engine
  const isHighVariance = Math.abs(energyVariancePct) > 5;
  const isCriticalLeakage = financialLeakageGhs > 50;

  const rootCauses: string[] = [];
  const recommendations: string[] = [];

  if (smartMeterKwh > 0) {
    if (isHighVariance) {
      rootCauses.push(`Grid Energy Loss: Physical meter recorded ${smartMeterKwh.toFixed(2)} kWh vs ${input.appSessionsKwh.toFixed(2)} kWh in SCMS app, representing a ${energyVariancePct.toFixed(1)}% variance (exceeds standard 5.0% transformer dissipation threshold).`);
      recommendations.push('24-Hour Urgent Action: Conduct physical inspection of station transformer sub-meter CT coils and audit attendant manual session logs against charger OCPP connector status timestamps.');
    } else {
      rootCauses.push(`Grid Energy Efficiency: Physical meter variance of ${energyVariancePct.toFixed(1)}% sits comfortably within standard 3-5% transformer and line loss tolerance limits.`);
      recommendations.push('7-Day Action: Maintain weekly smart meter log uploads and periodic attendant shift notebook cross-verification.');
    }
  }

  if (notebookKwh > 0) {
    const notebookDiff = Math.abs(notebookKwh - input.appSessionsKwh);
    if (notebookDiff > 5) {
      rootCauses.push(`Attendant Log Variance: Shift notebook logged ${notebookKwh.toFixed(2)} kWh, differing from SCMS recorded sessions (${input.appSessionsKwh.toFixed(2)} kWh) by ${notebookDiff.toFixed(2)} kWh.`);
      recommendations.push('7-Day Action: Institute mandatory shift sign-off procedures requiring attendants to match physical notebook logs against digital station receipts before handover.');
    }
  }

  if (hubtelGhs > 0 || financialLeakageGhs > 10) {
    rootCauses.push(`Financial Settlement Gap: Customer sales of GHS ${input.appRevenueGhs.toFixed(2)} show an unmatched gap of GHS ${financialLeakageGhs.toFixed(2)} against payment gateway records.`);
    recommendations.push('30-Day Action: Request Hubtel daily settlement bank transfer advice statement to reconcile pending MoMo transaction reference numbers.');
  }

  let grade: 'A (Clean)' | 'B (Minor Variance)' | 'C (Attention Required)' | 'D (High Discrepancy Alert)' = 'B (Minor Variance)';
  if (isCriticalLeakage && isHighVariance) grade = 'D (High Discrepancy Alert)';
  else if (isHighVariance || isCriticalLeakage) grade = 'C (Attention Required)';
  else if (Math.abs(energyVariancePct) < 2 && financialLeakageGhs < 5) grade = 'A (Clean)';

  return {
    auditGrade: grade,
    summary: `Executive Forensic Audit for period ${new Date(input.periodStart).toLocaleDateString()} to ${new Date(input.periodEnd).toLocaleDateString()} evaluating ${uploadedSources.length} verification document source(s). Recorded energy sales total ${input.appSessionsKwh.toFixed(2)} kWh across GHS ${input.appRevenueGhs.toFixed(2)} in customer revenue, with an overall audit status of ${grade}.`,
    energyAnalysis: `Physical smart meter draw (${smartMeterKwh > 0 ? `${smartMeterKwh.toFixed(2)} kWh` : 'N/A'}) compared against SCMS recorded application consumption (${input.appSessionsKwh.toFixed(2)} kWh). Grid-to-app variance is ${energyVariancePct.toFixed(1)}%.`,
    financialAnalysis: `Financial reconciliation compares customer sales revenue (GHS ${input.appRevenueGhs.toFixed(2)}) against Hubtel settlement records (GHS ${hubtelGhs > 0 ? hubtelGhs.toFixed(2) : input.dbHubtelCollectedGhs.toFixed(2)}), identifying a net gap of GHS ${financialLeakageGhs.toFixed(2)}.`,
    forensicRiskAssessment: `Forensic analysis indicates ${isHighVariance ? 'elevated risk of unrecorded attendant session bypass or meter calibration drift' : 'low risk of unauthorized charging or energy theft'}.`,
    rootCauses,
    recommendations,
    isAiGenerated: false,
    provider: 'SCMS Automated Executive Audit Engine',
    financialLeakageGhs: Number(financialLeakageGhs.toFixed(2)),
    energyVariancePct: Number(energyVariancePct.toFixed(2)),
  };
}
