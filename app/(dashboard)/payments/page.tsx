'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockPayments } from '@/lib/mock-data';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Search, CreditCard, DollarSign, Smartphone, Wallet } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const filtered = mockPayments.filter(p => {
    const matchSearch = p.driverName.toLowerCase().includes(search.toLowerCase()) ||
      p.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = methodFilter === 'all' || p.method === methodFilter;
    return matchSearch && matchMethod;
  });

  const total = mockPayments.reduce((sum, p) => sum + p.amount, 0);
  const byCash = mockPayments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const byHubtel = mockPayments.filter(p => p.method === 'hubtel').reduce((sum, p) => sum + p.amount, 0);
  const byPaystack = mockPayments.filter(p => p.method === 'paystack').reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <TopBar title="Payments" subtitle="Payment records and transaction history" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} style={{ color: '#1d4ed8' }} />
              <div className="text-xl font-bold" style={{ color: '#1d4ed8' }}>{formatCurrency(total)}</div>
            </div>
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Total Revenue</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} style={{ color: '#16a34a' }} />
              <div className="text-xl font-bold" style={{ color: '#16a34a' }}>{formatCurrency(byCash)}</div>
            </div>
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Cash</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={16} style={{ color: '#0891b2' }} />
              <div className="text-xl font-bold" style={{ color: '#0891b2' }}>{formatCurrency(byHubtel)}</div>
            </div>
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Hubtel MoMo</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} style={{ color: '#7c3aed' }} />
              <div className="text-xl font-bold" style={{ color: '#7c3aed' }}>{formatCurrency(byPaystack)}</div>
            </div>
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Paystack</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search by driver, receipt, or reference..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="hubtel">Hubtel</option>
              <option value="paystack">Paystack</option>
              <option value="wallet">Wallet</option>
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
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs font-semibold">{p.receiptNumber}</td>
                    <td className="font-medium">{p.driverName}</td>
                    <td className="font-bold">{formatCurrency(p.amount)}</td>
                    <td>
                      <span className={`badge gap-1 ${methodColors[p.method]}`}>
                        {methodIcons[p.method]}
                        {p.method.charAt(0).toUpperCase() + p.method.slice(1)}
                      </span>
                    </td>
                    <td className="font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {p.reference || '—'}
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{p.attendantName}</td>
                    <td>
                      <span className={`badge ${getStatusColor(p.status)}`}>{getStatusLabel(p.status)}</span>
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">{formatDateTime(p.createdAt)}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm">Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
              <CreditCard className="mx-auto mb-2 opacity-30" size={32} />
              <p>No payments found</p>
            </div>
          )}
        </div>

        {/* Receipt modal placeholder */}
        <div className="stat-card">
          <h3 className="font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Sample Receipt Preview</h3>
          <div className="max-w-sm mx-auto border rounded-xl p-6 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="font-bold text-lg mb-1">SPERO ENERGY RESOURCES LTD</div>
            <div className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>EV Charging Station Receipt</div>
            <div className="border-t border-dashed pt-3 mb-3 text-left space-y-1" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Receipt #</span><span className="font-mono">RCP-0001</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Driver</span><span>Ernest Osei</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Vehicle</span><span>GR-1234-24</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Units</span><span>20.5 kWh</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Rate</span><span>GHS 5.50/kWh</span></div>
              <div className="flex justify-between font-bold border-t pt-2 mt-2" style={{ borderColor: 'var(--border)' }}><span>Total</span><span>GHS 112.75</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted-foreground)' }}>Method</span><span>Cash</span></div>
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Powered by SCMS — Spero EV</div>
          </div>
          <div className="flex justify-center gap-3 mt-4">
            <button className="btn btn-secondary btn-sm">Print</button>
            <button className="btn btn-secondary btn-sm">Download PDF</button>
            <button className="btn btn-secondary btn-sm">WhatsApp</button>
          </div>
        </div>

      </div>
    </div>
  );
}
