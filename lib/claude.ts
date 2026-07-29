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
  rootCauses: string[];
  recommendations: string[];
  isAiGenerated: boolean;
  provider: string;
  auditGrade: 'A (Clean)' | 'B (Minor Variance)' | 'C (Attention Required)' | 'D (High Discrepancy Alert)';
}

/**
 * Analyzes multi-source energy and payment reconciliation reports using Claude API (Anthropic).
 * Cross-audits Smart Meter logs, Attendant Notebook records, Hubtel Settlement Exports, and SCMS DB.
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

  if (apiKey) {
    try {
      const prompt = `You are a Senior EV Charging Station Auditor & Financial Forensic AI.
Analyze the following multi-source EV Charging Reconciliation Report for audit window ${new Date(input.periodStart).toLocaleDateString()} to ${new Date(input.periodEnd).toLocaleDateString()}:

Uploaded Document Sources:
${uploadedSources.map(s => `- ${s}`).join('\n')}

1. Energy Consumption Comparison:
- Smart Meter Grid Power Draw: ${input.smartMeter?.totalKwh ? `${input.smartMeter.totalKwh.toFixed(2)} kWh` : 'Not Uploaded (N/A)'}
- Attendant Notebook Logged Energy: ${input.notebook?.totalKwh ? `${input.notebook.totalKwh.toFixed(2)} kWh` : 'Not Uploaded (N/A)'}
- Application Recorded Sessions: ${input.appSessionsKwh.toFixed(2)} kWh

2. Financial Settlement Comparison:
- App Recorded Customer Sales: GHS ${input.appRevenueGhs.toFixed(2)}
- Hubtel Exported Collected Settlements: ${input.hubtel?.totalAmount ? `GHS ${input.hubtel.totalAmount.toFixed(2)}` : 'Not Uploaded (N/A)'}
- Application Database Hubtel Payments: GHS ${input.dbHubtelCollectedGhs.toFixed(2)}

3. Daily Log Sample (up to 7 days):
${(input.smartMeter?.dailyRows || input.notebook?.dailyRows || []).slice(0, 7).map(d => `- Date ${d.date}: ${d.kwh !== undefined ? `${d.kwh} kWh` : ''}`).join('\n')}

Please provide a highly professional, thorough audit analysis in valid JSON format:
{
  "auditGrade": "A (Clean)" | "B (Minor Variance)" | "C (Attention Required)" | "D (High Discrepancy Alert)",
  "summary": "2-3 sentence executive audit summary",
  "energyAnalysis": "Concise paragraph analyzing grid meter vs notebook vs app energy draw and line loss",
  "financialAnalysis": "Concise paragraph analyzing app revenue vs Hubtel export settlements and gateway fees",
  "rootCauses": ["Key root cause 1", "Key root cause 2", "Key root cause 3"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3"]
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
          max_tokens: 1200,
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
            auditGrade: parsed.auditGrade || 'B (Minor Variance)',
            summary: parsed.summary || 'Audit analysis completed successfully by Claude Sonnet.',
            energyAnalysis: parsed.energyAnalysis || 'Energy consumption verified across uploaded documents and app database.',
            financialAnalysis: parsed.financialAnalysis || 'Financial settlements reconciled against gateway exports.',
            rootCauses: parsed.rootCauses || [],
            recommendations: parsed.recommendations || [],
            isAiGenerated: true,
            provider: 'Claude Sonnet 4.6 (Anthropic AI)'
          };
        }
      } else {
        console.warn('[CLAUDE-API] API error:', response.status);
      }
    } catch (err: any) {
      console.error('[CLAUDE-API] Error:', err.message);
    }
  }

  // Fallback Rule-Based Engine
  const hasMeter = !!input.smartMeter?.totalKwh;
  const meterKwh = input.smartMeter?.totalKwh || 0;
  const variancePct = hasMeter && meterKwh > 0 ? ((meterKwh - input.appSessionsKwh) / meterKwh) * 100 : 0;
  const isHighVariance = Math.abs(variancePct) > 5;

  const rootCauses: string[] = [];
  const recommendations: string[] = [];

  if (hasMeter) {
    if (isHighVariance) {
      rootCauses.push(`Grid-side variance of ${variancePct.toFixed(1)}% exceeds standard 5.0% transformer loss threshold.`);
      recommendations.push('Inspect station transformer CT calibration and check for unrecorded manual session overrides.');
    } else {
      rootCauses.push(`Meter variance of ${variancePct.toFixed(1)}% is within standard grid dissipation limits.`);
      recommendations.push('Maintain weekly smart meter log uploads and periodic attendant notebook cross-checks.');
    }
  }

  if (input.notebook?.totalKwh) {
    const notebookDiff = Math.abs(input.notebook.totalKwh - input.appSessionsKwh);
    if (notebookDiff > 5) {
      rootCauses.push(`Notebook logged total (${input.notebook.totalKwh.toFixed(1)} kWh) differs from app recorded sessions (${input.appSessionsKwh.toFixed(1)} kWh) by ${notebookDiff.toFixed(1)} kWh.`);
      recommendations.push('Cross-audit attendant shift notebook entries with charger OCPP transaction timestamps.');
    }
  }

  if (input.hubtel?.totalAmount) {
    const hubtelGap = Math.abs(input.appRevenueGhs - input.hubtel.totalAmount);
    if (hubtelGap > 10) {
      rootCauses.push(`Hubtel export settlement (${input.hubtel.totalAmount.toFixed(2)} GHS) differs from recorded app revenue (${input.appRevenueGhs.toFixed(2)} GHS) by GHS ${hubtelGap.toFixed(2)}.`);
      recommendations.push('Review pending MoMo transaction status codes and confirm Hubtel daily settlement bank transfer advice.');
    }
  }

  return {
    auditGrade: isHighVariance ? 'C (Attention Required)' : 'B (Minor Variance)',
    summary: `Multi-source audit for period ${new Date(input.periodStart).toLocaleDateString()} to ${new Date(input.periodEnd).toLocaleDateString()} processing ${uploadedSources.length} uploaded document(s). Application sessions recorded ${input.appSessionsKwh.toFixed(2)} kWh energy sold and GHS ${input.appRevenueGhs.toFixed(2)} customer sales revenue.`,
    energyAnalysis: `Energy reconciliation cross-evaluated against ${input.smartMeter ? `smart meter log (${meterKwh.toFixed(2)} kWh)` : 'application database sessions'}. Variance sits at ${variancePct.toFixed(1)}%.`,
    financialAnalysis: `Financial reconciliation cross-evaluated against ${input.hubtel ? `Hubtel export statement (GHS ${input.hubtel.totalAmount?.toFixed(2)})` : 'recorded app transactions'}.`,
    rootCauses,
    recommendations,
    isAiGenerated: false,
    provider: 'SCMS Automated Multi-Document Audit Engine'
  };
}
