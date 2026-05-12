'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { useSessions, useSettings } from '@/hooks/use-database';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Search, Printer, Download, Share2, Eye, X, Calendar } from 'lucide-react';
import type { Session } from '@/lib/types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function ReceiptsPage() {
  const { data: sessions, isLoading } = useSessions({ limit: 100 });
  const { data: settings } = useSettings();
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  
  const config = settings?.receipt_config || {};
  const stationName = settings?.company_name || 'SPERO ENERGY RESOURCES LTD';
  const logoUrl = settings?.logo_url || '/spero-logo.png';
  const headerTitle = config.headerTitle || 'EV Charging Station Receipt';
  const footerMessage = settings?.receipt_footer || 'Powered by SCMS — Spero EV';

  const completedSessions = sessions?.filter(s => s.status === 'completed') || [];
  
  const filteredSessions = completedSessions.filter(s => 
    s.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
    s.driverName.toLowerCase().includes(search.toLowerCase()) ||
    s.vehiclePlate.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = () => {
    window.print();
  };

  const generatePDFBlob = async (session: Session) => {
    const element = document.getElementById('printable-receipt');
    if (!element) {
      console.error('Receipt element not found');
      return null;
    }

    try {
      // Small delay to ensure DOM is ready and images are painted
      await new Promise(resolve => setTimeout(resolve, 150));

      const canvas = await html2canvas(element, {
        scale: 3, // Higher scale for better text clarity
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const imgProps = { width: canvas.width, height: canvas.height };
      
      const pdfWidth = 80; // Standard 80mm
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      return { 
        blob: pdf.output('blob'), 
        filename: `Receipt-${session.receiptNumber}.pdf`,
        pdfObj: pdf
      };
    } catch (error) {
      console.error('PDF Generation Error:', error);
      return null;
    }
  };

  const handleDownloadPDF = async (session: Session) => {
    toast.loading('Generating PDF...', { id: 'pdf-gen' });
    const result = await generatePDFBlob(session);
    if (result) {
      result.pdfObj.save(result.filename);
      toast.success('Receipt downloaded successfully', { id: 'pdf-gen' });
    } else {
      toast.error('Failed to generate PDF', { id: 'pdf-gen' });
    }
  };

  const handleShareWhatsApp = async (session: Session) => {
    toast.loading('Preparing receipt for sharing...', { id: 'pdf-share' });
    const result = await generatePDFBlob(session);
    
    if (!result) {
      toast.error('Could not prepare PDF. Sending text instead.', { id: 'pdf-share' });
      const message = `*${stationName}*%0A*Receipt #:* ${session.receiptNumber}%0A*Total:* GHS ${session.totalAmount}`;
      window.open(`https://wa.me/?text=${message}`, '_blank');
      return;
    }

    const file = new File([result.blob], result.filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Receipt ${session.receiptNumber}`,
          text: `Charging Receipt from ${stationName}`,
        });
        toast.success('Shared successfully', { id: 'pdf-share' });
      } catch (err) {
        console.error('Sharing failed', err);
        // Fallback to normal text share if user cancels or it fails
        const message = `*${stationName}*%0A*Receipt #:* ${session.receiptNumber}%0A*Total:* GHS ${session.totalAmount}`;
        window.open(`https://wa.me/?text=${message}`, '_blank');
        toast.dismiss('pdf-share');
      }
    } else {
      toast.info('Direct file sharing not supported. Downloading instead.', { id: 'pdf-share' });
      result.pdfObj.save(result.filename);
    }
  };

  return (
    <div className="min-h-screen pb-10">
      <TopBar title="Receipts Dashboard" subtitle="View, print and share charging records" />
      
      <div className="p-6">
        {/* Search & Actions */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by receipt #, driver or plate..." 
              className="form-input pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Receipts Table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400">Receipt #</th>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400">Driver</th>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400">Vehicle</th>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400">Total</th>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400">Date</th>
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">Loading records...</td></tr>
                ) : filteredSessions.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No completed sessions found.</td></tr>
                ) : (
                  filteredSessions.map((session) => (
                    <tr key={session.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 font-mono text-sm font-bold text-blue-600">{session.receiptNumber}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{session.driverName}</div>
                        <div className="text-[10px] text-slate-400 uppercase">Driver</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{session.vehiclePlate}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{formatCurrency(session.totalAmount || 0)}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{formatDateTime(session.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => setSelectedSession(session)}
                            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleShareWhatsApp(session)}
                            className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors"
                            title="Share on WhatsApp"
                          >
                            <Share2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── RECEIPT PREVIEW MODAL ─── */}
      {selectedSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[340px] w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Receipt Preview</span>
              <button 
                onClick={() => setSelectedSession(null)}
                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Receipt Content (printable area) */}
            <div id="printable-receipt" className="p-6 print-visible" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>
              <div className="text-center mb-6">
                {config.showLogo !== false && (
                  <div className="flex justify-center mb-3">
                    <img 
                      src={logoUrl} 
                      alt="Logo" 
                      style={{ width: `${config.logoSize || 40}px`, height: 'auto' }} 
                      className="object-contain" 
                    />
                  </div>
                )}
                <h1 className="text-lg font-black leading-none uppercase tracking-tight break-words" style={{ color: '#0f172a' }}>{stationName}</h1>
                <p className="text-[9px] uppercase tracking-widest mt-1.5 leading-tight" style={{ color: '#64748b' }}>{headerTitle}</p>
              </div>

              <div className="space-y-3 mb-6 border-t border-b border-dashed py-4" style={{ borderColor: '#e2e8f0' }}>
                <div className="flex justify-between items-start gap-4">
                  <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Receipt #</span>
                  <span className="text-[13px] font-bold break-all text-right" style={{ color: '#0f172a' }}>{selectedSession.receiptNumber}</span>
                </div>
                
                {config.showDate !== false && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Date</span>
                    <span className="text-[13px] font-bold text-right" style={{ color: '#0f172a' }}>{formatDateTime(selectedSession.createdAt)}</span>
                  </div>
                )}

                {config.showDriver !== false && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Driver</span>
                    <span className="text-[13px] font-bold break-words text-right" style={{ color: '#0f172a' }}>{selectedSession.driverName}</span>
                  </div>
                )}

                {config.showVehicle !== false && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Vehicle</span>
                    <span className="text-[13px] font-bold break-words text-right" style={{ color: '#0f172a' }}>{selectedSession.vehiclePlate}</span>
                  </div>
                )}

                {config.showUnits !== false && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Units</span>
                    <span className="text-[13px] font-bold text-right" style={{ color: '#0f172a' }}>{selectedSession.unitsConsumed} {selectedSession.unitType}</span>
                  </div>
                )}

                {config.showRate !== false && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] font-medium uppercase shrink-0" style={{ color: '#94a3b8' }}>Rate</span>
                    <span className="text-[13px] font-bold text-right" style={{ color: '#0f172a' }}>GHS {selectedSession.rateAtTime}/{selectedSession.unitType}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1 mb-6">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#0f172a' }}>Total</span>
                  <span className="text-base font-black" style={{ color: '#0f172a' }}>GHS {selectedSession.totalAmount?.toFixed(2)}</span>
                </div>
                {config.showPaymentMethod !== false && (
                  <div className="flex justify-between text-xs">
                    <span className="font-medium" style={{ color: '#94a3b8' }}>Method</span>
                    <span className="font-bold capitalize" style={{ color: '#64748b' }}>{selectedSession.paymentMethod || 'N/A'}</span>
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-[10px] italic font-medium leading-relaxed" style={{ color: '#94a3b8' }}>{footerMessage}</p>
                <p className="text-[8px] mt-2 font-mono uppercase tracking-tighter" style={{ color: '#cbd5e1' }}>Verified by Spero Fleet SCMS</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-slate-50 flex gap-2 border-t border-slate-100">
              <button 
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Printer size={14} /> Print
              </button>
              <button 
                onClick={() => handleDownloadPDF(selectedSession)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Download size={14} /> PDF
              </button>
              <button 
                onClick={() => handleShareWhatsApp(selectedSession)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 rounded-xl text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
              >
                <Share2 size={14} /> WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Print Styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything except the receipt */
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }

          /* Reset page layout for thermal rolls */
          @page {
            margin: 0;
            size: auto;
          }

          #printable-receipt {
            position: fixed;
            left: 0;
            top: 0;
            width: 80mm; /* Standard thermal width */
            padding: 5mm;
            margin: 0;
            background: white;
            font-family: 'Courier New', Courier, monospace; /* Use monospaced for alignment */
            color: black !important;
            -webkit-print-color-adjust: exact;
          }

          /* Force black text for thermal high-contrast */
          #printable-receipt * {
            color: black !important;
            border-color: black !important;
          }

          /* Optimize Logo for Thermal */
          #printable-receipt img {
            max-width: 40mm;
            filter: contrast(150%);
            margin-bottom: 2mm;
          }

          /* Tighten spacing */
          .mb-8 { margin-bottom: 4mm !important; }
          .py-4 { padding-top: 2mm !important; padding-bottom: 2mm !important; }
          
          /* Remove shadows and borders that don't print well */
          .shadow-2xl, .stat-card {
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </div>
  );
}
