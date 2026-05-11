'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime, formatTime, getStatusColor, getStatusLabel, calcDuration } from '@/lib/utils';
import { Clock, Play, Square, DollarSign, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { useShifts, useProfiles } from '@/hooks/use-database';
import { useAuthStore } from '@/store/auth';
import { startShift, closeShift } from '@/app/actions/shifts';

export default function ShiftsPage() {
  const { user } = useAuthStore();
  const isAttendant = user?.role === 'attendant';
  const { data: shifts, refetch } = useShifts(isAttendant ? { attendantId: user?.id } : {});
  const { data: profiles } = useProfiles();
  const [showStart, setShowStart] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAttendant, setSelectedAttendant] = useState('');
  const [closingCash, setClosingCash] = useState(0);

  const allShifts = shifts || [];
  const attendants = (profiles || []).filter((p: any) => p.role === 'attendant');
  const activeShift = allShifts.find((s: any) => s.status === 'active');

  const handleStartShift = async () => {
    if (!selectedAttendant) return;
    setLoading(true);
    const res = await startShift(selectedAttendant);
    setLoading(false);
    if (res.success) { 
      setShowStart(false); 
      setSelectedAttendant(''); 
      await refetch();
    }
    else alert('Error: ' + res.error);
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    setLoading(true);
    const res = await closeShift(activeShift.id, closingCash);
    setLoading(false);
    if (res.success) { 
      setShowClose(false); 
      setClosingCash(0); 
      await refetch();
    }
    else alert('Error: ' + res.error);
  };

  return (
    <div>
      <TopBar title="Shift Management" subtitle="Track attendant shifts and reconcile collections" />
      <div className="p-6 space-y-6">

        {/* Active shift banner */}
        {activeShift ? (
          <div className="rounded-xl p-5 border border-green-200" style={{ background: '#f0fdf4' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-semibold text-green-800">Active Shift</span>
                </div>
                <div className="text-green-700 font-medium text-lg">{activeShift.attendantName}</div>
                <div className="text-green-600 text-sm">
                  Started at {formatTime(activeShift.startTime)} · Duration: {calcDuration(activeShift.startTime)}
                </div>
              </div>
              <button onClick={() => setShowClose(true)} className="btn btn-danger gap-2">
                <Square size={15} /> Close Shift
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Cash', value: activeShift.cashCollected, icon: DollarSign },
                { label: 'Hubtel', value: activeShift.hubtelCollected, icon: Smartphone },
                { label: 'Paystack', value: activeShift.paystackCollected, icon: CreditCard },
                { label: 'Wallet', value: activeShift.walletDeductions, icon: Wallet },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="bg-white rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={13} className="text-green-600" />
                      <span className="text-xs text-green-600">{item.label}</span>
                    </div>
                    <div className="font-bold text-green-800">{formatCurrency(item.value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-5 border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>No Active Shift</div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Start a shift to begin recording sessions</div>
              </div>
              <button onClick={() => setShowStart(true)} className="btn btn-primary gap-2">
                <Play size={15} /> Start Shift
              </button>
            </div>
          </div>
        )}

        {/* Shift history */}
        <div className="stat-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Shift History</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Attendant</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Sessions</th>
                  <th>Cash</th>
                  <th>Hubtel</th>
                  <th>Paystack</th>
                  <th>Wallet</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allShifts.map((shift: any) => {
                  const total = (shift.cashCollected || 0) + (shift.hubtelCollected || 0) + (shift.paystackCollected || 0) + (shift.walletDeductions || 0);
                  return (
                    <tr key={shift.id}>
                      <td className="font-medium whitespace-nowrap">{shift.attendantName || '—'}</td>
                      <td className="text-[11px] whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{formatDateTime(shift.startTime)}</td>
                      <td className="text-[11px] whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
                        {shift.endTime ? formatDateTime(shift.endTime) : '—'}
                      </td>
                      <td className="text-[11px] whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{calcDuration(shift.startTime, shift.endTime)}</td>
                      <td className="text-center">{shift.totalSessions || 0}</td>
                      <td className="whitespace-nowrap">{formatCurrency(shift.cashCollected || 0)}</td>
                      <td className="whitespace-nowrap">{formatCurrency(shift.hubtelCollected || 0)}</td>
                      <td className="whitespace-nowrap">{formatCurrency(shift.paystackCollected || 0)}</td>
                      <td className="whitespace-nowrap">{formatCurrency(shift.walletDeductions || 0)}</td>
                      <td className="font-bold whitespace-nowrap">{formatCurrency(total)}</td>
                      <td>
                        <span className={`badge ${getStatusColor(shift.status)}`}>{getStatusLabel(shift.status)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Start shift modal */}
        {showStart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Start New Shift</h2>
                <button onClick={() => setShowStart(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div>
                <label className="form-label">Attendant</label>
                <select 
                  className="form-select"
                  value={selectedAttendant}
                  onChange={e => setSelectedAttendant(e.target.value)}
                >
                  <option value="">Select attendant...</option>
                  {attendants.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
                <div>
                  <label className="form-label">Opening Cash Balance (GHS)</label>
                  <input type="number" className="form-input" placeholder="0.00" />
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input className="form-input" placeholder="Optional shift notes..." />
                </div>
                <div className="flex gap-3">
                <button onClick={() => setShowStart(false)} className="btn btn-secondary flex-1" disabled={loading}>Cancel</button>
                <button onClick={handleStartShift} className="btn btn-primary flex-1" disabled={loading || !selectedAttendant}>
                  {loading ? 'Starting...' : 'Start Shift'}
                </button>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Close shift modal */}
        {showClose && activeShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Close Shift — {activeShift.attendantName}</h2>
                <button onClick={() => setShowClose(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--muted)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Shift Summary</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Cash Collected', value: formatCurrency(activeShift.cashCollected) },
                    { label: 'Hubtel Collected', value: formatCurrency(activeShift.hubtelCollected) },
                    { label: 'Paystack Collected', value: formatCurrency(activeShift.paystackCollected) },
                    { label: 'Wallet Deductions', value: formatCurrency(activeShift.walletDeductions) },
                    { label: 'Total Sessions', value: activeShift.totalSessions.toString() },
                    { label: 'Duration', value: calcDuration(activeShift.startTime) },
                  ].map(item => (
                    <div key={item.label} className="p-2 rounded-lg bg-white">
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.label}</div>
                      <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                <label className="form-label">Physical Cash Count (GHS)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={closingCash}
                  onChange={e => setClosingCash(Number(e.target.value))}
                />
              </div>
                <div>
                  <label className="form-label">Closing Notes</label>
                  <input className="form-input" placeholder="Any notes for this shift..." />
                </div>
                <div className="flex gap-3">
                <button onClick={() => setShowClose(false)} className="btn btn-secondary flex-1" disabled={loading}>Cancel</button>
                <button onClick={handleCloseShift} className="btn btn-danger flex-1" disabled={loading}>
                  {loading ? 'Closing...' : 'Close Shift'}
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
