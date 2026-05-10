'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Search, Wallet, AlertTriangle, Zap, ChevronRight, Users, Edit, Trash2 } from 'lucide-react';
import type { Driver } from '@/lib/types';
import { useDrivers, useVehicles } from '@/hooks/use-database';
import { useAuthStore } from '@/store/auth';
import { updateDriver, deleteDriver } from '@/app/actions/drivers';

export default function DriversPage() {
  const { user } = useAuthStore();
  const { data: drivers, isLoading, refetch } = useDrivers();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Driver | null>(null);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const { data: vehicles } = useVehicles();

  const currentDrivers = drivers || [];

  const handleEdit = (driver: Driver) => {
    const v = vehicles?.find(v => v.driverId === driver.id);
    setEditForm({
      ...driver,
      vehicle_brand: v?.brand || '',
      vehicle_model: v?.model || '',
      vehicle_plate: v?.plateNumber || '',
    });
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    if (!editForm.id || !editForm.name || !editForm.phone) return;
    setLoading(true);
    const res = await updateDriver(editForm.id, {
      name: editForm.name,
      phone: editForm.phone,
      email: editForm.email,
      type: editForm.type as any,
      vehicle: editForm.vehicle_plate ? {
        brand: editForm.vehicle_brand,
        model: editForm.vehicle_model,
        plate_number: editForm.vehicle_plate,
      } : undefined
    });
    setLoading(false);
    if (res.success) {
      setIsEditing(false);
      setSelected(null);
      await refetch();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this driver? All associated vehicle links will be removed.')) return;
    setLoading(true);
    const res = await deleteDriver(id);
    setLoading(false);
    if (res.success) {
      setSelected(null);
      await refetch();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const filtered = currentDrivers.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search);
    const matchType = typeFilter === 'all' || d.type === typeFilter;
    return matchSearch && matchType;
  });

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div>
      <TopBar title="Drivers" subtitle="View and manage registered EV drivers" />
      <div className="p-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Drivers', value: currentDrivers.length, color: '#1d4ed8' },
            { label: 'Individual', value: currentDrivers.filter(d => d.type === 'individual').length, color: '#7c3aed' },
            { label: 'Corporate', value: currentDrivers.filter(d => d.type === 'corporate').length, color: '#0891b2' },
            { label: 'With Debt', value: currentDrivers.filter(d => d.debtBalance > 0).length, color: '#dc2626' },
          ].map(card => (
            <div key={card.label} className="stat-card">
              <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search drivers by name or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Types</option>
              <option value="individual">Individual</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Driver</th><th>Type</th><th>Phone</th><th>Wallet</th><th>Debt</th><th>Sessions</th><th>Joined</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(driver => (
                  <tr key={driver.id} className="cursor-pointer" onClick={() => setSelected(driver)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: driver.type === 'corporate' ? '#0891b2' : '#1d4ed8' }}>
                          {driver.name[0]}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--foreground)' }}>{driver.name}</div>
                          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{driver.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${driver.type === 'corporate' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700'}`}>{driver.type}</span></td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{driver.phone}</td>
                    <td><span className="font-medium text-green-600">{formatCurrency(driver.walletBalance)}</span></td>
                    <td><span className={`font-medium ${driver.debtBalance > 0 ? 'text-red-600' : 'text-slate-400'}`}>{formatCurrency(driver.debtBalance)}</span></td>
                    <td>{driver.totalSessions}</td>
                    <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">{formatDate(driver.createdAt)}</td>
                    <td><ChevronRight size={16} style={{ color: 'var(--muted-foreground)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Driver detail panel */}
        {selected && !isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Driver Details</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold bg-blue-600 text-xl">{selected.name[0]}</div>
                  <div>
                    <div className="font-bold">{selected.name}</div>
                    <div className="text-sm text-slate-500">{selected.phone}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs text-slate-500">Wallet</div>
                    <div className="font-bold text-green-600">{formatCurrency(selected.walletBalance)}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs text-slate-500">Debt</div>
                    <div className="font-bold text-red-600">{formatCurrency(selected.debtBalance)}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(selected)} className="btn btn-primary flex-1 gap-2"><Edit size={14}/> Edit Profile</button>
                  {isSuperAdmin && (
                    <button onClick={() => handleDelete(selected.id)} className="btn bg-red-50 text-red-600 hover:bg-red-100 border-red-200 gap-2"><Trash2 size={14}/></button>
                  )}
                  <button onClick={() => setSelected(null)} className="btn btn-secondary flex-1">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card max-w-md w-full" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
              <h2 className="font-semibold text-lg mb-4">Edit Driver & Vehicle</h2>
              <div className="space-y-6">
                {/* Driver Section */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase">Driver Info</div>
                  <div>
                    <label className="form-label text-xs">Full Name</label>
                    <input className="form-input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">Phone Number</label>
                      <input className="form-input" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Driver Type</label>
                      <select className="form-select" value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value as any})}>
                        <option value="individual">Individual</option>
                        <option value="corporate">Corporate</option>
                      </select>
                    </div>
                  </div>
                </div>

                <hr style={{ borderColor: 'var(--border)' }} />

                {/* Vehicle Section */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase">Vehicle Info</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">Brand</label>
                      <input className="form-input" value={editForm.vehicle_brand} onChange={e => setEditForm({...editForm, vehicle_brand: e.target.value})} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Model</label>
                      <input className="form-input" value={editForm.vehicle_model} onChange={e => setEditForm({...editForm, vehicle_model: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label text-xs">Plate Number</label>
                    <input className="form-input font-mono" value={editForm.vehicle_plate} onChange={e => setEditForm({...editForm, vehicle_plate: e.target.value.toUpperCase()})} />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setIsEditing(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={handleUpdate} className="btn btn-primary flex-1" disabled={loading}>
                    {loading ? 'Saving...' : 'Update Details'}
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
