'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockDashboardStats, mockSessions, mockPayments } from '@/lib/mock-data';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { FileText, Download, Filter, Calendar, TrendingUp, Zap, DollarSign } from 'lucide-react';

const reportTypes = [
  { id: 'daily', label: 'Daily Revenue Report', icon: DollarSign, desc: 'Revenue breakdown for a specific day' },
  { id: 'weekly', label: 'Weekly Summary', icon: TrendingUp, desc: 'Sessions and revenue by week' },
  { id: 'monthly', label: 'Monthly Financial Report', icon: Calendar, desc: 'Full monthly financial summary' },
  { id: 'sessions', label: 'Session Report', icon: Zap, desc: 'All charging sessions with details' },
  { id: 'audit', label: 'Audit Trail Report', icon: FileText, desc: 'Activity log and fraud detection' },
  { id: 'shift', label: 'Shift Reconciliation', icon: FileText, desc: 'Cash and payment reconciliation by shift' },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState('daily');
  const [dateFrom, setDateFrom] = useState('2025-05-01');
  const [dateTo, setDateTo] = useState('2025-05-08');

  return (
    <div>
      <TopBar title="Reports" subtitle="Generate and export financial and operational reports" />
      <div className="p-6 space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report types */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Report Type</h3>
            {reportTypes.map(r => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedReport(r.id)}
                  className="w-full text-left p-4 rounded-xl border transition-all"
                  style={{
                    borderColor: selectedReport === r.id ? 'var(--primary)' : 'var(--border)',
                    background: selectedReport === r.id ? 'var(--accent)' : 'var(--card)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: selectedReport === r.id ? '#1d4ed8' : 'var(--muted)' }}>
                      <Icon size={16} style={{ color: selectedReport === r.id ? 'white' : 'var(--muted-foreground)' }} />
                    </div>
                    <div>
                      <div className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{r.label}</div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.desc}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Report config + preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <div className="stat-card">
              <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Report Parameters</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">From Date</label>
                  <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">To Date</label>
                  <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn btn-primary gap-2">
                  <FileText size={15} /> Generate Report
                </button>
                <button className="btn btn-secondary gap-2">
                  <Download size={15} /> Export CSV
                </button>
                <button className="btn btn-secondary gap-2">
                  <Download size={15} /> Export PDF
                </button>
              </div>
            </div>

            {/* Report preview */}
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Report Preview</h3>
                <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {formatDate(dateFrom)} – {formatDate(dateTo)}
                </span>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total Revenue', value: formatCurrency(mockDashboardStats.revenueThisMonth) },
                  { label: 'Total Sessions', value: mockDashboardStats.totalSessions.toString() },
                  { label: 'kWh Sold', value: `${mockDashboardStats.totalKwhSold} kWh` },
                  { label: 'Outstanding Debts', value: formatCurrency(mockDashboardStats.outstandingDebts) },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>{item.label}</div>
                    <div className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Session table */}
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Driver</th>
                      <th>Units</th>
                      <th>Rate</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockSessions.filter(s => s.status === 'completed').map(s => (
                      <tr key={s.id}>
                        <td className="font-mono text-xs">{s.receiptNumber}</td>
                        <td>{s.driverName}</td>
                        <td>{s.unitsConsumed} kWh</td>
                        <td>GHS {s.rateAtTime}</td>
                        <td className="font-medium">{s.totalAmount ? formatCurrency(s.totalAmount) : '—'}</td>
                        <td className="capitalize">{s.paymentMethod || '—'}</td>
                        <td className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{formatDate(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gap report */}
            <div className="stat-card border border-yellow-200 bg-yellow-50">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={16} className="text-yellow-600" />
                <h3 className="font-semibold text-yellow-800">Gap Detection Report</h3>
              </div>
              <p className="text-sm text-yellow-700 mb-3">
                Analyzing session timeline for suspicious gaps (periods with no recorded sessions during operating hours).
              </p>
              <div className="text-sm text-yellow-800">
                ✓ No suspicious gaps detected in the selected period.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
