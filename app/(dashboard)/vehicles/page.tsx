'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockVehicles } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';
import { Search, Plus, Car, Zap, Building2 } from 'lucide-react';

export default function VehiclesPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = mockVehicles.filter(v =>
    v.brand.toLowerCase().includes(search.toLowerCase()) ||
    v.model.toLowerCase().includes(search.toLowerCase()) ||
    v.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
    (v.driverName || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <TopBar title="Vehicles" subtitle="Manage registered EV vehicles" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#1d4ed8' }}>{mockVehicles.length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Vehicles</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{mockVehicles.filter(v => v.driverId).length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Individual</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#0891b2' }}>{mockVehicles.filter(v => v.corporateAccountId).length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Fleet/Corporate</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search by brand, plate, or driver..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-2">
              <Plus size={16} /> Add Vehicle
            </button>
          </div>
        </div>

        {/* Vehicle grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(vehicle => (
            <div key={vehicle.id} className="stat-card cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: vehicle.corporateAccountId ? '#e0f2fe' : '#eff6ff' }}>
                  <Car size={20} style={{ color: vehicle.corporateAccountId ? '#0891b2' : '#1d4ed8' }} />
                </div>
                <span className="font-mono text-xs font-bold px-2 py-1 rounded" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                  {vehicle.plateNumber}
                </span>
              </div>
              <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{vehicle.brand} {vehicle.model}</div>
              <div className="flex items-center gap-1.5 mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {vehicle.corporateAccountId ? (
                  <><Building2 size={13} /> Fleet Vehicle</>
                ) : (
                  <>{vehicle.driverName}</>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                <Zap size={13} />
                <span>{vehicle.totalSessions} sessions</span>
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Added {formatDate(vehicle.createdAt)}</div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
            <Car className="mx-auto mb-2 opacity-30" size={32} />
            <p>No vehicles found</p>
          </div>
        )}

        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Add New Vehicle</h2>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Brand *</label>
                    <input className="form-input" placeholder="e.g. Tesla, BYD" />
                  </div>
                  <div>
                    <label className="form-label">Model *</label>
                    <input className="form-input" placeholder="e.g. Model 3" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Plate Number *</label>
                  <input className="form-input" placeholder="e.g. GR-1234-24" />
                </div>
                <div>
                  <label className="form-label">Association</label>
                  <select className="form-select">
                    <option value="">— Individual Driver —</option>
                    <option value="ca1">GreenFleet Ghana Ltd</option>
                    <option value="ca2">EcoRide Logistics</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={() => setShowAdd(false)} className="btn btn-primary flex-1">Add Vehicle</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
