'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockPricingHistory } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';
import Image from 'next/image';
import { Settings, DollarSign, Zap, CreditCard, Wallet, AlertTriangle, FileText, Palette } from 'lucide-react';

const tabs = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'pricing', label: 'Pricing', icon: Zap },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'wallet', label: 'Wallet & Debt', icon: Wallet },
  { id: 'receipts', label: 'Receipts', icon: FileText },
  { id: 'branding', label: 'Branding', icon: Palette },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [showNewRate, setShowNewRate] = useState(false);
  const [unitType, setUnitType] = useState<'kwh' | 'minutes'>('kwh');

  return (
    <div>
      <TopBar title="Settings" subtitle="System configuration and preferences" />
      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tab nav */}
          <div className="w-full lg:w-52 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all"
                    style={{
                      background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                      color: activeTab === tab.id ? 'var(--primary)' : 'var(--muted-foreground)',
                      fontWeight: activeTab === tab.id ? 500 : 400,
                    }}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            {activeTab === 'general' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>General Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Station Name</label>
                    <input className="form-input" defaultValue="Spero EV Charging Station" />
                  </div>
                  <div>
                    <label className="form-label">Location / Address</label>
                    <input className="form-input" defaultValue="Accra, Ghana" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Currency</label>
                      <select className="form-select" defaultValue="GHS">
                        <option value="GHS">GHS — Ghana Cedis</option>
                        <option value="NGN">NGN — Nigerian Naira</option>
                        <option value="KES">KES — Kenyan Shilling</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Timezone</label>
                      <select className="form-select" defaultValue="Africa/Accra">
                        <option value="Africa/Accra">Africa/Accra (GMT+0)</option>
                        <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                        <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Operating Hours</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Open</label>
                        <input type="time" className="form-input" defaultValue="06:00" />
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Close</label>
                        <input type="time" className="form-input" defaultValue="22:00" />
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-primary">Save General Settings</button>
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="space-y-4">
                <div className="stat-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Current Pricing</h3>
                    <button onClick={() => setShowNewRate(true)} className="btn btn-primary btn-sm">Update Rate</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {mockPricingHistory.filter(p => p.isActive).map(p => (
                      <div key={p.id} className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={16} className="text-blue-600" />
                          <span className="font-semibold text-blue-800 capitalize">{p.unitType === 'kwh' ? 'kWh' : 'Per Minute'} Rate</span>
                          <span className="badge bg-green-100 text-green-700 ml-auto">Active</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-900">
                          {p.currency} {p.pricePerUnit.toFixed(2)}
                          <span className="text-base font-normal text-blue-600 ml-1">/{p.unitType === 'kwh' ? 'kWh' : 'min'}</span>
                        </div>
                        <div className="text-xs text-blue-600 mt-1">Effective from {formatDate(p.effectiveFrom)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stat-card overflow-hidden">
                  <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Rate History</h3>
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Unit Type</th>
                          <th>Price</th>
                          <th>Currency</th>
                          <th>Effective From</th>
                          <th>Created By</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mockPricingHistory.map(p => (
                          <tr key={p.id}>
                            <td className="capitalize font-medium">{p.unitType}</td>
                            <td className="font-bold">{p.pricePerUnit.toFixed(2)}</td>
                            <td>{p.currency}</td>
                            <td>{formatDate(p.effectiveFrom)}</td>
                            <td style={{ color: 'var(--muted-foreground)' }}>{p.createdBy}</td>
                            <td>
                              <span className={`badge ${p.isActive ? 'status-active' : 'bg-gray-100 text-gray-500'}`}>
                                {p.isActive ? 'Active' : 'Superseded'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
                  <strong>Important:</strong> Rate changes apply only to new sessions. All historical sessions retain the rate at time of creation (rate versioning enabled).
                </div>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Payment Provider Settings</h3>
                <div className="space-y-5">
                  {/* Cash */}
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign size={18} style={{ color: '#16a34a' }} />
                        <span className="font-semibold">Cash Payments</span>
                      </div>
                      <span className="badge status-active">Enabled</span>
                    </div>
                  </div>
                  {/* Hubtel */}
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Hubtel MoMo</span>
                      </div>
                      <span className="badge status-active">Enabled</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label text-xs">Client ID</label>
                        <input type="password" className="form-input" placeholder="hubtel_client_id" defaultValue="hbt_xxxxxxxx" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Client Secret</label>
                        <input type="password" className="form-input" placeholder="hubtel_secret" defaultValue="•••••••••••••" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Sender ID</label>
                        <input className="form-input" placeholder="Your business ID" defaultValue="SPERO-EV" />
                      </div>
                    </div>
                  </div>
                  {/* Paystack */}
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Paystack</span>
                      </div>
                      <span className="badge status-active">Enabled</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label text-xs">Public Key</label>
                        <input type="password" className="form-input" defaultValue="pk_live_xxxxxxxx" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Secret Key</label>
                        <input type="password" className="form-input" defaultValue="sk_live_xxxxxxxx" />
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-primary">Save Payment Settings</button>
                </div>
              </div>
            )}

            {activeTab === 'wallet' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Wallet & Debt Rules</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Enable wallet system', type: 'toggle', default: true },
                    { label: 'Auto-apply wallet on payment', type: 'toggle', default: true },
                    { label: 'Allow bonus credits', type: 'toggle', default: true },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{item.label}</span>
                      <button
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                        style={{ background: item.default ? 'var(--primary)' : 'var(--border)' }}
                      >
                        <span
                          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: item.default ? 'translateX(22px)' : 'translateX(2px)' }}
                        />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="form-label">Max Debt Threshold (GHS)</label>
                      <input type="number" className="form-input" defaultValue={500} />
                    </div>
                    <div>
                      <label className="form-label">Debt Warning Threshold (GHS)</label>
                      <input type="number" className="form-input" defaultValue={100} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Debt block policy</label>
                    <select className="form-select">
                      <option value="block_postpaid">Block postpaid only</option>
                      <option value="block_all">Block all sessions</option>
                      <option value="warn_only">Warn only (no block)</option>
                    </select>
                  </div>
                  <button className="btn btn-primary">Save Wallet Rules</button>
                </div>
              </div>
            )}

            {activeTab === 'receipts' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Receipt Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Station Name on Receipt</label>
                    <input className="form-input" defaultValue="SPERO ENERGY RESOURCES LIMITED" />
                  </div>
                  <div>
                    <label className="form-label">Address Line</label>
                    <input className="form-input" defaultValue="Accra, Ghana | Tel: +233 30 000 0000" />
                  </div>
                  <div>
                    <label className="form-label">Receipt Footer Message</label>
                    <input className="form-input" defaultValue="Thank you for charging with us!" />
                  </div>
                  <div>
                    <label className="form-label">Receipt Number Prefix</label>
                    <input className="form-input" defaultValue="RCP-" />
                  </div>
                  <div>
                    <label className="form-label">Next Receipt Number</label>
                    <input type="number" className="form-input" defaultValue={7} />
                  </div>
                  <button className="btn btn-primary">Save Receipt Settings</button>
                </div>
              </div>
            )}

            {activeTab === 'branding' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Branding</h3>
                <div className="space-y-5">
                  <div>
                    <label className="form-label">Company Logo</label>
                    <div className="flex items-center gap-4 p-4 border rounded-xl" style={{ borderColor: 'var(--border)' }}>
                      <Image src="/spero-logo.png" alt="SPERO Logo" width={80} height={80} className="object-contain" />
                      <div>
                        <div className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Current Logo</div>
                        <button className="btn btn-secondary btn-sm">Upload New Logo</button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Primary Color</label>
                      <div className="flex gap-2">
                        <input type="color" className="h-10 w-14 rounded border" style={{ borderColor: 'var(--border)' }} defaultValue="#1d4ed8" />
                        <input className="form-input" defaultValue="#1d4ed8" />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">App Name</label>
                      <input className="form-input" defaultValue="SCMS" />
                    </div>
                  </div>
                  <button className="btn btn-primary">Save Branding</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {showNewRate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Update Pricing Rate</h2>
                <button onClick={() => setShowNewRate(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                Changing the rate will only affect new sessions. Historical sessions retain their original rates.
              </div>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Unit Type</label>
                  <select className="form-select" value={unitType} onChange={e => setUnitType(e.target.value as any)}>
                    <option value="kwh">kWh</option>
                    <option value="minutes">Minutes</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">New Price (GHS per {unitType === 'kwh' ? 'kWh' : 'minute'})</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00" min="0.01" />
                </div>
                <div>
                  <label className="form-label">Effective From</label>
                  <input type="date" className="form-input" defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowNewRate(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={() => setShowNewRate(false)} className="btn btn-primary flex-1">Update Rate</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
