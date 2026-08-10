'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TopBar } from '@/components/layout/TopBar';
import { useReconciliations, useSessions, usePayments, useKwhDailyReadings } from '@/hooks/use-database';
import { saveMultiDocumentReconciliationReport, deleteReconciliation, addReconciliation, addKwhDailyReading, deleteKwhDailyReading } from '@/app/actions/reconciliation';
import { toast } from 'sonner';
import {
  BarChart2, CreditCard, Clock, Upload, Trash2,
  AlertTriangle, CheckCircle2, FileText, Smartphone, RefreshCw,
  Download, Sparkles, BookOpen, FileSpreadsheet, X, ShieldAlert, CheckCircle,
  TrendingDown, DollarSign, Activity, FileCheck, Zap, ChevronDown, ChevronRight, PlusCircle, FlaskConical
} from 'lucide-react';

interface UploadedFileMeta {
  file: File;
  fileName: string;
  totalKwh?: number;
  totalAmount?: number;
  totalCount?: number;
  dailyRows?: Array<{ day: string; dateStr?: string; kwh?: number; amount?: number }>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DailyKwhRow {
  date: string;
  smartMeter: number;
  machine: number;
  notebook: number;
  appKwh: number;
  entries: Array<{ id: string; source: 'smart_meter' | 'machine' | 'notebook'; kwh: number; notes: string | null }>;
}

interface AnalysisResult {
  date: string;
  smartMeterVariance: number;
  machineVariance: number;
  notebookVariance: number;
  status: 'good' | 'warning' | 'critical';
}

export default function ReconciliationPage() {
  const { data: reconciliations, isLoading, refetch } = useReconciliations();
  const { data: sessions } = useSessions({ loadAll: true });
  const { data: payments } = usePayments();
  const { data: kwhReadings, refetch: refetchKwh } = useKwhDailyReadings();

  // Active Tab state: 'energy' | 'hubtel' | 'daily' | 'history'
  const [activeTab, setActiveTab] = useState<'energy' | 'hubtel' | 'daily' | 'history'>('energy');

  const [generatingReport, setGeneratingReport] = useState(false);

  // ─── Daily kWh state ────────────────────────────────────────────────────────
  const [kwhDate, setKwhDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [kwhSource, setKwhSource] = useState<'smart_meter' | 'machine' | 'notebook'>('smart_meter');
  const [kwhValue, setKwhValue] = useState('');
  const [kwhNotes, setKwhNotes] = useState('');
  const [savingKwh, setSavingKwh] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 3 Optional Document Upload States
  const [meterFile, setMeterFile] = useState<UploadedFileMeta | null>(null);
  const [notebookFile, setNotebookFile] = useState<UploadedFileMeta | null>(null);
  const [hubtelFile, setHubtelFile] = useState<UploadedFileMeta | null>(null);

  // File Input Refs
  const meterRef = useRef<HTMLInputElement>(null);
  const notebookRef = useRef<HTMLInputElement>(null);
  const hubtelRef = useRef<HTMLInputElement>(null);

  // Selected Audit History ID
  const [selectedAuditId, setSelectedAuditId] = useState<string>('');

  // Report Container Ref for PDF Export
  const reportRef = useRef<HTMLDivElement>(null);

  // Count how many documents are currently uploaded
  const uploadedCount = [meterFile, notebookFile, hubtelFile].filter(Boolean).length;

  // ─── Excel / CSV Parser Helper ──────────────────────────────────────────────
  const parseExcelOrCsv = async (file: File, type: 'meter' | 'notebook' | 'hubtel') => {
    return new Promise<UploadedFileMeta>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (!jsonRows || jsonRows.length === 0) {
            return reject(new Error('Spreadsheet is empty'));
          }

          let dateColIdx = -1;
          let targetColIdx = -1;
          let headerRowIdx = -1;

          const energyKeywords = ['kwh', 'consumption', 'units', 'energy', 'draw', 'used', 'diff', 'difference', 'daily'];
          const amountKeywords = ['amount', 'ghs', 'collected', 'paid', 'settlement', 'revenue'];
          const dateKeywords = ['date', 'day', 'time', 'timestamp', 'period', 'created'];
          const targetKeywords = type === 'hubtel' ? amountKeywords : energyKeywords;

          // 1. Scan top 15 rows for Header Row & exact column indices
          for (let r = 0; r < Math.min(15, jsonRows.length); r++) {
            const row = jsonRows[r];
            if (!Array.isArray(row)) continue;

            row.forEach((cell, cIdx) => {
              if (cell !== undefined && cell !== null) {
                const str = String(cell).trim().toLowerCase();
                if (dateColIdx === -1 && dateKeywords.some(k => str.includes(k))) {
                  dateColIdx = cIdx;
                  headerRowIdx = r;
                }
                if (targetColIdx === -1 && targetKeywords.some(k => str.includes(k))) {
                  targetColIdx = cIdx;
                  headerRowIdx = r;
                }
              }
            });

            if (targetColIdx !== -1) break;
          }

          // 2. Fallback: If no target header found, evaluate columns for daily numbers vs cumulative meter readings
          if (targetColIdx === -1) {
            const colSums: Record<number, { sum: number; count: number; max: number }> = {};
            const startR = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

            for (let r = startR; r < jsonRows.length; r++) {
              const row = jsonRows[r];
              if (!Array.isArray(row)) continue;

              row.forEach((cell, cIdx) => {
                const num = parseFloat(String(cell).replace(/,/g, '').trim());
                if (!isNaN(num) && num > 0) {
                  if (!colSums[cIdx]) colSums[cIdx] = { sum: 0, count: 0, max: 0 };
                  colSums[cIdx].sum += num;
                  colSums[cIdx].count += 1;
                  colSums[cIdx].max = Math.max(colSums[cIdx].max, num);
                }
              });
            }

            let bestCol = -1;
            let bestMax = Infinity;
            Object.entries(colSums).forEach(([cIdxStr, stats]) => {
              const cIdx = Number(cIdxStr);
              if (cIdx === dateColIdx) return;
              if (stats.max < 10000 && stats.max > 0 && stats.max < bestMax) {
                bestMax = stats.max;
                bestCol = cIdx;
              }
            });

            if (bestCol !== -1) {
              targetColIdx = bestCol;
            }
          }

          let totalKwh = 0;
          let totalAmount = 0;
          let totalCount = 0;
          const dailyRows: Array<{ day: string; dateStr?: string; kwh?: number; amount?: number }> = [];

          // 3. Process data rows
          const startDataRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

          for (let r = startDataRow; r < jsonRows.length; r++) {
            const row = jsonRows[r];
            if (!Array.isArray(row) || row.length === 0) continue;

            const rowText = row.join(' ').toLowerCase();
            if (rowText.includes('grand total') || rowText.includes('total sum') || rowText.includes('summary')) {
              continue;
            }

            let dateVal = '';
            let val = NaN;

            if (dateColIdx !== -1 && row[dateColIdx] !== undefined) {
              dateVal = String(row[dateColIdx]).trim();
            }

            if (targetColIdx !== -1 && row[targetColIdx] !== undefined) {
              const num = parseFloat(String(row[targetColIdx]).replace(/,/g, '').trim());
              if (!isNaN(num) && num >= 0) val = num;
            }

            if (!dateVal) {
              row.forEach((cell) => {
                const str = String(cell).trim();
                if (!dateVal && (str.match(/\d{4}-\d{2}-\d{2}/) || str.match(/\d{1,2}\/\d{1,2}/) || str.toLowerCase().includes('day'))) {
                  dateVal = str;
                }
              });
            }

            if (isNaN(val)) {
              row.forEach((cell, cIdx) => {
                if (cIdx === dateColIdx) return;
                const num = parseFloat(String(cell).replace(/,/g, '').trim());
                if (!isNaN(num) && num > 0 && num < 10000 && (isNaN(val) || num < val)) {
                  val = num;
                }
              });
            }

            if (!isNaN(val) && val > 0) {
              if (type === 'hubtel') {
                totalAmount += val;
                totalCount += 1;
                dailyRows.push({ day: dateVal || `Row ${dailyRows.length + 1}`, amount: val });
              } else {
                totalKwh += val;
                totalCount += 1;
                dailyRows.push({ day: dateVal || `Day ${dailyRows.length + 1}`, kwh: val });
              }
            }
          }

          const meta: UploadedFileMeta = {
            file,
            fileName: file.name,
            totalKwh: type !== 'hubtel' ? Number(totalKwh.toFixed(2)) : undefined,
            totalAmount: type === 'hubtel' ? Number(totalAmount.toFixed(2)) : undefined,
            totalCount,
            dailyRows,
          };
          resolve(meta);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'meter' | 'notebook' | 'hubtel') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const meta = await parseExcelOrCsv(file, type);
        if (type === 'meter') setMeterFile(meta);
        if (type === 'notebook') setNotebookFile(meta);
        if (type === 'hubtel') setHubtelFile(meta);
        toast.success(`Parsed "${file.name}" for ${type === 'meter' ? 'Smart Meter' : type === 'notebook' ? 'Attendant Notebook' : 'Hubtel Log'}`);
      } catch (err) {
        toast.error(`Failed to parse "${file.name}". Please check format.`);
      }
    }
  };

  // ─── Generate Multi-Document Reconciliation Report ──────────────────────────
  const handleGenerateAuditReport = async () => {
    if (uploadedCount === 0) {
      return toast.error('Please upload at least one document to generate the report.');
    }

    setGeneratingReport(true);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 86400000).toISOString();
    const periodEnd = now.toISOString();

    const res = await saveMultiDocumentReconciliationReport({
      periodStart,
      periodEnd,
      smartMeter: meterFile ? {
        fileName: meterFile.fileName,
        totalKwh: meterFile.totalKwh || 0,
        dailyRows: meterFile.dailyRows?.map(r => ({ day: r.day, dateStr: r.dateStr, kwh: r.kwh || 0 }))
      } : undefined,
      notebook: notebookFile ? {
        fileName: notebookFile.fileName,
        totalKwh: notebookFile.totalKwh || 0,
        dailyRows: notebookFile.dailyRows?.map(r => ({ day: r.day, dateStr: r.dateStr, kwh: r.kwh || 0 }))
      } : undefined,
      hubtel: hubtelFile ? { fileName: hubtelFile.fileName, totalAmount: hubtelFile.totalAmount || 0, totalCount: hubtelFile.totalCount } : undefined,
    });

    setGeneratingReport(false);

    if (res.success) {
      toast.success('Audit Report generated & saved!');
      refetch();
      setActiveTab('history');
      if (res.id) setSelectedAuditId(res.id);
    } else {
      toast.error(res.error || 'Failed to generate audit report.');
    }
  };

  // ─── Export C-Suite Executive Report to Excel WorkBook ──────────────────────
  const handleExportExcel = (reportData: any) => {
    if (!reportData) return;
    try {
      const wb = XLSX.utils.book_new();

      const ai = reportData.aiAnalysis || {};

      // Sheet 1: CEO Executive Summary & Scorecard
      const summaryRows = [
        ['SPERO EV CHARGING STATION — ENERGY & PAYMENT RECONCILIATION REPORT'],
        ['CONFIDENTIAL — INTERNAL MANAGEMENT REVIEW'],
        [],
        ['Audit Reference ID', reportData.primaryTitle || `AUDIT-${new Date().toISOString().split('T')[0]}`],
        ['Generated Date', new Date().toLocaleString()],
        ['Audit Window', `${new Date(reportData.periodStart).toLocaleDateString()} – ${new Date(reportData.periodEnd).toLocaleDateString()}`],
        ['Audit Grade', ai.auditGrade || 'B (Minor Variance)'],
        ['Analysis Engine', ai.provider || 'SCMS Automated Analysis Engine'],
        [],
        ['========================================================================================'],
        ['1. EXECUTIVE BOARD SUMMARY'],
        ['========================================================================================'],
        [ai.summary || 'N/A'],
        [],
        ['========================================================================================'],
        ['2. EXECUTIVE FINANCIAL & ENERGY SCORECARD'],
        ['========================================================================================'],
        ['Metric Description', 'Recorded Audit Value', 'Audit Benchmark / Notes'],
        ['Smart Meter Grid Energy Draw', reportData.smartMeter?.totalKwh ? `${reportData.smartMeter.totalKwh.toFixed(2)} kWh` : 'N/A', 'Primary Utility Meter'],
        ['Attendant Notebook Logged Energy', reportData.notebook?.totalKwh ? `${reportData.notebook.totalKwh.toFixed(2)} kWh` : 'N/A', 'Station Attendant Manual Log'],
        ['SCMS Application Energy Sold', `${reportData.appSessionsKwh?.toFixed(2) || '0.00'} kWh`, 'Digital Charger OCPP Sessions'],
        ['Grid-to-App Energy Line Loss %', `${ai.energyVariancePct !== undefined ? ai.energyVariancePct.toFixed(2) : '0.00'} %`, 'Benchmark Tolerance: 3.0% – 5.0%'],
        ['SCMS Recorded Customer Sales Revenue', `GHS ${reportData.appRevenueGhs?.toFixed(2) || '0.00'}`, 'Recorded App Sales'],
        ['Hubtel Gateway Collected Settlements', reportData.hubtel?.totalAmount ? `GHS ${reportData.hubtel.totalAmount.toFixed(2)}` : `GHS ${(reportData.dbHubtelCollectedGhs || 0).toFixed(2)}`, 'Mobile Money Gateway Statement'],
        ['Net Unmatched Revenue Leakage', `GHS ${ai.financialLeakageGhs !== undefined ? ai.financialLeakageGhs.toFixed(2) : '0.00'}`, 'Uncollected / Pending Bank Gap'],
        [],
        ['========================================================================================'],
        ['3. ENERGY BALANCE & GRID TECHNICAL AUDIT'],
        ['========================================================================================'],
        [ai.energyAnalysis || 'N/A'],
        [],
        ['========================================================================================'],
        ['4. REVENUE INTEGRITY & GATEWAY SETTLEMENT AUDIT'],
        ['========================================================================================'],
        [ai.financialAnalysis || 'N/A'],
        [],
        ['========================================================================================'],
        ['5. FORENSIC OPERATIONAL RISK ASSESSMENT'],
        ['========================================================================================'],
        [ai.forensicRiskAssessment || 'N/A'],
        [],
        ['========================================================================================'],
        ['6. IDENTIFIED FORENSIC ROOT CAUSES'],
        ['========================================================================================'],
        ...(ai.rootCauses || []).map((c: string) => [`• ${c}`]),
        [],
        ['========================================================================================'],
        ['7. PRIORITIZED STRATEGIC RECOMMENDATIONS FOR CEO'],
        ['========================================================================================'],
        ...(ai.recommendations || []).map((r: string) => [`• ${r}`]),
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'CEO Executive Summary');

      // Sheet 2: Daily Consumption & Reconciliation Ledger
      const rows = reportData.smartMeter?.dailyRows || reportData.notebook?.dailyRows || [];
      if (rows.length > 0) {
        const dailyData = [
          ['Date / Day', 'Smart Meter Draw (kWh)', 'Attendant Notebook (kWh)', 'SCMS App Recorded (kWh)', 'Daily Discrepancy (kWh)'],
          ...rows.map((r: any) => [
            r.day || r.dateStr,
            r.kwh || 0,
            0,
            Number((reportData.appSessionsKwh / Math.max(1, rows.length)).toFixed(2)),
            Number(((r.kwh || 0) - (reportData.appSessionsKwh / Math.max(1, rows.length))).toFixed(2))
          ])
        ];
        const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
        XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Energy Ledger');
      }

      XLSX.writeFile(wb, `SPERO_Executive_Audit_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Executive Audit Workbook exported to Excel (.xlsx)');
    } catch (err) {
      toast.error('Failed to export Excel workbook.');
    }
  };

  // ─── Export Report to Professional PDF Document ────────────────────────────
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      toast.info('Rendering Executive PDF Audit Document...');
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#090d16',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`SPERO_Executive_Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Executive PDF Audit Report exported!');
    } catch (err) {
      console.error('[PDF-EXPORT] Error:', err);
      toast.error('Failed to generate PDF document.');
    }
  };

  // Database audit records
  const currentDbRecords = reconciliations || [];
  const selectedRecord = currentDbRecords.find(r => r.id === selectedAuditId);

  let parsedReportMeta: any = null;
  if (selectedRecord && selectedRecord.notes) {
    try {
      parsedReportMeta = JSON.parse(selectedRecord.notes);
    } catch (e) {
      parsedReportMeta = { userNotes: selectedRecord.notes };
    }
  }

  // Live calculations for Tab 2
  const totalAppRevenueLive = (sessions || []).reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const hubtelCollectedLive = (payments || [])
    .filter(p => p.status === 'success' && (p.method === 'mtn' || p.method === 'telecel' || p.method === 'airteltigo'))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const liveGapAmount = Math.max(0, totalAppRevenueLive - hubtelCollectedLive);
  const liveGapPct = totalAppRevenueLive > 0 ? (liveGapAmount / totalAppRevenueLive) * 100 : 0;

  // ─── Daily kWh helpers ──────────────────────────────────────────────────────

  // Compute app kWh per calendar date from sessions
  const appKwhByDate: Record<string, number> = {};
  (sessions || []).forEach(s => {
    if (!s.unitsConsumed) return;
    const d = (s.createdAt || '').slice(0, 10);
    if (!d) return;
    appKwhByDate[d] = (appKwhByDate[d] || 0) + Number(s.unitsConsumed);
  });

  // Build grouped table rows from kwh readings
  const dailyRowsMap: Record<string, DailyKwhRow> = {};
  (kwhReadings || []).forEach(r => {
    if (!dailyRowsMap[r.readingDate]) {
      dailyRowsMap[r.readingDate] = {
        date: r.readingDate,
        smartMeter: 0,
        machine: 0,
        notebook: 0,
        appKwh: Number((appKwhByDate[r.readingDate] || 0).toFixed(3)),
        entries: [],
      };
    }
    const row = dailyRowsMap[r.readingDate];
    if (r.source === 'smart_meter') row.smartMeter += r.kwh;
    else if (r.source === 'machine') row.machine += r.kwh;
    else if (r.source === 'notebook') row.notebook += r.kwh;
    row.entries.push({ id: r.id, source: r.source, kwh: r.kwh, notes: r.notes });
  });
  const dailyRows = Object.values(dailyRowsMap).sort((a, b) => b.date.localeCompare(a.date));

  const totalSmartMeter = dailyRows.reduce((sum, r) => sum + r.smartMeter, 0);
  const totalMachine = dailyRows.reduce((sum, r) => sum + r.machine, 0);
  const totalNotebook = dailyRows.reduce((sum, r) => sum + r.notebook, 0);
  const totalAppKwh = dailyRows.reduce((sum, r) => sum + r.appKwh, 0);

  const smartMeterTotalVariance = totalSmartMeter > 0 ? totalSmartMeter - totalAppKwh : 0;
  const machineTotalVariance = totalMachine > 0 ? totalMachine - totalAppKwh : 0;
  const notebookTotalVariance = totalNotebook > 0 ? totalNotebook - totalAppKwh : 0;

  const smartMeterTotalPct = totalAppKwh > 0 ? (Math.abs(smartMeterTotalVariance) / totalAppKwh) * 100 : 0;
  const machineTotalPct = totalAppKwh > 0 ? (Math.abs(machineTotalVariance) / totalAppKwh) * 100 : 0;
  const notebookTotalPct = totalAppKwh > 0 ? (Math.abs(notebookTotalVariance) / totalAppKwh) * 100 : 0;

  const maxTotalPct = Math.max(
    totalSmartMeter > 0 ? smartMeterTotalPct : 0,
    totalMachine > 0 ? machineTotalPct : 0,
    totalNotebook > 0 ? notebookTotalPct : 0
  );

  const grandTotalStatus = maxTotalPct <= 5 ? 'good' : maxTotalPct <= 15 ? 'warning' : 'critical';

  const handleAddKwhReading = async () => {
    const val = parseFloat(kwhValue);
    if (!kwhDate) return toast.error('Please select a date.');
    if (isNaN(val) || val <= 0) return toast.error('Please enter a valid kWh value greater than 0.');
    setSavingKwh(true);
    const res = await addKwhDailyReading({
      reading_date: kwhDate,
      source: kwhSource,
      kwh: val,
      notes: kwhNotes.trim() || undefined,
    });
    setSavingKwh(false);
    if (res.success) {
      toast.success('kWh reading saved!');
      setKwhValue('');
      setKwhNotes('');
      refetchKwh();
    } else {
      toast.error(res.error || 'Failed to save reading.');
    }
  };

  const handleDeleteKwhReading = async (id: string) => {
    setDeletingId(id);
    const res = await deleteKwhDailyReading(id);
    setDeletingId(null);
    if (res.success) {
      toast.success('Reading deleted.');
      refetchKwh();
    } else {
      toast.error(res.error || 'Failed to delete.');
    }
  };

  const handleAnalyze = () => {
    if (dailyRows.length === 0) return toast.error('No readings to analyze yet.');
    const results: AnalysisResult[] = dailyRows.map(row => {
      const refs = [row.smartMeter, row.machine, row.notebook].filter(v => v > 0);
      const maxVariance = refs.length > 0
        ? Math.max(...refs.map(v => Math.abs(v - row.appKwh)))
        : 0;
      const maxPct = refs.length > 0 && row.appKwh > 0
        ? (maxVariance / row.appKwh) * 100
        : 0;
      return {
        date: row.date,
        smartMeterVariance: row.smartMeter > 0 ? row.smartMeter - row.appKwh : 0,
        machineVariance: row.machine > 0 ? row.machine - row.appKwh : 0,
        notebookVariance: row.notebook > 0 ? row.notebook - row.appKwh : 0,
        status: maxPct <= 5 ? 'good' : maxPct <= 15 ? 'warning' : 'critical',
      };
    });
    setAnalysisResult(results);
    toast.success('Analysis complete!');
  };

  const sourceLabel = (s: string) =>
    s === 'smart_meter' ? 'Smart Meter' : s === 'machine' ? 'Charging Machine' : 'Attendant Notebook';
  const sourceBadgeClass = (s: string) =>
    s === 'smart_meter' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      : s === 'machine' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  const varianceClass = (v: number, ref: number) => {
    if (ref === 0) return 'text-slate-500';
    const pct = Math.abs(v) / (ref > 0 ? ref : 1) * 100;
    if (pct <= 5) return 'text-emerald-400';
    if (pct <= 15) return 'text-amber-400';
    return 'text-red-400';
  };
  const getAnalysisForDate = (date: string) => analysisResult?.find(a => a.date === date);

  return (
    <div className="min-h-screen pb-12">
      <TopBar
        title="Energy & Payment Forensic Audit Engine"
        subtitle="C-Suite executive reconciliation cross-auditing grid smart meters, attendant shift logs, SCMS app sessions, and Hubtel gateway settlements"
      />

      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">

        {/* Navigation Tabs (Pill Style) */}
        <div className="flex items-center gap-1.5 p-1 bg-[#161922] border border-slate-800/80 rounded-xl w-full sm:w-fit overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('energy')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'energy'
                ? 'bg-[#00E676] text-slate-950 shadow-md scale-[1.02]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium'
            }`}
          >
            <BarChart2 size={16} />
            <span>Multi-Doc Audit Generator</span>
          </button>

          <button
            onClick={() => setActiveTab('hubtel')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'hubtel'
                ? 'bg-[#00E676] text-slate-950 shadow-md scale-[1.02]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium'
            }`}
          >
            <CreditCard size={16} />
            <span>Hubtel Settlement Gap</span>
          </button>

          <button
            onClick={() => setActiveTab('daily')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'daily'
                ? 'bg-[#00E676] text-slate-950 shadow-md scale-[1.02]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium'
            }`}
          >
            <Zap size={16} />
            <span>Daily kWh Log</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === 'history'
                ? 'bg-[#00E676] text-slate-950 shadow-md scale-[1.02]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium'
            }`}
          >
            <Clock size={16} />
            <span>Audit History ({currentDbRecords.length})</span>
          </button>
        </div>

        {/* ==================== TAB 1: MULTI-DOC AUDIT GENERATOR ==================== */}
        {activeTab === 'energy' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            <div className="stat-card p-4 sm:p-6 space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                    Upload Verification Source Documents (Optional)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload Smart Meter readings, Attendant Notebook logs, or Hubtel payment exports. <span className="text-[#00E676] font-semibold">At least 1 document required to generate CEO report.</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="badge bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
                    {uploadedCount} of 3 Files
                  </span>
                  <button
                    onClick={handleGenerateAuditReport}
                    disabled={uploadedCount === 0 || generatingReport}
                    className="btn bg-[#00E676] text-slate-950 font-extrabold hover:bg-[#00c865] disabled:opacity-40 text-xs gap-2 shadow-lg"
                  >
                    <Sparkles size={15} />
                    {generatingReport ? 'Generating Report...' : 'Generate Audit Report'}
                  </button>
                </div>
              </div>

              {/* 3 Upload Card Dropzones */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Smart Meter Log Card */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 relative group">
                  <input
                    ref={meterRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => handleFileChange(e, 'meter')}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-[#00E676]">
                      <BarChart2 size={20} />
                    </div>
                    {meterFile && (
                      <button onClick={() => setMeterFile(null)} className="text-slate-400 hover:text-red-400 p-1">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">1. Smart Meter Readings</h4>
                    <p className="text-xs text-slate-400">CSV/Excel grid draw consumption log</p>
                  </div>

                  {meterFile ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                      <span className="font-bold text-[#00E676] block truncate">{meterFile.fileName}</span>
                      <span className="text-slate-300 block font-mono">{meterFile.totalKwh?.toFixed(2)} total kWh ({meterFile.dailyRows?.length} rows)</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => meterRef.current?.click()}
                      className="w-full btn btn-secondary text-xs justify-center gap-1.5 py-2.5"
                    >
                      <Upload size={14} /> Upload Smart Meter Sheet
                    </button>
                  )}
                </div>

                {/* 2. Notebook / Attendant Manual Log Card */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 relative group">
                  <input
                    ref={notebookRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => handleFileChange(e, 'notebook')}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
                      <BookOpen size={20} />
                    </div>
                    {notebookFile && (
                      <button onClick={() => setNotebookFile(null)} className="text-slate-400 hover:text-red-400 p-1">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">2. Attendant Notebook Log</h4>
                    <p className="text-xs text-slate-400">Excel/CSV recorded by station shift staff</p>
                  </div>

                  {notebookFile ? (
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs space-y-1">
                      <span className="font-bold text-blue-400 block truncate">{notebookFile.fileName}</span>
                      <span className="text-slate-300 block font-mono">{notebookFile.totalKwh?.toFixed(2)} kWh recorded</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => notebookRef.current?.click()}
                      className="w-full btn btn-secondary text-xs justify-center gap-1.5 py-2.5"
                    >
                      <Upload size={14} /> Upload Notebook Sheet
                    </button>
                  )}
                </div>

                {/* 3. Hubtel Payment History Card */}
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 relative group">
                  <input
                    ref={hubtelRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => handleFileChange(e, 'hubtel')}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                      <CreditCard size={20} />
                    </div>
                    {hubtelFile && (
                      <button onClick={() => setHubtelFile(null)} className="text-slate-400 hover:text-red-400 p-1">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">3. Hubtel Payment History</h4>
                    <p className="text-xs text-slate-400">Excel/CSV export from Hubtel portal</p>
                  </div>

                  {hubtelFile ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                      <span className="font-bold text-amber-400 block truncate">{hubtelFile.fileName}</span>
                      <span className="text-slate-300 block font-mono">GHS {hubtelFile.totalAmount?.toFixed(2)} ({hubtelFile.totalCount} tx)</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => hubtelRef.current?.click()}
                      className="w-full btn btn-secondary text-xs justify-center gap-1.5 py-2.5"
                    >
                      <Upload size={14} /> Upload Hubtel Export
                    </button>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: DAILY KWH LOG ==================== */}
        {activeTab === 'daily' && (
          <div className="space-y-6 animate-in fade-in duration-200">

            {/* Entry Form */}
            <div className="stat-card p-4 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <PlusCircle size={18} className="text-[#00E676]" />
                    Log Daily kWh Reading
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter kWh consumed per source per day. Multiple entries per date are allowed.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</label>
                  <input
                    type="date"
                    value={kwhDate}
                    onChange={e => setKwhDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00E676] transition-colors"
                  />
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Source</label>
                  <select
                    value={kwhSource}
                    onChange={e => setKwhSource(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00E676] transition-colors"
                  >
                    <option value="smart_meter">Smart Meter</option>
                    <option value="machine">Charging Machine</option>
                    <option value="notebook">Attendant Notebook</option>
                  </select>
                </div>

                {/* kWh value */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">kWh Consumed</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="e.g. 12.500"
                    value={kwhValue}
                    onChange={e => setKwhValue(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00E676] transition-colors"
                  />
                </div>

                {/* Save button */}
                <button
                  onClick={handleAddKwhReading}
                  disabled={savingKwh}
                  className="btn bg-[#00E676] text-slate-950 font-extrabold hover:bg-[#00c865] disabled:opacity-40 gap-2 text-sm py-2.5"
                >
                  <PlusCircle size={15} />
                  {savingKwh ? 'Saving...' : 'Add Reading'}
                </button>
              </div>

              {/* Optional notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Morning shift reading, Meter ID 04..."
                  value={kwhNotes}
                  onChange={e => setKwhNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00E676] transition-colors"
                />
              </div>
            </div>

            {/* Comparison Table */}
            <div className="stat-card p-4 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <BarChart2 size={18} className="text-[#00E676]" />
                    kWh Comparison Table
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Aggregated daily readings from each source vs SCMS app recorded kWh.
                  </p>
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={dailyRows.length === 0}
                  className="btn bg-purple-600 hover:bg-purple-700 text-white font-extrabold disabled:opacity-40 gap-2 text-sm px-5 py-2.5 shadow-lg"
                >
                  <FlaskConical size={15} />
                  Analyze
                </button>
              </div>

              {dailyRows.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500 mx-auto">
                    <Zap size={28} />
                  </div>
                  <p className="text-sm font-medium text-slate-400">No readings yet. Add your first kWh entry above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800">
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide w-10"></th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Date</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-emerald-400 uppercase tracking-wide">
                          <div className="flex items-center justify-end gap-1.5"><BarChart2 size={12} /> Smart Meter</div>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-purple-400 uppercase tracking-wide">
                          <div className="flex items-center justify-end gap-1.5"><Zap size={12} /> Machine</div>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-blue-400 uppercase tracking-wide">
                          <div className="flex items-center justify-end gap-1.5"><BookOpen size={12} /> Notebook</div>
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-[#00E676] uppercase tracking-wide">
                          <div className="flex items-center justify-end gap-1.5"><Smartphone size={12} /> App (SCMS)</div>
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {dailyRows.map(row => {
                        const analysis = getAnalysisForDate(row.date);
                        const isExpanded = expandedDates.has(row.date);
                        const toggleExpand = () => {
                          setExpandedDates(prev => {
                            const next = new Set(prev);
                            if (next.has(row.date)) next.delete(row.date);
                            else next.add(row.date);
                            return next;
                          });
                        };
                        return (
                          <>
                            {/* Summary row */}
                            <tr key={row.date} className="hover:bg-slate-900/40 transition-colors cursor-pointer" onClick={toggleExpand}>
                              <td className="px-4 py-3 text-slate-500">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="px-4 py-3 font-bold text-white font-mono">
                                {new Date(row.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                <span className="ml-2 text-xs text-slate-500 font-normal">{row.entries.length} entr{row.entries.length === 1 ? 'y' : 'ies'}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-300">
                                {row.smartMeter > 0 ? `${row.smartMeter.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                                {analysis && row.smartMeter > 0 && (
                                  <div className={`text-xs ${varianceClass(analysis.smartMeterVariance, row.appKwh)}`}>
                                    {analysis.smartMeterVariance >= 0 ? '+' : ''}{analysis.smartMeterVariance.toFixed(3)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-purple-300">
                                {row.machine > 0 ? `${row.machine.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                                {analysis && row.machine > 0 && (
                                  <div className={`text-xs ${varianceClass(analysis.machineVariance, row.appKwh)}`}>
                                    {analysis.machineVariance >= 0 ? '+' : ''}{analysis.machineVariance.toFixed(3)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-blue-300">
                                {row.notebook > 0 ? `${row.notebook.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                                {analysis && row.notebook > 0 && (
                                  <div className={`text-xs ${varianceClass(analysis.notebookVariance, row.appKwh)}`}>
                                    {analysis.notebookVariance >= 0 ? '+' : ''}{analysis.notebookVariance.toFixed(3)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-[#00E676]">
                                {row.appKwh > 0 ? `${row.appKwh.toFixed(3)} kWh` : <span className="text-slate-600">0.000</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {!analysis ? (
                                  <span className="text-xs text-slate-600">—</span>
                                ) : analysis.status === 'good' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle size={11} /> Good
                                  </span>
                                ) : analysis.status === 'warning' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                    <AlertTriangle size={11} /> Warning
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                                    <ShieldAlert size={11} /> Critical
                                  </span>
                                )}
                              </td>
                            </tr>

                            {/* Expanded individual entries */}
                            {isExpanded && row.entries.map(entry => (
                              <tr key={entry.id} className="bg-slate-950/60 border-t border-slate-800/40">
                                <td className="px-4 py-2.5"></td>
                                <td className="px-4 py-2.5 pl-8" colSpan={2}>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${sourceBadgeClass(entry.source)}`}>
                                    {sourceLabel(entry.source)}
                                  </span>
                                  {entry.notes && <span className="ml-2 text-xs text-slate-500">{entry.notes}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-300 text-xs" colSpan={3}>
                                  {entry.kwh.toFixed(3)} kWh
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDeleteKwhReading(entry.id); }}
                                    disabled={deletingId === entry.id}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                      {/* Grand Total Row */}
                      {dailyRows.length > 0 && (
                        <tr className="bg-slate-900/90 font-extrabold border-t-2 border-slate-700">
                          <td className="px-4 py-4"></td>
                          <td className="px-4 py-4 text-white text-sm uppercase tracking-wider">
                            Grand Total
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-emerald-300 text-sm">
                            {totalSmartMeter > 0 ? `${totalSmartMeter.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                            {totalSmartMeter > 0 && (
                              <div className={`text-xs font-bold ${varianceClass(smartMeterTotalVariance, totalAppKwh)}`}>
                                {smartMeterTotalVariance >= 0 ? '+' : ''}{smartMeterTotalVariance.toFixed(3)} ({smartMeterTotalVariance >= 0 ? '+' : ''}{smartMeterTotalPct.toFixed(1)}%)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-purple-300 text-sm">
                            {totalMachine > 0 ? `${totalMachine.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                            {totalMachine > 0 && (
                              <div className={`text-xs font-bold ${varianceClass(machineTotalVariance, totalAppKwh)}`}>
                                {machineTotalVariance >= 0 ? '+' : ''}{machineTotalVariance.toFixed(3)} ({machineTotalVariance >= 0 ? '+' : ''}{machineTotalPct.toFixed(1)}%)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-blue-300 text-sm">
                            {totalNotebook > 0 ? `${totalNotebook.toFixed(3)} kWh` : <span className="text-slate-600">—</span>}
                            {totalNotebook > 0 && (
                              <div className={`text-xs font-bold ${varianceClass(notebookTotalVariance, totalAppKwh)}`}>
                                {notebookTotalVariance >= 0 ? '+' : ''}{notebookTotalVariance.toFixed(3)} ({notebookTotalVariance >= 0 ? '+' : ''}{notebookTotalPct.toFixed(1)}%)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[#00E676] text-sm">
                            {totalAppKwh > 0 ? `${totalAppKwh.toFixed(3)} kWh` : <span className="text-slate-600">0.000</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {grandTotalStatus === 'good' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle size={11} /> Good
                              </span>
                            ) : grandTotalStatus === 'warning' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <AlertTriangle size={11} /> Warning
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-500/15 text-red-400 border border-red-500/30">
                                <ShieldAlert size={11} /> Critical
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Analysis Summary Cards */}
              {analysisResult && analysisResult.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                    <FlaskConical size={16} />
                    <span>Variance Analysis Summary</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Smart Meter total variance */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-500/20 space-y-1">
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1"><BarChart2 size={12} /> Smart Meter vs App</span>
                      <div className="text-xl font-black font-mono text-white">
                        {analysisResult.reduce((s, a) => s + a.smartMeterVariance, 0).toFixed(3)} kWh
                      </div>
                      <div className="text-xs text-slate-400">Total accumulated variance</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-purple-500/20 space-y-1">
                      <span className="text-xs font-semibold text-purple-400 flex items-center gap-1"><Zap size={12} /> Machine vs App</span>
                      <div className="text-xl font-black font-mono text-white">
                        {analysisResult.reduce((s, a) => s + a.machineVariance, 0).toFixed(3)} kWh
                      </div>
                      <div className="text-xs text-slate-400">Total accumulated variance</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-blue-500/20 space-y-1">
                      <span className="text-xs font-semibold text-blue-400 flex items-center gap-1"><BookOpen size={12} /> Notebook vs App</span>
                      <div className="text-xl font-black font-mono text-white">
                        {analysisResult.reduce((s, a) => s + a.notebookVariance, 0).toFixed(3)} kWh
                      </div>
                      <div className="text-xs text-slate-400">Total accumulated variance</div>
                    </div>
                  </div>
                  {/* Days breakdown */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                    <div className="flex gap-6 text-slate-400 font-semibold">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span> Good (≤5% diff): {analysisResult.filter(a => a.status === 'good').length} days</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> Warning (5–15%): {analysisResult.filter(a => a.status === 'warning').length} days</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span> Critical (&gt;15%): {analysisResult.filter(a => a.status === 'critical').length} days</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: HUBTEL SETTLEMENT GAP ==================== */}
        {activeTab === 'hubtel' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="stat-card p-4 sm:p-6 space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    Hubtel Payment Processor Reconciliation
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                    Live calculation: App-tracked customer sales vs Hubtel collected payment gateway settlements
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs sm:text-sm shadow-sm whitespace-nowrap self-start sm:self-auto">
                  <span>GHS {liveGapAmount.toFixed(2)} Discrepancy ({liveGapPct.toFixed(1)}%)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">App Tracked Sales</span>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono mb-1">
                    GHS {totalAppRevenueLive.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">Recorded in app sessions</div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">Hubtel Gross Collected</span>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono mb-1">
                    GHS {hubtelCollectedLive.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">{(payments || []).length} successful payments</div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">Hubtel Net Received</span>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono mb-1">
                    GHS {(hubtelCollectedLive * 0.99).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">After ~1.0% processing fee</div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">Unmatched Gap</span>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono mb-1">
                    GHS {liveGapAmount.toFixed(2)}
                  </div>
                  <div className="text-xs text-red-400 font-bold">{liveGapPct.toFixed(1)}% Gap requires matching</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: AUDIT HISTORY ==================== */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Uploaded Audit History
              </h2>

              <div className="w-full sm:w-auto min-w-[320px]">
                <select
                  value={selectedAuditId}
                  onChange={(e) => setSelectedAuditId(e.target.value)}
                  className="w-full bg-[#090d16] text-white border-2 border-[#00E676] rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00E676]/60 shadow-lg cursor-pointer transition-all"
                >
                  <option value="">Select an executive audit report to view details</option>
                  {currentDbRecords.map((r: any) => {
                    let name = `Audit Record (${new Date(r.periodStart).toLocaleDateString()} - ${new Date(r.periodEnd).toLocaleDateString()})`;
                    if (r.notes) {
                      try {
                        const parsed = JSON.parse(r.notes);
                        if (parsed.primaryTitle) name = `${parsed.primaryTitle} (${new Date(r.periodStart).toLocaleDateString()})`;
                      } catch (e) {}
                    }
                    return (
                      <option key={r.id} value={r.id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Audit History Container & Exports */}
            <div className="stat-card p-4 sm:p-8 min-h-[400px] bg-[#090d16]">
              {!selectedAuditId || !selectedRecord ? (
                <div className="text-center space-y-4 max-w-md mx-auto py-16">
                  <div className="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-500 mx-auto">
                    <Clock size={32} />
                  </div>
                  {currentDbRecords.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-white">No uploaded audit reports found in history</p>
                      <p className="text-xs text-slate-400">
                        Upload documents in Tab 1 to generate and archive your first report.
                      </p>
                      <button
                        onClick={() => setActiveTab('energy')}
                        className="btn bg-[#00E676] text-slate-950 font-bold hover:bg-[#00c865] text-xs gap-1.5 mt-2"
                      >
                        <Upload size={14} /> Upload Audit Files
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-400">
                      Select an audit record from the green dropdown menu above to view the C-Suite Executive Report
                    </p>
                  )}
                </div>
              ) : (
                /* Full Executive Audit Report Document View */
                <div className="w-full space-y-6 animate-in fade-in duration-300" ref={reportRef}>
                  
                  {/* Executive Header Banner */}
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/40 space-y-4 shadow-2xl">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-[#00E676] border border-emerald-500/30">
                            {parsedReportMeta?.aiAnalysis?.auditGrade || 'B (Minor Variance)'}
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            CONFIDENTIAL • CEO & BOARD DIRECTIVE
                          </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                          SPERO EV INFRASTRUCTURE FORENSIC AUDIT
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-400 mt-1">
                          Primary Source: <span className="text-white font-semibold">{parsedReportMeta?.primaryTitle || 'Multi-Source Audit'}</span> • Period: {new Date(selectedRecord.periodStart).toLocaleDateString()} – {new Date(selectedRecord.periodEnd).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Export Actions */}
                      <div className="flex flex-wrap gap-2.5 self-start md:self-auto">
                        <button
                          onClick={() => handleExportExcel(parsedReportMeta || selectedRecord)}
                          className="btn bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-bold text-xs gap-2 py-2.5 px-4 shadow-lg"
                        >
                          <FileSpreadsheet size={16} /> Export Excel Workbook (.xlsx)
                        </button>
                        <button
                          onClick={handleExportPDF}
                          className="btn bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs gap-2 py-2.5 px-4 shadow-lg"
                        >
                          <Download size={16} /> Export Executive PDF
                        </button>
                      </div>
                    </div>

                    {/* CEO Scorecard Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">Grid Power Draw</span>
                        <span className="text-lg font-black font-mono text-white">
                          {parsedReportMeta?.smartMeter?.totalKwh ? `${parsedReportMeta.smartMeter.totalKwh.toFixed(2)} kWh` : 'N/A'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">Notebook Record</span>
                        <span className="text-lg font-black font-mono text-blue-400">
                          {parsedReportMeta?.notebook?.totalKwh ? `${parsedReportMeta.notebook.totalKwh.toFixed(2)} kWh` : 'N/A'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">SCMS Energy Sold</span>
                        <span className="text-lg font-black font-mono text-emerald-400">
                          {selectedRecord.appKwh.toFixed(2)} kWh
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">Recorded Sales</span>
                        <span className="text-lg font-black font-mono text-white">
                          GHS {parsedReportMeta?.appRevenueGhs?.toFixed(2) || '0.00'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">Hubtel Export</span>
                        <span className="text-lg font-black font-mono text-amber-400">
                          {parsedReportMeta?.hubtel?.totalAmount ? `GHS ${parsedReportMeta.hubtel.totalAmount.toFixed(2)}` : 'N/A'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">Net Revenue Gap</span>
                        <span className="text-lg font-black font-mono text-red-400">
                          GHS {parsedReportMeta?.aiAnalysis?.financialLeakageGhs !== undefined ? parsedReportMeta.aiAnalysis.financialLeakageGhs.toFixed(2) : '0.00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Executive Board Summary */}
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-[#00E676] font-extrabold text-base border-b border-slate-800 pb-2.5">
                      <Sparkles size={18} />
                      <span>1. Executive Board Summary</span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed font-medium">
                      {parsedReportMeta?.aiAnalysis?.summary || 'Executive summary unavailable.'}
                    </p>
                  </div>

                  {/* Section 2 & 3: Technical Energy & Revenue Integrity Audits */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-blue-400 font-extrabold text-base border-b border-slate-800 pb-2.5">
                        <Activity size={18} />
                        <span>2. Technical Energy & Line Loss Audit</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {parsedReportMeta?.aiAnalysis?.energyAnalysis || 'Technical energy analysis unavailable.'}
                      </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base border-b border-slate-800 pb-2.5">
                        <DollarSign size={18} />
                        <span>3. Revenue Integrity & Gateway Audit</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {parsedReportMeta?.aiAnalysis?.financialAnalysis || 'Financial settlement analysis unavailable.'}
                      </p>
                    </div>

                  </div>

                  {/* Section 4: Forensic Operational Risk Assessment */}
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-purple-400 font-extrabold text-base border-b border-slate-800 pb-2.5">
                      <ShieldAlert size={18} />
                      <span>4. Forensic Operational Risk Assessment</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {parsedReportMeta?.aiAnalysis?.forensicRiskAssessment || 'Forensic risk assessment unavailable.'}
                    </p>
                  </div>

                  {/* Section 5 & 6: Root Causes & Strategic Action Plan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Root Causes */}
                    <div className="p-6 rounded-2xl bg-slate-900/80 border border-[#00E676]/20 space-y-3">
                      <div className="flex items-center gap-2 text-red-400 font-extrabold text-base border-b border-slate-800 pb-2.5">
                        <AlertTriangle size={18} />
                        <span>5. Identified Forensic Root Causes</span>
                      </div>
                      <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                        {(parsedReportMeta?.aiAnalysis?.rootCauses || []).map((cause: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-red-400 font-bold">•</span>
                            <span>{cause}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Recommendations */}
                    <div className="p-6 rounded-2xl bg-slate-900/80 border border-[#00E676]/20 space-y-3">
                      <div className="flex items-center gap-2 text-[#00E676] font-extrabold text-base border-b border-slate-800 pb-2.5">
                        <CheckCircle size={18} />
                        <span>6. Prioritized Recommendations for CEO</span>
                      </div>
                      <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
                        {(parsedReportMeta?.aiAnalysis?.recommendations || []).map((rec: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-[#00E676] font-bold">✓</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>

                  {/* C-Suite Audit Sign-off Block */}
                  <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400">
                    <div>
                      <span className="font-bold text-white block">Audit Verified & Authored By:</span>
                      <span>{parsedReportMeta?.aiAnalysis?.provider || 'SCMS Automated Reconciliation Engine'}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-white block">Report Prepared For:</span>
                      <span>Chief Executive Officer (CEO) & Board of Directors</span>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
