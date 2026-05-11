'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatDate } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { Settings, DollarSign, Zap, CreditCard, Wallet, FileText, Palette, CheckCircle, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { saveSettings, updatePricingRate } from '@/app/actions/settings';
import { resetSystem } from '@/app/actions/system';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

const tabs = [
  { id: 'general',  label: 'General',      icon: Settings  },
  { id: 'pricing',  label: 'Pricing',       icon: Zap       },
  { id: 'payments', label: 'Payments',      icon: CreditCard},
  { id: 'wallet',   label: 'Wallet & Debt', icon: Wallet    },
  { id: 'receipts', label: 'Receipts',      icon: FileText  },
  { id: 'branding', label: 'Branding',      icon: Palette   },
  { id: 'maintenance', label: 'Maintenance', icon: RefreshCw },
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function SaveBar({ status, error, onSave }: { status: SaveStatus; error?: string; onSave: () => void }) {
  return (
    <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="text-sm">
        {status === 'saved'  && <span className="flex items-center gap-1.5 text-green-600"><CheckCircle size={14} /> Saved successfully</span>}
        {status === 'error'  && <span className="flex items-center gap-1.5 text-red-600"><AlertTriangle size={14} /> {error || 'Failed to save'}</span>}
        {status === 'saving' && <span style={{ color: 'var(--muted-foreground)' }}>Saving...</span>}
      </div>
      <button onClick={onSave} disabled={status === 'saving'} className="btn btn-primary">
        {status === 'saving' ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
  const [showNewRate, setShowNewRate] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [newUnitType, setNewUnitType] = useState<'kwh' | 'minutes' | 'hours'>('kwh');
  const [newQuantity, setNewQuantity] = useState('1');
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const { user } = useAuthStore();

  // ── Load settings row ──
  const { data: settingsRow, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single();
      if (error) return null;
      return data as any;
    },
  });

  // ── Load pricing ──
  const { data: pricingRates } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pricing').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const rates = pricingRates || [];

  // ── Controlled form state – seeded from DB ──
  const [general, setGeneral] = useState({
    company_name: '', company_phone: '', company_email: '', company_address: '',
    currency: 'GHS', timezone: 'Africa/Accra',
  });
  const [wallet, setWallet] = useState({
    max_debt_threshold: 500, debt_warning_threshold: 100,
    block_postpaid_on_debt: true, manager_override: true,
  });
  const [receipts, setReceipts] = useState({
    receipt_footer: 'Thank you for charging with us!',
    header_title: 'EV Charging Station Receipt',
    show_driver: true,
    show_vehicle: true,
    show_units: true,
    show_rate: true,
    show_payment_method: true,
    show_date: true,
    show_logo: true,
    logo_size: 40,
  });
  const [branding, setBranding] = useState({
    primary_color: '#1d4ed8', 
    app_name: 'SCMS',
    logo_url: '/spero-logo.png',
  });

  // Seed form once settings are loaded
  useEffect(() => {
    if (settingsRow) {
      setGeneral({
        company_name:    settingsRow.company_name    || '',
        company_phone:   settingsRow.company_phone   || '',
        company_email:   settingsRow.company_email   || '',
        company_address: settingsRow.company_address || '',
        currency:        settingsRow.currency        || 'GHS',
        timezone:        settingsRow.timezone        || 'Africa/Accra',
      });
      setWallet({
        max_debt_threshold:     Number(settingsRow.max_debt_threshold)     || 500,
        debt_warning_threshold: Number(settingsRow.debt_warning_threshold) || 100,
        block_postpaid_on_debt: settingsRow.block_postpaid_on_debt !== false,
        manager_override:       settingsRow.manager_override !== false,
      });
      const config = settingsRow.receipt_config || {};
      setReceipts({
        receipt_footer: settingsRow.receipt_footer || '',
        header_title: config.headerTitle || 'EV Charging Station Receipt',
        show_driver: config.showDriver !== false,
        show_vehicle: config.showVehicle !== false,
        show_units: config.showUnits !== false,
        show_rate: config.showRate !== false,
        show_payment_method: config.showPaymentMethod !== false,
        show_date: config.showDate !== false,
        show_logo: config.showLogo !== false,
        logo_size: config.logoSize || 40,
      });
      setBranding({
        primary_color: settingsRow.primary_color || '#1d4ed8',
        app_name:      settingsRow.app_name      || 'SCMS',
        logo_url:      settingsRow.logo_url      || '/spero-logo.png',
      });
    }
  }, [settingsRow]);

  const setStatus = (tab: string, status: SaveStatus) => {
    setSaveStatus(p => ({ ...p, [tab]: status }));
    if (status === 'saved' || status === 'error') {
      setTimeout(() => setSaveStatus(p => ({ ...p, [tab]: 'idle' })), 3000);
    }
  };

  const handleSave = async (tab: string, payload: Record<string, any>) => {
    setStatus(tab, 'saving');
    const res = await saveSettings(payload);
    if (res.success) {
      setStatus(tab, 'saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } else {
      setStatus(tab, 'error');
      setErrorMessages(p => ({ ...p, [tab]: res.error || 'Unknown error' }));
    }
  };

  const handleUpdateRate = async () => {
    if (!newRate || isNaN(Number(newRate)) || Number(newRate) <= 0) {
      alert('Enter a valid rate greater than 0');
      return;
    }
    setStatus('pricing', 'saving');
    const res = await updatePricingRate({ 
      unit_type: newUnitType, 
      unit_quantity: Number(newQuantity),
      rate: Number(newRate) 
    });
    setStatus('pricing', res.success ? 'saved' : 'error');
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      setShowNewRate(false);
      setNewRate('');
      setNewQuantity('1');
    } else {
      alert('Error updating rate: ' + res.error);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file too large. Max 2MB.');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      if (data?.publicUrl) {
        setBranding(prev => ({ ...prev, logo_url: data.publicUrl }));
        // Auto-save branding since we have the URL now
        await handleSave('branding', { 
          primary_color: branding.primary_color,
          app_name: branding.app_name,
          logo_url: data.publicUrl 
        });
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Error uploading logo: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (settingsLoading) {
    return (
      <div>
        <TopBar title="Settings" subtitle="System configuration and preferences" />
        <div className="p-6 text-center py-20" style={{ color: 'var(--muted-foreground)' }}>Loading settings...</div>
      </div>
    );
  }

  if (!settingsRow) {
    return (
      <div>
        <TopBar title="Settings" subtitle="System configuration and preferences" />
        <div className="p-6">
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
            <strong>Settings table not found.</strong> Run the SQL migration in Supabase to initialize the settings row.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Settings" subtitle="System configuration and preferences" />
      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Tab nav */}
          <div className="w-full lg:w-52 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.filter(t => t.id !== 'maintenance' || user?.role === 'super_admin').map(tab => {
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

            {/* ── GENERAL ── */}
            {activeTab === 'general' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>General Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="form-label">Station / Company Name</label>
                    <input className="form-input" value={general.company_name} onChange={e => setGeneral({ ...general, company_name: e.target.value })} placeholder="Spero EV Charging Station" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Phone</label>
                      <input className="form-input" value={general.company_phone} onChange={e => setGeneral({ ...general, company_phone: e.target.value })} placeholder="+233 30 000 0000" />
                    </div>
                    <div>
                      <label className="form-label">Email</label>
                      <input type="email" className="form-input" value={general.company_email} onChange={e => setGeneral({ ...general, company_email: e.target.value })} placeholder="info@spero.com" />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Address</label>
                    <input className="form-input" value={general.company_address} onChange={e => setGeneral({ ...general, company_address: e.target.value })} placeholder="Accra, Ghana" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Currency</label>
                      <select className="form-select" value={general.currency} onChange={e => setGeneral({ ...general, currency: e.target.value })}>
                        <option value="GHS">GHS — Ghana Cedis</option>
                        <option value="NGN">NGN — Nigerian Naira</option>
                        <option value="KES">KES — Kenyan Shilling</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Timezone</label>
                      <select className="form-select" value={general.timezone} onChange={e => setGeneral({ ...general, timezone: e.target.value })}>
                        <option value="Africa/Accra">Africa/Accra (GMT+0)</option>
                        <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                        <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                      </select>
                    </div>
                  </div>
                  <SaveBar 
                    status={saveStatus['general'] || 'idle'} 
                    error={errorMessages['general']}
                    onSave={() => handleSave('general', general)} 
                  />
                </div>
              </div>
            )}

            {/* ── PRICING ── */}
            {activeTab === 'pricing' && (
              <div className="space-y-4">
                <div className="stat-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Current Pricing</h3>
                    <button onClick={() => setShowNewRate(true)} className="btn btn-primary btn-sm">Update Rate</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rates.filter((p: any) => p.is_active).length === 0 && (
                      <div className="col-span-2 py-10 text-center border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                        <Zap size={24} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No active rates configured for this station.</p>
                      </div>
                    )}
                    {rates.filter((p: any) => p.is_active).map((p: any) => (
                      <div key={p.id} className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-blue-800">
                            {p.unit_type === 'kwh' ? 'kWh Consumption' : p.unit_type === 'minutes' ? 'Per-Minute Rate' : 'Hourly Rate'}
                          </span>
                          <span className="badge bg-green-100 text-green-700 ml-auto">Active</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-900">
                          GHS {Number(p.rate).toFixed(2)}
                          <span className="text-base font-normal text-blue-600 ml-1">
                            / {Number(p.unit_quantity) === 1 ? '' : p.unit_quantity} {p.unit_type === 'kwh' ? 'kWh' : p.unit_type === 'minutes' ? 'min' : 'hr'}
                          </span>
                        </div>
                        <div className="text-xs text-blue-600 mt-1">Set on {formatDate(p.created_at)}</div>
                      </div>
                    ))}
                  </div>
                  {saveStatus['pricing'] === 'saved' && (
                    <div className="flex items-center gap-1.5 text-green-600 text-sm mt-3"><CheckCircle size={14} /> Rate updated successfully</div>
                  )}
                </div>

                {/* Rate history */}
                <div className="stat-card overflow-hidden">
                  <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Rate History</h3>
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Unit Type</th><th>Rate</th><th>Currency</th><th>Set On</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rates.map((p: any) => (
                          <tr key={p.id}>
                            <td className="capitalize font-medium">{Number(p.unit_quantity)} {p.unit_type}</td>
                            <td className="font-bold">{Number(p.rate).toFixed(2)}</td>
                            <td>GHS</td>
                            <td>{formatDate(p.created_at)}</td>
                            <td>
                              <span className={`badge ${p.is_active ? 'status-active' : 'bg-gray-100 text-gray-500'}`}>
                                {p.is_active ? 'Active' : 'Superseded'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
                  <strong>Note:</strong> Rate changes apply only to new sessions. Historical sessions retain the rate at time of creation.
                </div>
              </div>
            )}

            {/* ── PAYMENTS ── */}
            {activeTab === 'payments' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Payment Provider Settings</h3>
                <div className="space-y-5">
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign size={18} style={{ color: '#16a34a' }} />
                        <span className="font-semibold">Cash Payments</span>
                      </div>
                      <span className="badge status-active">Always Enabled</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Hubtel MoMo</span>
                      <span className="badge status-active">Configured via .env</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="form-label text-xs">Client ID</label><input type="password" className="form-input" placeholder="From .env.local" disabled /></div>
                      <div><label className="form-label text-xs">Client Secret</label><input type="password" className="form-input" placeholder="From .env.local" disabled /></div>
                      <div><label className="form-label text-xs">Sender ID</label><input className="form-input" placeholder="SPERO-EV" disabled /></div>
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Hubtel keys are stored in <code>.env.local</code> and cannot be edited here for security.</p>
                  </div>
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Paystack</span>
                      <span className="badge status-active">Configured via .env</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="form-label text-xs">Public Key</label><input type="password" className="form-input" placeholder="From .env.local" disabled /></div>
                      <div><label className="form-label text-xs">Secret Key</label><input type="password" className="form-input" placeholder="From .env.local" disabled /></div>
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Paystack keys are stored in <code>.env.local</code> and cannot be edited here for security.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── WALLET & DEBT ── */}
            {activeTab === 'wallet' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Wallet & Debt Rules</h3>
                <div className="space-y-4">
                  {[
                    { key: 'block_postpaid_on_debt', label: 'Block postpaid if driver has debt' },
                    { key: 'manager_override',       label: 'Allow manager override on debt block' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{item.label}</span>
                      <button
                        onClick={() => setWallet(w => ({ ...w, [item.key]: !w[item.key as keyof typeof w] }))}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                        style={{ background: wallet[item.key as keyof typeof wallet] ? 'var(--primary)' : 'var(--border)' }}
                      >
                        <span
                          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: wallet[item.key as keyof typeof wallet] ? 'translateX(22px)' : 'translateX(2px)' }}
                        />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="form-label">Max Debt Threshold (GHS)</label>
                      <input type="number" className="form-input" value={wallet.max_debt_threshold} onChange={e => setWallet({ ...wallet, max_debt_threshold: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="form-label">Warning Threshold (GHS)</label>
                      <input type="number" className="form-input" value={wallet.debt_warning_threshold} onChange={e => setWallet({ ...wallet, debt_warning_threshold: Number(e.target.value) })} />
                    </div>
                  </div>
                  <SaveBar 
                    status={saveStatus['wallet'] || 'idle'} 
                    error={errorMessages['wallet']}
                    onSave={() => handleSave('wallet', wallet)} 
                  />
                </div>
              </div>
            )}

            {/* ── RECEIPTS ── */}
            {activeTab === 'receipts' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="stat-card h-fit">
                  <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Customize Receipt</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="form-label">Receipt Header Title</label>
                      <input 
                        className="form-input" 
                        value={receipts.header_title} 
                        onChange={e => setReceipts({ ...receipts, header_title: e.target.value })} 
                        placeholder="EV Charging Station Receipt" 
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="form-label text-xs uppercase tracking-wider text-slate-400">Visibility Settings</label>
                      {[
                        { key: 'show_driver', label: 'Show Driver Name' },
                        { key: 'show_vehicle', label: 'Show Vehicle Details' },
                        { key: 'show_units', label: 'Show Energy Units (kWh/min)' },
                        { key: 'show_rate', label: 'Show Rate per Unit' },
                        { key: 'show_payment_method', label: 'Show Payment Method' },
                        { key: 'show_date', label: 'Show Transaction Date' },
                        { key: 'show_logo', label: 'Show Logo' },
                      ].map(item => (
                        <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          <button
                            onClick={() => setReceipts(r => ({ ...r, [item.key]: !r[item.key as keyof typeof r] }))}
                            className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors"
                            style={{ background: receipts[item.key as keyof typeof receipts] ? 'var(--primary)' : '#cbd5e1' }}
                          >
                            <span
                              className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                              style={{ transform: receipts[item.key as keyof typeof receipts] ? 'translateX(22px)' : 'translateX(4px)' }}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                    {receipts.show_logo && (
                      <div>
                        <label className="form-label flex justify-between">
                          <span>Logo Size</span>
                          <span className="text-blue-600 font-bold">{receipts.logo_size}px</span>
                        </label>
                        <input 
                          type="range" 
                          min="20" 
                          max="100" 
                          step="5"
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          value={receipts.logo_size}
                          onChange={e => setReceipts({ ...receipts, logo_size: Number(e.target.value) })}
                        />
                      </div>
                    )}

                    <div>
                      <label className="form-label">Receipt Footer Message</label>
                      <textarea 
                        className="form-input h-20 resize-none" 
                        value={receipts.receipt_footer} 
                        onChange={e => setReceipts({ ...receipts, receipt_footer: e.target.value })} 
                        placeholder="Thank you for charging with us!" 
                      />
                    </div>
                    
                    <SaveBar 
                      status={saveStatus['receipts'] || 'idle'} 
                      error={errorMessages['receipts']}
                      onSave={() => handleSave('receipts', { 
                        receipt_footer: receipts.receipt_footer,
                        receipt_config: {
                          headerTitle: receipts.header_title,
                          showDriver: receipts.show_driver,
                          showVehicle: receipts.show_vehicle,
                          showUnits: receipts.show_units,
                          showRate: receipts.show_rate,
                          showPaymentMethod: receipts.show_payment_method,
                          showDate: receipts.show_date,
                          showLogo: receipts.show_logo,
                          logoSize: receipts.logo_size,
                        }
                      })} 
                    />
                  </div>
                </div>

                {/* Live Preview */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-500 uppercase text-xs tracking-widest ml-2">Live Preview</h3>
                  <div className="stat-card border-dashed border-2 bg-slate-50/30 flex flex-col items-center justify-center py-10">
                    <div className="w-full max-w-[320px] bg-white shadow-2xl rounded-sm p-8 text-center text-slate-800 font-mono text-sm border-t-4 border-blue-600">
                      {receipts.show_logo && (
                        <div className="flex justify-center mb-4">
                          <Image src={branding.logo_url} alt="Logo" width={receipts.logo_size} height={receipts.logo_size} className="object-contain" />
                        </div>
                      )}
                      <div className="font-black text-lg mb-0.5 uppercase">{general.company_name || 'STATION NAME'}</div>
                      <div className="text-[10px] text-slate-500 mb-4">{receipts.header_title || 'Charging Receipt'}</div>
                      
                      <div className="border-t border-b border-dashed border-slate-200 py-4 my-4 space-y-2 text-left">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Receipt #</span>
                          <span className="font-bold">RCP-TEST-001</span>
                        </div>
                        
                        {receipts.show_date && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Date</span>
                            <span>{new Date().toLocaleDateString()}</span>
                          </div>
                        )}
                        
                        {receipts.show_driver && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Driver</span>
                            <span>Ernest Osei</span>
                          </div>
                        )}
                        
                        {receipts.show_vehicle && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Vehicle</span>
                            <span>GR-2024-EV</span>
                          </div>
                        )}

                        {receipts.show_units && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Energy Units</span>
                            <span>25.4 kWh</span>
                          </div>
                        )}

                        {receipts.show_rate && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Rate</span>
                            <span>GHS 5.50/kWh</span>
                          </div>
                        )}

                        <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
                          <span className="font-black">TOTAL</span>
                          <span className="font-black text-blue-600">GHS 139.70</span>
                        </div>

                        {receipts.show_payment_method && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Paid Via</span>
                            <span className="uppercase text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded">Cash</span>
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 leading-relaxed italic">
                        {receipts.receipt_footer || 'Thank you!'}
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-slate-400 italic">This is how your printed and digital receipts will look.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── BRANDING ── */}
            {activeTab === 'branding' && (
              <div className="stat-card">
                <h3 className="font-semibold mb-5" style={{ color: 'var(--foreground)' }}>Branding</h3>
                <div className="space-y-5">
                  <div>
                    <label className="form-label">Company Logo</label>
                    <div className="flex items-center gap-4 p-4 border rounded-xl" style={{ borderColor: 'var(--border)' }}>
                      <Image src={branding.logo_url} alt="Logo" width={80} height={80} className="object-contain" />
                        <div className="flex-1">
                          <div className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Logo Settings</div>
                          
                          <div className="flex items-center gap-3 mb-4">
                            <input 
                              type="file" 
                              id="logo-upload" 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleLogoUpload}
                              disabled={isUploading}
                            />
                            <label 
                              htmlFor="logo-upload" 
                              className={`btn btn-secondary btn-sm cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              {isUploading ? 'Uploading...' : 'Change Logo'}
                            </label>
                            <span className="text-[10px] text-slate-400">Max 2MB. PNG, JPG or SVG.</span>
                          </div>

                          <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">Logo URL</div>
                          <input 
                            className="form-input text-xs mb-2" 
                            value={branding.logo_url} 
                            onChange={e => setBranding({ ...branding, logo_url: e.target.value })} 
                            placeholder="/spero-logo.png" 
                          />
                          <div className="text-[10px] text-slate-400">Enter a public URL or upload from your device.</div>
                        </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Primary Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          className="h-10 w-14 rounded border"
                          style={{ borderColor: 'var(--border)' }}
                          value={branding.primary_color}
                          onChange={e => setBranding({ ...branding, primary_color: e.target.value })}
                        />
                        <input
                          className="form-input"
                          value={branding.primary_color}
                          onChange={e => setBranding({ ...branding, primary_color: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">App Name</label>
                      <input className="form-input" value={branding.app_name} onChange={e => setBranding({ ...branding, app_name: e.target.value })} />
                    </div>
                  </div>
                  <SaveBar 
                    status={saveStatus['branding'] || 'idle'} 
                    error={errorMessages['branding']}
                    onSave={() => handleSave('branding', {
                      primary_color: branding.primary_color,
                      app_name: branding.app_name,
                      logo_url: branding.logo_url
                    })} 
                  />
                </div>
              )}
            {/* ── MAINTENANCE ── */}
            {activeTab === 'maintenance' && user?.role === 'super_admin' && (
              <div className="space-y-6">
                <div className="stat-card border-red-100 bg-red-50/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-red-100 text-red-600">
                      <Trash2 size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-red-900">System Reset</h3>
                      <p className="text-xs text-red-600">Fresh start for the entire station</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 space-y-2">
                      <p className="font-bold flex items-center gap-2">
                        <AlertTriangle size={16} /> WARNING: This action is irreversible
                      </p>
                      <p>Performing a system reset will permanently delete:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2 text-xs opacity-80">
                        <li>All Charging Sessions & History</li>
                        <li>All Payment Records & Financial Logs</li>
                        <li>All Registered Drivers & Vehicles</li>
                        <li>All Wallet Balances & Debt Histories</li>
                        <li>All Shift Records & System Notifications</li>
                      </ul>
                      <p className="pt-2 font-semibold italic">Core settings, pricing rates, and staff accounts will be preserved.</p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">To confirm, type "RESET SYSTEM" below</label>
                      <input 
                        className="form-input border-red-200 focus:border-red-500 focus:ring-red-200" 
                        placeholder="RESET SYSTEM"
                        value={resetConfirm}
                        onChange={e => setResetConfirm(e.target.value)}
                      />
                      <button 
                        onClick={async () => {
                          if (resetConfirm !== 'RESET SYSTEM') return;
                          if (!user) return;
                          
                          setIsResetting(true);
                          const res = await resetSystem(user.id);
                          setIsResetting(false);
                          
                          if (res.success) {
                            toast.success('System has been reset successfully!');
                            setResetConfirm('');
                            queryClient.invalidateQueries();
                          } else {
                            toast.error('Reset failed: ' + res.error);
                          }
                        }}
                        disabled={resetConfirm !== 'RESET SYSTEM' || isResetting}
                        className="btn bg-red-600 hover:bg-red-700 text-white w-full gap-2 py-3 shadow-lg shadow-red-200 disabled:opacity-50"
                      >
                        {isResetting ? (
                          <RefreshCw size={18} className="animate-spin" />
                        ) : (
                          <Trash2 size={18} />
                        )}
                        {isResetting ? 'Resetting System Data...' : 'Wipe System Data & Fresh Start'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>System Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Last Deployment</div>
                      <div className="text-sm font-medium text-slate-700">{formatDate(new Date().toISOString())}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Environment</div>
                      <div className="text-sm font-medium text-slate-700">Production</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Update Rate Modal ── */}
        {showNewRate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Update Pricing Rate</h2>
                <button onClick={() => setShowNewRate(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                Rate changes apply only to new sessions. Historical sessions keep their original rate.
              </div>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Unit Type</label>
                  <select className="form-select" value={newUnitType} onChange={e => setNewUnitType(e.target.value as any)}>
                    <option value="kwh">kWh (Energy)</option>
                    <option value="minutes">Minutes (Time)</option>
                    <option value="hours">Hours (Time)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Quantity</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newQuantity}
                      onChange={e => setNewQuantity(e.target.value)}
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div>
                    <label className="form-label">Rate (GHS)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="e.g. 5.50"
                      min="0.01"
                      value={newRate}
                      onChange={e => setNewRate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="text-[11px] text-blue-600 font-medium italic">
                  Preview: GHS {newRate || '0.00'} for {newQuantity || '0'} {newUnitType}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowNewRate(false)} className="btn btn-secondary flex-1" disabled={saveStatus['pricing'] === 'saving'}>Cancel</button>
                  <button onClick={handleUpdateRate} className="btn btn-primary flex-1" disabled={saveStatus['pricing'] === 'saving' || !newRate}>
                    {saveStatus['pricing'] === 'saving' ? 'Updating...' : 'Set New Rate'}
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
