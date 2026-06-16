'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { useReconciliations } from '@/hooks/use-database';
import { addReconciliation, deleteReconciliation } from '@/app/actions/reconciliation';
import { formatDateTime, getStatusColor } from '@/lib/utils';
import { toast } from 'sonner';
import { Activity, Plus, Search, Trash2, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

export default function ReconciliationPage() {
  const { data: reconciliations, isLoading, refetch } = useReconciliations();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    period_start: '',
    period_end: '',
    meter_kwh: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.period_start || !formData.period_end || !formData.meter_kwh) {
      return toast.error('Please fill in all required fields');
    }

    const start = new Date(formData.period_start).toISOString();
    const end = new Date(formData.period_end).toISOString();

    if (new Date(start) >= new Date(end)) {
      return toast.error('End date must be after start date');
    }

    setLoading(true);
    const res = await addReconciliation({
      period_start: start,
      period_end: end,
      meter_kwh: Number(formData.meter_kwh),
      notes: formData.notes,
    });
    setLoading(false);

    if (res.success) {
      toast.success('Meter reading added successfully');
      setShowModal(false);
      setFormData({ period_start: '', period_end: '', meter_kwh: '', notes: '' });
      refetch();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    setLoading(true);
    const res = await deleteReconciliation(id);
    setLoading(false);
    if (res.success) {
      toast.success('Record deleted');
      refetch();
    } else {
      toast.error(res.error);
    }
  };

  const currentRecords = reconciliations || [];

  return (
    <div>
      <TopBar title="Energy Reconciliation" subtitle="Audit smart meter readings against app sessions" />
      <div className="p-6 space-y-6">

        {/* Action Bar */}
        <div className="flex justify-between items-center stat-card p-4">
          <div className="text-sm text-slate-500">
            Compare physical smart meter readings with recorded app energy.
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary gap-2">
            <Plus size={16} /> Add Meter Reading
          </button>
        </div>

        {/* Data Table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Period Start</th>
                  <th>Period End</th>
                  <th>Meter (kWh)</th>
                  <th>App (kWh)</th>
                  <th>Variance (kWh)</th>
                  <th>Variance (%)</th>
                  <th>Notes</th>
                  <th>Added By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.map((r: any) => {
                  const variancePercent = r.variancePercentage;
                  const isHighVariance = Math.abs(variancePercent) > 5;
                  return (
                    <tr key={r.id}>
                      <td className="text-xs">{formatDateTime(r.periodStart)}</td>
                      <td className="text-xs">{formatDateTime(r.periodEnd)}</td>
                      <td className="font-bold text-slate-700">{r.meterKwh.toFixed(2)}</td>
                      <td className="font-medium text-blue-600">{r.appKwh.toFixed(2)}</td>
                      <td className={`font-bold ${isHighVariance ? 'text-red-600' : 'text-slate-600'}`}>
                        {r.varianceKwh > 0 ? '+' : ''}{r.varianceKwh.toFixed(2)}
                      </td>
                      <td>
                        <div className={`badge ${isHighVariance ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {isHighVariance ? <AlertTriangle size={12} className="mr-1" /> : <CheckCircle size={12} className="mr-1" />}
                          {variancePercent.toFixed(1)}%
                        </div>
                      </td>
                      <td className="text-xs text-slate-500 max-w-[200px] truncate" title={r.notes}>{r.notes || '—'}</td>
                      <td className="text-xs">{r.createdByName}</td>
                      <td>
                        <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 p-1">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {currentRecords.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-500">
                      No reconciliation records found. Add your first smart meter reading to begin tracking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="stat-card max-w-md w-full p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Meter Reading</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Period Start</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    required 
                    value={formData.period_start}
                    onChange={e => setFormData({ ...formData, period_start: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Period End</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    required 
                    value={formData.period_end}
                    onChange={e => setFormData({ ...formData, period_end: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Smart Meter Reading (kWh) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Activity size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    className="form-input pl-10" 
                    placeholder="Total kWh recorded by physical meter"
                    required 
                    value={formData.meter_kwh}
                    onChange={e => setFormData({ ...formData, meter_kwh: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Notes (Optional)</label>
                <textarea 
                  className="form-input" 
                  rows={3} 
                  placeholder="e.g. Weekly audit for Airport Station"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1" disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
