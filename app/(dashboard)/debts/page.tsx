'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Phone, CheckCircle } from 'lucide-react';
import { useDrivers } from '@/hooks/use-database';
import type { Driver } from '@/lib/types';
import { recordDebtPayment } from '@/app/actions/debts';
import { useAuthStore } from '@/store/auth';

export default function DebtsPage() {
  const { data: drivers, isLoading } = useDrivers();
  const { user } = useAuthStore();
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [loading, setLoading] = useState(false);

  const allDrivers = drivers || [];
  const debtors = allDrivers.filter((d: Driver) => d.debtBalance > 0);
  const totalDebt = debtors.reduce((sum: number, d: Driver) => sum + d.debtBalance, 0);

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
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err: any) {
      alert('Error recording payment: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <TopBar title="Debt Management" subtitle="Track and manage outstanding driver debts" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="stat-card border-l-4 border-red-400">
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalDebt)}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Outstanding Debt</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{debtors.length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Drivers with Debt</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#d97706' }}>
              {debtors.length > 0 ? formatCurrency(totalDebt / debtors.length) : 'GHS 0.00'}
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Average Debt</div>
          </div>
        </div>

        {/* Alert banner */}
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

        {/* Debtors table */}
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

        {/* Debt rules */}
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
