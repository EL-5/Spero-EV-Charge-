'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatDate } from '@/lib/utils';
import { Search, Car, Zap, Building2, Edit, Trash2 } from 'lucide-react';
import { useVehicles, useDrivers } from '@/hooks/use-database';
import { useAuthStore } from '@/store/auth';
import { updateVehicle, deleteVehicle } from '@/app/actions/vehicles';

export default function VehiclesPage() {
  const { user } = useAuthStore();
  const { data: vehicles, isLoading, refetch } = useVehicles();
  const { data: drivers } = useDrivers();
  const [search, setSearch] = useState('');
  
  // Edit State
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const currentVehicles = vehicles || [];

  const handleEdit = (vehicle: any) => {
    setEditingVehicle(vehicle);
    setEditForm({
      brand: vehicle.brand,
      model: vehicle.model,
      plate_number: vehicle.plateNumber,
      driver_id: vehicle.driverId || '',
    });
  };

  const handleUpdate = async () => {
    if (!editingVehicle || !editForm.brand || !editForm.plate_number) return;
    setLoading(true);
    const res = await updateVehicle(editingVehicle.id, editForm);
    setLoading(false);
    if (res.success) {
      setEditingVehicle(null);
      await refetch();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;
    setLoading(true);
    const res = await deleteVehicle(id);
    setLoading(false);
    if (res.success) {
      await refetch();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const filtered = currentVehicles.filter(v =>
    v.brand.toLowerCase().includes(search.toLowerCase()) ||
    v.model.toLowerCase().includes(search.toLowerCase()) ||
    v.plateNumber.toLowerCase().includes(search.toLowerCase())
  );

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div>
      <TopBar title="Vehicles" subtitle="View and manage registered EV vehicles" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#1d4ed8' }}>{currentVehicles.length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Vehicles</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{currentVehicles.filter(v => v.driverId).length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Individual</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#0891b2' }}>{currentVehicles.filter(v => v.corporateAccountId).length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Fleet / Corporate</div>
          </div>
        </div>

        {/* Search */}
        <div className="stat-card">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Search by brand, plate, or model..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* Vehicle grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(vehicle => (
            <div key={vehicle.id} className="stat-card group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: vehicle.corporateAccountId ? '#e0f2fe' : '#eff6ff' }}>
                  <Car size={20} style={{ color: vehicle.corporateAccountId ? '#0891b2' : '#1d4ed8' }} />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                    {vehicle.plateNumber}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(vehicle)} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"><Edit size={14} /></button>
                    {isSuperAdmin && (
                      <button onClick={() => handleDelete(vehicle.id)} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              </div>
              <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{vehicle.brand} {vehicle.model}</div>
              <div className="flex items-center gap-1.5 mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {vehicle.corporateAccountId ? (
                  <><Building2 size={13} /> Fleet Vehicle</>
                ) : (
                  <>{drivers?.find(d => d.id === vehicle.driverId)?.name || 'Individual'}</>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                <Zap size={13} />
                <span>{vehicle.totalSessions} sessions</span>
              </div>
            </div>
          ))}
        </div>

        {/* Edit Modal */}
        {editingVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card max-w-md w-full">
              <h2 className="font-semibold text-lg mb-4">Edit Vehicle</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Brand</label>
                    <input className="form-input" value={editForm.brand} onChange={e => setEditForm({...editForm, brand: e.target.value})} />
                  </div>
                  <div>
                    <label className="form-label">Model</label>
                    <input className="form-input" value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Plate Number</label>
                  <input className="form-input" value={editForm.plate_number} onChange={e => setEditForm({...editForm, plate_number: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="form-label">Assign to Driver</label>
                  <select className="form-select" value={editForm.driver_id} onChange={e => setEditForm({...editForm, driver_id: e.target.value})}>
                    <option value="">— Unassigned —</option>
                    {drivers?.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditingVehicle(null)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={handleUpdate} className="btn btn-primary flex-1" disabled={loading}>
                    {loading ? 'Saving...' : 'Update Vehicle'}
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
