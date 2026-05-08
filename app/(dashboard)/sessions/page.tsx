'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockSessions } from '@/lib/mock-data';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel, calcDuration } from '@/lib/utils';
import { Search, Plus, Zap, Clock, CheckCircle, XCircle, Filter } from 'lucide-react';
import type { Session } from '@/lib/types';

export default function SessionsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Session | null>(null);
  const [newMode, setNewMode] = useState<'prepaid' | 'postpaid'>('postpaid');

  const filtered = mockSessions.filter(s => {
    const matchSearch = s.driverName.toLowerCase().includes(search.toLowerCase()) ||
      s.vehiclePlate.toLowerCase().includes(search.toLowerCase()) ||
      s.receiptNumber.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchMode = modeFilter === 'all' || s.mode === modeFilter;
    return matchSearch && matchStatus && matchMode;
  });

  return (
    <div>
      <TopBar title="Charging Sessions" subtitle="Manage all EV charging sessions" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: mockSessions.length, color: '#1d4ed8', icon: Zap },
            { label: 'Active', value: mockSessions.filter(s => s.status === 'active').length, color: '#16a34a', icon: Clock },
            { label: 'Pending Payment', value: mockSessions.filter(s => s.status === 'pending_payment').length, color: '#ca8a04', icon: Clock },
            { label: 'Completed', value: mockSessions.filter(s => s.status === 'completed').length, color: '#1d4ed8', icon: CheckCircle },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="stat-card">
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} style={{ color: card.color }} />
                  <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
                </div>
                <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{card.label}</div>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search by driver, vehicle, receipt..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={modeFilter} onChange={e => setModeFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Modes</option>
              <option value="prepaid">Prepaid</option>
              <option value="postpaid">Postpaid</option>
            </select>
            <button onClick={() => setShowNew(true)} className="btn btn-primary gap-2">
              <Plus size={16} /> New Session
            </button>
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
                  <th>Vehicle</th>
                  <th>Mode</th>
                  <th>Rate</th>
                  <th>Units</th>
                  <th>Amount</th>
                  <th>Duration</th>
                  <th>Attendant</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                    <td className="font-mono text-xs font-semibold">{s.receiptNumber}</td>
                    <td className="font-medium" style={{ color: 'var(--foreground)' }}>{s.driverName}</td>
                    <td className="font-mono text-xs">{s.vehiclePlate}</td>
                    <td>
                      <span className={`badge ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {s.mode}
                      </span>
                    </td>
                    <td className="text-sm">GHS {s.rateAtTime}/{s.unitType === 'kwh' ? 'kWh' : 'min'}</td>
                    <td>{s.unitsConsumed ? `${s.unitsConsumed} kWh` : s.targetUnits ? `~${s.targetUnits.toFixed(1)} kWh` : '—'}</td>
                    <td className="font-medium">{s.totalAmount ? formatCurrency(s.totalAmount) : s.prepaidAmount ? formatCurrency(s.prepaidAmount) : '—'}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{calcDuration(s.startTime, s.endTime)}</td>
                    <td style={{ color: 'var(--muted-foreground)' }} className="text-sm">{s.attendantName}</td>
                    <td>
                      <span className={`badge ${getStatusColor(s.status)}`}>{getStatusLabel(s.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
              <Zap className="mx-auto mb-2 opacity-30" size={32} />
              <p>No sessions found</p>
            </div>
          )}
        </div>

        {/* Session detail */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Session {selected.receiptNumber}</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'Driver', value: selected.driverName },
                  { label: 'Vehicle', value: selected.vehiclePlate },
                  { label: 'Mode', value: selected.mode.toUpperCase() },
                  { label: 'Status', value: getStatusLabel(selected.status) },
                  { label: 'Rate', value: `GHS ${selected.rateAtTime}/${selected.unitType}` },
                  { label: 'Units', value: selected.unitsConsumed ? `${selected.unitsConsumed} kWh` : `~${selected.targetUnits?.toFixed(1)} kWh` },
                  { label: 'Total Amount', value: selected.totalAmount ? formatCurrency(selected.totalAmount) : selected.prepaidAmount ? formatCurrency(selected.prepaidAmount) : '—' },
                  { label: 'Payment Method', value: selected.paymentMethod?.toUpperCase() || '—' },
                  { label: 'Start Time', value: formatDateTime(selected.startTime) },
                  { label: 'End Time', value: selected.endTime ? formatDateTime(selected.endTime) : 'Ongoing' },
                  { label: 'Duration', value: calcDuration(selected.startTime, selected.endTime) },
                  { label: 'Attendant', value: selected.attendantName },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.label}</div>
                    <div className="font-medium text-sm mt-0.5" style={{ color: 'var(--foreground)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {selected.cancelReason && (
                <div className="p-3 rounded-lg mb-4 bg-red-50 border border-red-100">
                  <div className="text-xs text-red-600 font-medium mb-1">Cancellation Reason</div>
                  <div className="text-sm text-red-700">{selected.cancelReason}</div>
                </div>
              )}
              {selected.status === 'pending_payment' && (
                <button className="btn btn-primary w-full">Process Payment</button>
              )}
              {selected.status === 'active' && (
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1">Complete Session</button>
                  <button className="btn btn-danger flex-1">Cancel</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* New session modal */}
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>New Charging Session</h2>
                <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              {/* Mode select */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {(['postpaid', 'prepaid'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setNewMode(m)}
                    className="p-4 rounded-xl border-2 text-left transition-all"
                    style={{
                      borderColor: newMode === m ? 'var(--primary)' : 'var(--border)',
                      background: newMode === m ? 'var(--accent)' : 'var(--card)',
                    }}
                  >
                    <div className="font-semibold capitalize" style={{ color: 'var(--foreground)' }}>{m}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {m === 'postpaid' ? 'Pay after charging' : 'Pay before charging'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="form-label">Driver *</label>
                  <select className="form-select">
                    <option value="">Select a driver...</option>
                    <option>Ernest Osei</option>
                    <option>Nii Okaifio</option>
                    <option>GreenFleet Ghana Ltd</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Vehicle *</label>
                  <select className="form-select">
                    <option value="">Select a vehicle...</option>
                    <option>GR-1234-24 — Tesla Model 3</option>
                    <option>AE-9012-24 — BYD Atto 3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Unit Type</label>
                  <select className="form-select">
                    <option value="kwh">kWh — GHS 5.50/kWh</option>
                    <option value="minutes">Minutes — GHS 1.20/min</option>
                  </select>
                </div>
                {newMode === 'prepaid' && (
                  <div>
                    <label className="form-label">Prepaid Amount (GHS) *</label>
                    <input type="number" className="form-input" placeholder="e.g. 200" min="1" />
                    <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      System will calculate target kWh based on current rate
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowNew(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={() => setShowNew(false)} className="btn btn-primary flex-1">
                    <Zap size={15} /> Start Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
