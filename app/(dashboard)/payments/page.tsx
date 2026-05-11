'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Search, CreditCard, DollarSign, Smartphone, Wallet, Activity, XCircle, Printer, Share2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePayments, useDrivers, useSettings } from '@/hooks/use-database';

const methodIcons: Record<string, React.ReactNode> = {
  cash: <DollarSign size={14} />,
  hubtel: <Smartphone size={14} />,
  paystack: <CreditCard size={14} />,
  wallet: <Wallet size={14} />,
};

const methodColors: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  hubtel: 'bg-blue-100 text-blue-700',
  paystack: 'bg-purple-100 text-purple-700',
  wallet: 'bg-orange-100 text-orange-700',
};

export default function PaymentsPage() {
  const { user } = useAuthStore();
  const isAttendant = user?.role === 'attendant';
  const { data: payments, isLoading } = usePayments(isAttendant ? { attendantId: user?.id } : {});
  const { data: drivers } = useDrivers();
  const { data: settings } = useSettings();

  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  // Branding & Config
  const branding = {
    logo_url: settings?.logo_url || '/spero-logo.png',
    company_name: settings?.company_name || 'SPERO ENERGY RESOURCES LTD',
  };
  const config = settings?.receipt_config || {
    headerTitle: 'EV Charging Station Receipt',
    showLogo: true,
    showDriver: true,
    showVehicle: true,
    showUnits: true,
    showRate: true,
    showPaymentMethod: true,
    showDate: true,
    logoSize: 40,
  };
  const footer = settings?.receipt_footer || 'Powered by SCMS — Spero Fleet Management';

  const allPayments = payments || [];

  const filtered = allPayments.filter((p: any) => {
    const matchSearch =
      (p.receiptNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.driverName || '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = methodFilter === 'all' || p.method === methodFilter;
    return matchSearch && matchMethod;
  });

  const total = allPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const byCash = allPayments.filter((p: any) => p.method === 'cash').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const byMoMo = allPayments.filter((p: any) => ['mtn', 'telecel', 'airteltigo', 'hubtel'].includes(p.method)).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const byWallet = allPayments.filter((p: any) => p.method === 'wallet').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  return (
    <div>
      <TopBar title="Payments" subtitle="Payment records and transaction history" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} className="text-blue-600" />
              <div className="text-xl font-bold text-blue-600">{formatCurrency(total)}</div>
            </div>
            <div className="text-sm text-slate-500">Total Revenue</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-emerald-600" />
              <div className="text-xl font-bold text-emerald-600">{formatCurrency(byCash)}</div>
            </div>
            <div className="text-sm text-slate-500">Cash Collections</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={16} className="text-orange-500" />
              <div className="text-xl font-bold text-orange-500">{formatCurrency(byMoMo)}</div>
            </div>
            <div className="text-sm text-slate-500">Mobile Money</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={16} className="text-purple-600" />
              <div className="text-xl font-bold text-purple-600">{formatCurrency(byWallet)}</div>
            </div>
            <div className="text-sm text-slate-500">Digital / Wallet</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by driver, receipt, or reference..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input pl-10"
              />
            </div>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="form-select w-full sm:w-auto">
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="mtn">MTN MoMo</option>
              <option value="telecel">Telecel</option>
              <option value="airteltigo">AirtelTigo</option>
              <option value="wallet">Wallet Credit</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Driver</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Attendant</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs font-bold text-blue-600">{p.receiptNumber}</td>
                    <td className="font-medium text-slate-700">{p.driverName || '—'}</td>
                    <td className="font-black text-slate-900">{formatCurrency(p.amount)}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-700 capitalize font-medium">
                        {p.method}
                      </span>
                    </td>
                    <td className="font-mono text-[10px] text-slate-400">
                      {p.reference || '—'}
                    </td>
                    <td className="text-sm text-slate-500">{p.attendantName || '—'}</td>
                    <td>
                      <span className={`badge ${getStatusColor(p.status)}`}>{getStatusLabel(p.status)}</span>
                    </td>
                    <td className="text-[10px] text-slate-400 font-medium">{formatDateTime(p.createdAt)}</td>
                    <td>
                      <button 
                        onClick={() => setSelectedPayment(p)}
                        className="text-blue-600 font-bold text-xs hover:underline"
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="text-slate-300" size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No transactions found</h3>
              <p className="text-sm text-slate-500 max-w-[200px] mx-auto">Wait for payments or try a different filter.</p>
            </div>
          )}
          {isLoading && (
            <div className="text-center py-20">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-slate-500">Loading payment records...</p>
            </div>
          )}
        </div>

        {/* Receipt Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[340px] overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Transaction Receipt</h2>
                <button onClick={() => setSelectedPayment(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <XCircle size={18} />
                </button>
              </div>

              <div className="p-6 text-slate-800">
                <div className="text-center mb-6">
                  {config.showLogo && branding.logo_url && (
                    <div className="flex justify-center mb-3">
                      <img 
                        src={branding.logo_url} 
                        alt="Station Logo" 
                        style={{ width: `${config.logoSize}px`, height: 'auto' }} 
                        className="object-contain" 
                      />
                    </div>
                  )}
                  <div className="font-black text-lg uppercase tracking-tight text-slate-900">{branding.company_name}</div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 tracking-widest">{config.headerTitle}</div>
                </div>
                
                <div className="border-t border-b border-dashed border-slate-200 pt-4 pb-4 mb-6 space-y-3 text-left">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Receipt #</span>
                    <span className="text-[13px] font-mono font-bold text-blue-600 break-all text-right">{selectedPayment.receiptNumber}</span>
                  </div>
                  {config.showDate && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Date</span>
                      <span className="text-[13px] font-bold text-slate-900 text-right">{formatDateTime(selectedPayment.createdAt)}</span>
                    </div>
                  )}
                  <hr className="border-slate-100" />
                  
                  {config.showDriver && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Driver</span>
                      <span className="text-[13px] font-bold text-slate-900 break-words text-right">{selectedPayment.driverName}</span>
                    </div>
                  )}

                  {config.showUnits && selectedPayment.unitsConsumed && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Energy</span>
                      <span className="text-[13px] font-bold text-slate-900 text-right">{selectedPayment.unitsConsumed} {selectedPayment.unitType}</span>
                    </div>
                  )}

                  {config.showRate && selectedPayment.rateAtTime && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Rate</span>
                      <span className="text-[13px] font-bold text-slate-700 text-right">GHS {selectedPayment.rateAtTime}/{selectedPayment.unitType}</span>
                    </div>
                  )}

                  {config.showPaymentMethod && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Method</span>
                      <span className="text-[13px] font-bold capitalize text-slate-800 text-right">{selectedPayment.method}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[11px] text-slate-400 font-medium uppercase shrink-0">Ref</span>
                    <span className="text-[10px] font-mono text-slate-400 break-all text-right">{selectedPayment.reference}</span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Total Paid</span>
                    <span className="text-lg font-black text-blue-600">{formatCurrency(selectedPayment.amount)}</span>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 italic font-medium">{footer}</p>
                  <p className="text-[8px] text-slate-300 mt-2 font-mono uppercase tracking-tighter">Verified by Spero Fleet SCMS</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 flex gap-2 border-t border-slate-100">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Printer size={14} /> Print
                </button>
                <button 
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: `Spero Receipt ${selectedPayment.receiptNumber}`,
                        text: `Charging Receipt for ${selectedPayment.driverName} - ${formatCurrency(selectedPayment.amount)}`,
                        url: window.location.href,
                      }).catch(console.error);
                    } else {
                      alert('Sharing is not supported on this browser/device.');
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 rounded-xl text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                >
                  <Share2 size={14} /> Share
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
