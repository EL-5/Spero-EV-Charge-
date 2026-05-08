'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockDrivers } from '@/lib/mock-data';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { Search, Plus, Filter, Wallet, AlertTriangle, Zap, ChevronRight, Users } from 'lucide-react';
import type { Driver } from '@/lib/types';

export default function DriversPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);

  const filtered = mockDrivers.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search);
    const matchType = typeFilter === 'all' || d.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      <TopBar title="Drivers" subtitle="Manage EV drivers and fleet accounts" />
      <div className="p-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Drivers', value: mockDrivers.length, color: '#1d4ed8', bg: '#eff6ff' },
            { label: 'Individual', value: mockDrivers.filter(d => d.type === 'individual').length, color: '#7c3aed', bg: '#f3f0ff' },
            { label: 'Corporate', value: mockDrivers.filter(d => d.type === 'corporate').length, color: '#0891b2', bg: '#e0f2fe' },
            { label: 'With Debt', value: mockDrivers.filter(d => d.debtBalance > 0).length, color: '#dc2626', bg: '#fee2e2' },
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
            <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-2">
              <Plus size={16} /> Add Driver
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Wallet Balance</th>
                  <th>Debt</th>
                  <th>Sessions</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(driver => (
                  <tr key={driver.id} className="cursor-pointer" onClick={() => setSelected(driver)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: driver.type === 'corporate' ? '#0891b2' : '#1d4ed8' }}>
                          {driver.name[0]}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--foreground)' }}>{driver.name}</div>
                          {driver.email && <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{driver.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${driver.type === 'corporate' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700'}`}>
                        {driver.type}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{driver.phone}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Wallet size={14} style={{ color: driver.walletBalance > 0 ? '#16a34a' : 'var(--muted-foreground)' }} />
                        <span className={`font-medium ${driver.walletBalance > 0 ? 'text-green-600' : ''}`}>
                          {formatCurrency(driver.walletBalance)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {driver.debtBalance > 0 ? (
                        <div className="flex items-center gap-1.5 text-red-600">
                          <AlertTriangle size={14} />
                          <span className="font-medium">{formatCurrency(driver.debtBalance)}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Zap size={14} style={{ color: 'var(--muted-foreground)' }} />
                        <span>{driver.totalSessions}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{formatDate(driver.createdAt)}</td>
                    <td><ChevronRight size={16} style={{ color: 'var(--muted-foreground)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>
              <Users className="mx-auto mb-2 opacity-30" size={32} />
              <p>No drivers found</p>
            </div>
          )}
        </div>

        {/* Driver detail modal */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Driver Details</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="flex items-center gap-4 mb-6 p-4 rounded-xl" style={{ background: 'var(--muted)' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ background: selected.type === 'corporate' ? '#0891b2' : '#1d4ed8' }}>
                  {selected.name[0]}
                </div>
                <div>
                  <div className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>{selected.name}</div>
                  <div style={{ color: 'var(--muted-foreground)' }}>{selected.phone}</div>
                  {selected.email && <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{selected.email}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Wallet Balance</div>
                  <div className="font-bold text-green-600">{formatCurrency(selected.walletBalance)}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Debt Balance</div>
                  <div className={`font-bold ${selected.debtBalance > 0 ? 'text-red-600' : ''}`}>{formatCurrency(selected.debtBalance)}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total Sessions</div>
                  <div className="font-bold" style={{ color: 'var(--foreground)' }}>{selected.totalSessions}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Driver Type</div>
                  <div className="font-bold capitalize" style={{ color: 'var(--foreground)' }}>{selected.type}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1">Top Up Wallet</button>
                <button className="btn btn-secondary flex-1">View History</button>
              </div>
            </div>
          </div>
        )}

        {/* Add driver modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Add New Driver</h2>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" placeholder="e.g. Ernest Osei" />
                  </div>
                  <div>
                    <label className="form-label">Phone Number *</label>
                    <input className="form-input" placeholder="+233 24 000 0000" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Email (optional)</label>
                  <input type="email" className="form-input" placeholder="driver@email.com" />
                </div>
                <div>
                  <label className="form-label">Driver Type *</label>
                  <select className="form-select">
                    <option value="individual">Individual</option>
                    <option value="corporate">Corporate / Fleet</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={() => setShowAdd(false)} className="btn btn-primary flex-1">Add Driver</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
