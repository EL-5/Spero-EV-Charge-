'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { AlertTriangle, Phone, CheckCircle, Clock, Zap, Search, XCircle, DollarSign } from 'lucide-react';
import { useDrivers, useSessions } from '@/hooks/use-database';
import type { Driver } from '@/lib/types';
import { recordDebtPayment } from '@/app/actions/debts';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

export default function DebtsPage() {
  const { data: drivers, isLoading: loadingDrivers } = useDrivers();
  const { data: sessions, isLoading: loadingSessions } = useSessions({ loadAll: true });
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'debts' | 'pending'>('debts');
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const allDrivers = drivers || [];
  const allSessions = sessions || [];

  // Unified pending payment sessions definition (66 sessions total)
  const allPendingPaymentSessions = allSessions.filter((s: any) =>
    s.status === 'pending_payment' ||
    (s.status === 'completed' && (s.paymentStatus === 'unpaid' || !s.paymentStatus || s.paymentStatus === ''))
  );

  // Group pending session amounts by driverId
  const pendingDebtByDriver: Record<string, number> = {};
  allPendingPaymentSessions.forEach((s: any) => {
    if (s.driverId) {
      const amount = s.totalAmount || s.prepaidAmount || 0;
      pendingDebtByDriver[s.driverId] = (pendingDebtByDriver[s.driverId] || 0) + amount;
    }
  });

  // Map drivers to dynamically calculate their debt balance (column + pending sessions)
  const driversWithDynamicDebt = allDrivers.map((d: Driver) => {
    const sessionDebt = pendingDebtByDriver[d.id] || 0;
    return {
      ...d,
      debtBalance: d.debtBalance + sessionDebt,
    };
  });

  // Debtors list: drivers with dynamic debt > 0
  const debtors = driversWithDynamicDebt.filter((d: any) => d.debtBalance > 0);

  // Total Outstanding Debt Card: sums registered driver debts + unregistered/guest pending session debts
  const registeredDriversDebt = debtors.reduce((sum: number, d: any) => sum + d.debtBalance, 0);
  const unregisteredPendingDebt = allPendingPaymentSessions
    .filter((s: any) => !s.driverId || !allDrivers.some(d => d.id === s.driverId))
    .reduce((sum: number, s: any) => sum + (s.totalAmount || s.prepaidAmount || 0), 0);

  const totalDebt = registeredDriversDebt + unregisteredPendingDebt;

  const filteredPending = allPendingPaymentSessions.filter((s: any) =>
    search.trim() === '' ||
    (s.driverName || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.receiptNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.vehiclePlate || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPendingAmount = allPendingPaymentSessions.reduce((sum: number, s: any) =>
    sum + (s.totalAmount || s.prepaidAmount || 0), 0
  );

  const handleMarkPaid = async () => {
    if (!selectedDriver || !payAmount) return;
    setLoading(true);
    try {
      const res = await recordDebtPayment({
        driverId: selectedDriver.id,
        amount: payAmount,
        method: payMethod,
      });
      
      if (res.success) {
        setShowMarkPaid(false);
        setShowSuccess(true);
        setSelectedDriver(null);
        setPayAmount(0);
        toast.success('Debt payment recorded successfully!');
      } else {
        toast.error('Error: ' + res.error);
      }
    } catch (err: any) {
      toast.error('Error recording payment: ' + err.message);
    }
    setLoading(false);
  };

  const isLoading = loadingDrivers || loadingSessions;

  return (
    <div>
      <TopBar title="Debt & Pending Payments" subtitle="Track outstanding driver debts and sessions awaiting payment" />
      <div className="p-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card border-l-4 border-red-400">
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalDebt)}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Outstanding Debt</div>
          </div>
          <div className="stat-card border-l-4 border-red-300">
            <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{debtors.length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Drivers with Debt</div>
          </div>
          <div className="stat-card border-l-4 border-amber-400">
            <div className="text-2xl font-bold text-amber-600">{allPendingPaymentSessions.length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Pending Payment Sessions</div>
          </div>
          <div className="stat-card border-l-4 border-amber-300">
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(totalPendingAmount)}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Pending Amount</div>
          </div>
        </div>

        {/* Alert banners */}
        {totalDebt > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-700">Outstanding debts detected</div>
              <div className="text-sm text-red-600 mt-0.5">
                {debtors.length} driver(s) owe {formatCurrency(totalDebt)}.
                Postpaid charging is blocked until debts are cleared.
              </div>
            </div>
          </div>
        )}

        {allPendingPaymentSessions.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <Clock size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-700">Sessions awaiting payment</div>
              <div className="text-sm text-amber-600 mt-0.5">
                {allPendingPaymentSessions.length} session(s) totalling {formatCurrency(totalPendingAmount)} have not been fully paid.
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--muted)' }}>
          {[
            { id: 'debts', label: `Driver Debts (${debtors.length})` },
            { id: 'pending', label: `Pending Sessions (${allPendingPaymentSessions.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
              style={{
                background: activeTab === tab.id ? 'var(--card)' : 'transparent',
                color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Driver Debts ── */}
        {activeTab === 'debts' && (
          <div className="stat-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Debtors List</h3>
              {isLoading && <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Loading...</span>}
            </div>
            {debtors.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle className="mx-auto mb-3" size={40} style={{ color: '#16a34a' }} />
                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>No outstanding debts</div>
                <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>All drivers are debt-free</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Phone</th>
                      <th>Debt Amount</th>
                      <th>Wallet Balance</th>
                      <th>Sessions</th>
                      <th>Risk</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtors.map((d: Driver) => {
                      const risk = d.debtBalance > 200 ? 'high' : d.debtBalance > 100 ? 'medium' : 'low';
                      return (
                        <tr key={d.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                                {d.name[0]}
                              </div>
                              <div>
                                <div className="font-medium">{d.name}</div>
                                <div className="text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>{d.type}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }}>{d.phone}</td>
                          <td><span className="font-bold text-red-600">{formatCurrency(d.debtBalance)}</span></td>
                          <td style={{ color: 'var(--muted-foreground)' }}>{formatCurrency(d.walletBalance)}</td>
                          <td>{d.totalSessions}</td>
                          <td>
                            <span className={`badge ${
                              risk === 'high' ? 'bg-red-100 text-red-700' :
                              risk === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {risk}
                            </span>
                          </td>
                          <td>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSelectedDriver(d);
                                  setPayAmount(d.debtBalance);
                                  setShowMarkPaid(true);
                                }}
                                className="btn btn-primary btn-sm"
                              >
                                Mark Paid
                              </button>
                              <a href={`tel:${d.phone}`} className="btn btn-secondary btn-sm gap-1">
                                <Phone size={12} /> Call
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Pending Payment Sessions ── */}
        {activeTab === 'pending' && (
          <div className="stat-card overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Sessions Pending Payment</h3>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="Search driver, receipt..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '32px' }}
                />
              </div>
            </div>

            {filteredPending.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle className="mx-auto mb-3" size={40} style={{ color: '#16a34a' }} />
                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>
                  {search ? 'No sessions match your search' : 'All sessions have been paid'}
                </div>
                <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {!search && 'No outstanding payment required.'}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Driver</th>
                      <th>Vehicle</th>
                      <th>Mode</th>
                      <th>Energy</th>
                      <th>Amount Due</th>
                      <th>Status</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.map((s: any) => {
                      const amountDue = s.totalAmount || s.prepaidAmount || 0;
                      const isPending = s.status === 'pending_payment';
                      const isActive = s.status === 'active';
                      return (
                        <tr key={s.id}>
                          <td className="font-mono text-xs text-blue-600">{s.receiptNumber}</td>
                          <td>
                            <div className="font-medium">{s.driverName || 'Unknown'}</div>
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{s.vehiclePlate || '—'}</div>
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }} className="text-sm">{s.vehiclePlate || '—'}</td>
                          <td>
                            <span className={`badge capitalize ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {s.mode}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }}>
                            {s.unitsConsumed ? `${s.unitsConsumed} ${s.unitType}` : (
                              <span className="flex items-center gap-1 text-amber-500 text-xs italic">
                                <Zap size={11} /> active
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="font-bold text-red-600">{amountDue > 0 ? formatCurrency(amountDue) : '—'}</span>
                          </td>
                          <td>
                            <span className={`badge ${
                              isPending ? 'bg-red-100 text-red-700' :
                              isActive ? 'bg-amber-100 text-amber-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {isPending ? 'Pending Payment' : isActive ? 'Active' : 'Unpaid'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">
                            {formatDateTime(s.startTime || s.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredPending.length > 0 && (
              <div className="p-4 border-t flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>
                  {filteredPending.length} session(s) shown
                </span>
                <div className="text-right">
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total Pending</div>
                  <div className="text-lg font-black text-red-600">
                    {formatCurrency(filteredPending.reduce((sum: number, s: any) => sum + (s.totalAmount || s.prepaidAmount || 0), 0))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Debt rules */}
        {activeTab === 'debts' && (
          <div className="stat-card">
            <h3 className="font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Debt Rules</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Block postpaid if debt exists', value: 'Enabled', color: '#16a34a' },
                { label: 'Manager override available', value: 'Enabled', color: '#16a34a' },
                { label: 'Max debt threshold', value: 'GHS 500.00', color: '#1d4ed8' },
                { label: 'Debt warning threshold', value: 'GHS 100.00', color: '#d97706' },
              ].map(rule => (
                <div key={rule.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{rule.label}</span>
                  <span className="text-sm font-semibold" style={{ color: rule.color }}>{rule.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mark Paid modal */}
        {showMarkPaid && selectedDriver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>
                  Record Payment — {selectedDriver.name}
                </h2>
                <button onClick={() => setShowMarkPaid(false)} className="text-gray-400 hover:text-gray-600 text-xl">
                  &times;
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Outstanding Debt</label>
                  <div className="font-bold text-red-600 text-lg">{formatCurrency(selectedDriver.debtBalance)}</div>
                </div>
                <div>
                  <label className="form-label">Amount Paid (GHS)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={payAmount}
                    onChange={e => setPayAmount(Number(e.target.value))}
                    max={selectedDriver.debtBalance}
                  />
                </div>
                <div>
                  <label className="form-label">Payment Method</label>
                  <select 
                    className="form-select"
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="MTN MoMo">MTN MoMo</option>
                    <option value="Telecel Cash">Telecel Cash</option>
                    <option value="Tigo Cash">Tigo Cash</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMarkPaid(false)}
                    className="btn btn-secondary flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkPaid}
                    className="btn btn-primary flex-1"
                    disabled={loading || !payAmount}
                  >
                    {loading ? 'Recording...' : 'Record Payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="stat-card max-w-sm w-full text-center py-8 animate-in zoom-in duration-200">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="text-green-600" size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Repayment Successful</h2>
              <p className="text-slate-500 text-sm mb-6">
                The driver's debt balance has been updated and the payment has been logged in the ledger.
              </p>
              <button 
                onClick={() => setShowSuccess(false)}
                className="btn btn-primary w-full py-3"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
