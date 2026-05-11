'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Search, CreditCard, DollarSign, Smartphone, Wallet, Activity } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePayments, useDrivers } from '@/hooks/use-database';

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
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card w-full print-visible" style={{ maxWidth: '420px', maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">Transaction Receipt</h2>
                <button onClick={() => setSelectedPayment(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>

              <div className="border rounded-xl p-6 text-center text-sm mb-6" style={{ borderColor: 'var(--border)' }}>
                <div className="font-bold text-lg mb-1">SPERO ENERGY RESOURCES LTD</div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">EV Charging Station Receipt</div>
                
                <div className="border-t border-dashed pt-4 mb-4 text-left space-y-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Receipt Number</span>
                    <span className="font-mono font-bold text-blue-600">{selectedPayment.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date</span>
                    <span className="font-medium">{formatDateTime(selectedPayment.createdAt)}</span>
                  </div>
                  <hr style={{ borderStyle: 'dashed', borderColor: 'var(--border)' }} />
                  <div className="flex justify-between">
                    <span className="text-slate-500">Driver</span>
                    <span className="font-bold text-slate-800">{selectedPayment.driverName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-bold capitalize text-slate-800">{selectedPayment.method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[150px]">{selectedPayment.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Attendant</span>
                    <span className="font-medium text-slate-600">{selectedPayment.attendantName}</span>
                  </div>
                  
                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-800 text-base">Total Amount Paid</span>
                      <span className="font-black text-xl text-blue-600">{formatCurrency(selectedPayment.amount)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-[10px] text-slate-400 italic">Powered by SCMS — Spero Fleet Management</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => window.print()}
                  className="btn btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  Print
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
                  className="btn btn-primary py-3 flex items-center justify-center gap-2"
                >
                  Share
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
