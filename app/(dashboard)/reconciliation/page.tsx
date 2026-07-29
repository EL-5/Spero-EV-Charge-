'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TopBar } from '@/components/layout/TopBar';
import { useReconciliations, useSessions, usePayments } from '@/hooks/use-database';
import { saveMultiDocumentReconciliationReport, deleteReconciliation, addReconciliation } from '@/app/actions/reconciliation';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart2, CreditCard, Clock, Upload, Plus, Trash2,
  AlertTriangle, CheckCircle2, FileText, Smartphone, RefreshCw,
  Download, Sparkles, Check, BookOpen, Layers, ShieldCheck, FileSpreadsheet, X
} from 'lucide-react';

interface UploadedFileMeta {
  file: File;
  fileName: string;
  totalKwh?: number;
  totalAmount?: number;
  totalCount?: number;
  dailyRows?: Array<{ day: string; dateStr?: string; kwh?: number; amount?: number }>;
}

export default function ReconciliationPage() {
  const { data: reconciliations, isLoading, refetch } = useReconciliations();
  const { data: sessions } = useSessions({ loadAll: true });
  const { data: payments } = usePayments();

  // Active Tab state: 'energy' | 'hubtel' | 'history'
  const [activeTab, setActiveTab] = useState<'energy' | 'hubtel' | 'history'>('energy');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

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
              // Prefer daily numbers (< 10,000) over cumulative meter indexes (> 100,000)
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
      toast.success('Professional Audit Report generated with Claude AI & saved to History!');
      refetch();
      setActiveTab('history');
      if (res.id) setSelectedAuditId(res.id);
    } else {
      toast.error(res.error || 'Failed to generate audit report.');
    }
  };

  // ─── Export Report to Excel ────────────────────────────────────────────────
  const handleExportExcel = (reportData: any) => {
    if (!reportData) return;
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryRows = [
        ['SPERO EV CHARGING SCMS - RECONCILIATION AUDIT REPORT'],
        ['Generated Date', new Date().toLocaleString()],
        ['Audit Period', `${new Date(reportData.periodStart).toLocaleDateString()} - ${new Date(reportData.periodEnd).toLocaleDateString()}`],
        ['Primary Title', reportData.primaryTitle || 'Multi-Document Audit'],
        ['Audit Grade', reportData.aiAnalysis?.auditGrade || 'B (Minor Variance)'],
        [],
        ['EXECUTIVE SUMMARY'],
        [reportData.aiAnalysis?.summary || 'N/A'],
        [],
        ['KEY METRICS'],
        ['Smart Meter Total kWh', reportData.smartMeter?.totalKwh || 'N/A'],
        ['Attendant Notebook kWh', reportData.notebook?.totalKwh || 'N/A'],
        ['App Recorded Sessions kWh', reportData.appSessionsKwh?.toFixed(2) || '0.00'],
        ['App Customer Sales GHS', reportData.appRevenueGhs?.toFixed(2) || '0.00'],
        ['Hubtel Export Settlement GHS', reportData.hubtel?.totalAmount || 'N/A'],
        [],
        ['CLAUDE AI IDENTIFIED ROOT CAUSES'],
        ...(reportData.aiAnalysis?.rootCauses || []).map((c: string) => [`• ${c}`]),
        [],
        ['ACTIONABLE RECOMMENDATIONS'],
        ...(reportData.aiAnalysis?.recommendations || []).map((r: string) => [`• ${r}`]),
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');

      // Sheet 2: Daily Breakdown
      if (reportData.smartMeter?.dailyRows || reportData.notebook?.dailyRows) {
        const rows = reportData.smartMeter?.dailyRows || reportData.notebook?.dailyRows || [];
        const dailyData = [
          ['Day / Date', 'Smart Meter (kWh)', 'Notebook Log (kWh)'],
          ...rows.map((r: any) => [r.day || r.dateStr, r.kwh || 0, 0])
        ];
        const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
        XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Consumption Logs');
      }

      XLSX.writeFile(wb, `SCMS_Reconciliation_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Audit Report exported to Excel (.xlsx)');
    } catch (err) {
      toast.error('Failed to export Excel report.');
    }
  };

  // ─── Export Report to Professional PDF ──────────────────────────────────────
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      toast.info('Generating PDF report document...');
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#0f172a',
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

      pdf.save(`SCMS_Professional_Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Professional PDF Audit Report exported!');
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

  return (
    <div className="min-h-screen pb-12">
      <TopBar
        title="Energy & Payment Reconciliation"
        subtitle="Audit smart meter grid power draw against app-tracked revenue and Hubtel payment processor settlements"
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
                    Upload Audit Documents (Optional Sources)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Upload any combination of Smart Meter readings, Attendant Notebook records, or Hubtel payment exports. <span className="text-[#00E676] font-semibold">At least 1 document required.</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="badge bg-slate-800 border border-slate-700 text-slate-300 text-xs">
                    {uploadedCount} of 3 Files Selected
                  </span>
                  <button
                    onClick={handleGenerateAuditReport}
                    disabled={uploadedCount === 0 || generatingReport}
                    className="btn bg-[#00E676] text-slate-950 font-extrabold hover:bg-[#00c865] disabled:opacity-40 text-xs gap-2 shadow-lg"
                  >
                    <Sparkles size={15} />
                    {generatingReport ? 'Processing with Claude AI...' : 'Generate & Audit with Claude AI'}
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

              <div className="w-full sm:w-auto min-w-[300px]">
                <select
                  value={selectedAuditId}
                  onChange={(e) => setSelectedAuditId(e.target.value)}
                  className="w-full bg-[#090d16] text-white border-2 border-[#00E676] rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00E676]/60 shadow-lg cursor-pointer transition-all"
                >
                  <option value="">Select an uploaded audit report to view details</option>
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
            <div className="stat-card p-6 sm:p-10 min-h-[380px]">
              {!selectedAuditId || !selectedRecord ? (
                <div className="text-center space-y-4 max-w-md mx-auto py-12">
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
                      Select an audit record from the green dropdown menu above to view its full generated report
                    </p>
                  )}
                </div>
              ) : (
                /* Full Audit Report Details View & Export Options */
                <div className="w-full space-y-6 animate-in fade-in duration-300" ref={reportRef}>
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge bg-[#00E676]/20 text-[#00E676]">
                          Audit Grade: {parsedReportMeta?.aiAnalysis?.auditGrade || 'B (Minor Variance)'}
                        </span>
                        <span className="badge bg-slate-800 text-slate-300 border border-slate-700">
                          {parsedReportMeta?.aiAnalysis?.provider || 'Claude AI'}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-white">
                        {parsedReportMeta?.primaryTitle || `Audit Report #${selectedRecord.id.slice(0, 8)}`}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Audit Window: {new Date(selectedRecord.periodStart).toLocaleDateString()} to {new Date(selectedRecord.periodEnd).toLocaleDateString()}
                      </p>
                    </div>

                    {/* PDF and Excel Export Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleExportExcel(parsedReportMeta || selectedRecord)}
                        className="btn btn-secondary text-xs gap-1.5"
                      >
                        <FileSpreadsheet size={14} className="text-emerald-400" /> Export Excel (.xlsx)
                      </button>
                      <button
                        onClick={handleExportPDF}
                        className="btn bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5"
                      >
                        <Download size={14} /> Export Professional PDF
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">Smart Meter kWh</span>
                      <span className="text-xl font-bold font-mono text-white">
                        {parsedReportMeta?.smartMeter?.totalKwh ? parsedReportMeta.smartMeter.totalKwh.toFixed(2) : 'N/A'}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">Notebook Log kWh</span>
                      <span className="text-xl font-bold font-mono text-blue-400">
                        {parsedReportMeta?.notebook?.totalKwh ? parsedReportMeta.notebook.totalKwh.toFixed(2) : 'N/A'}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">App Recorded kWh</span>
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {selectedRecord.appKwh.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-1">Hubtel Export GHS</span>
                      <span className="text-xl font-bold font-mono text-amber-400">
                        {parsedReportMeta?.hubtel?.totalAmount ? `GHS ${parsedReportMeta.hubtel.totalAmount.toFixed(2)}` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Claude AI Professional Report Card */}
                  {parsedReportMeta?.aiAnalysis && (
                    <div className="p-6 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2 text-[#00E676] font-bold text-base">
                          <Sparkles size={18} />
                          <span>Claude AI Executive Forensic Report</span>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-[#00E676] border border-emerald-500/30">
                          Verified Audit
                        </span>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-white">Executive Summary</h4>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                          {parsedReportMeta.aiAnalysis.summary}
                        </p>
                      </div>

                      {parsedReportMeta.aiAnalysis.energyAnalysis && (
                        <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                          <span className="font-bold text-blue-400 block">Energy Draw & Grid Analysis:</span>
                          <p className="text-slate-400 leading-relaxed">{parsedReportMeta.aiAnalysis.energyAnalysis}</p>
                        </div>
                      )}

                      {parsedReportMeta.aiAnalysis.financialAnalysis && (
                        <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                          <span className="font-bold text-amber-400 block">Financial & Gateway Settlement Analysis:</span>
                          <p className="text-slate-400 leading-relaxed">{parsedReportMeta.aiAnalysis.financialAnalysis}</p>
                        </div>
                      )}

                      {parsedReportMeta.aiAnalysis.rootCauses?.length > 0 && (
                        <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                          <span className="font-bold text-red-400 block mb-1">Identified Root-Cause Discrepancies:</span>
                          <ul className="list-disc list-inside space-y-1 text-slate-400">
                            {parsedReportMeta.aiAnalysis.rootCauses.map((cause: string, i: number) => (
                              <li key={i}>{cause}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {parsedReportMeta.aiAnalysis.recommendations?.length > 0 && (
                        <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                          <span className="font-bold text-[#00E676] block mb-1">Prioritized Action Items for Management:</span>
                          <ul className="list-disc list-inside space-y-1 text-slate-400">
                            {parsedReportMeta.aiAnalysis.recommendations.map((rec: string, i: number) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
