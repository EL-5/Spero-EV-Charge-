'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatDate } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { Settings, DollarSign, Zap, CreditCard, Wallet, FileText, Palette, CheckCircle, AlertTriangle, Trash2, RefreshCw, Plus, Smartphone } from 'lucide-react';
import { saveSettings, updatePricingRate, togglePricingRate } from '@/app/actions/settings';
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
  const [activeTab, setActiveTab] = useState<string>('general');
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

  // ── Controlled form state ──
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

  const handleToggleRate = async (id: string, active: boolean) => {
    const res = await togglePricingRate(id, active);
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      toast.success(`Rate ${active ? 'activated' : 'deactivated'} successfully`);
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      <div className="min-h-screen bg-[#1a1c23]">
        <TopBar title="Settings" subtitle="System configuration and preferences" />
        <div className="p-6 text-center py-20" style={{ color: 'var(--muted-foreground)' }}>Loading settings...</div>
      </div>
    );
  }

  if (!settingsRow) {
    return (
      <div className="min-h-screen bg-[#1a1c23]">
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
    <div className="min-h-screen bg-[#1a1c23]">
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
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>Pricing Menu</h3>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Active rates available to attendants for new sessions</p>
                    </div>
                    <button onClick={() => setShowNewRate(true)} className="btn btn-primary btn-sm flex items-center gap-2">
                      <Plus size={14} /> Add New Tier
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rates.filter((p: any) => p.is_active).length === 0 && (
                      <div className="col-span-2 py-12 text-center border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                        <Zap size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No active pricing tiers found.</p>
                      </div>
                    )}
                    {rates.filter((p: any) => p.is_active).map((p: any) => (
                      <div key={p.id} className="p-4 rounded-xl border border-blue-100 bg-blue-50/20 relative group transition-all hover:bg-blue-50/40">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                              {p.unit_type === 'kwh' ? <Zap size={14} /> : <RefreshCw size={14} />}
                            </span>
                            <span className="font-bold text-slate-800">
                              {p.unit_type === 'kwh' ? 'kWh Meter' : 'Time Based'}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleToggleRate(p.id, false)}
                            className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Deactivate
                          </button>
                        </div>
                        <div className="text-2xl font-black text-slate-900">
                          GHS {Number(p.rate).toFixed(2)}
                          <span className="text-sm font-normal text-slate-500 ml-1">
                            / {Number(p.unit_quantity)} {p.unit_type}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-medium text-slate-400">
                          <span>CREATED {formatDate(p.created_at)}</span>
                          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">LIVE</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stat-card overflow-hidden">
                  <h3 className="font-bold text-slate-800 mb-4">Rate Repository</h3>
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Tier Details</th>
                          <th>Unit Rate</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rates.map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <div className="font-bold text-slate-700 capitalize">
                                {p.unit_type} Billing
                              </div>
                              <div className="text-[10px] text-slate-400 uppercase">
                                {p.unit_quantity} {p.unit_type} units
                              </div>
                            </td>
                            <td>
                              <div className="font-black text-blue-600">GHS {Number(p.rate).toFixed(2)}</div>
                            </td>
                            <td>
                              <span className={`badge ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                {p.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="text-xs text-slate-400">{formatDate(p.created_at)}</td>
                            <td>
                              <button 
                                onClick={() => handleToggleRate(p.id, !p.is_active)}
                                className={`text-[10px] font-black uppercase tracking-widest ${p.is_active ? 'text-red-500' : 'text-blue-600'}`}
                              >
                                {p.is_active ? 'Disable' : 'Enable'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Hubtel keys are managed securely in the server environment.</p>
                  </div>
                  <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Paystack</span>
                      <span className="badge status-active">Configured via .env</span>
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Paystack keys are managed securely in the server environment.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── WALLET & DEBT ── */}
            {activeTab === 'wallet' && (
              <div className="stat-card">
                <h3 className="font-bold text-lg mb-6" style={{ color: 'var(--foreground)' }}>Wallet & Debt Rules</h3>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="form-label">Maximum Debt Threshold (GHS)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          className="form-input font-bold" 
                          style={{ paddingLeft: '60px' }}
                          value={wallet.max_debt_threshold} 
                          onChange={e => setWallet({ ...wallet, max_debt_threshold: Number(e.target.value) })} 
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">GHS</div>
                      </div>
                      <p className="text-[10px] mt-1.5 text-slate-400">Total debt allowed before service is restricted</p>
                    </div>
                    <div>
                      <label className="form-label">Warning Threshold (GHS)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          className="form-input font-bold" 
                          style={{ paddingLeft: '60px' }}
                          value={wallet.debt_warning_threshold} 
                          onChange={e => setWallet({ ...wallet, debt_warning_threshold: Number(e.target.value) })} 
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">GHS</div>
                      </div>
                      <p className="text-[10px] mt-1.5 text-slate-400">Trigger warnings when debt exceeds this amount</p>
                    </div>
                  </div>

                  <hr style={{ borderColor: 'var(--border)' }} />

                  <div className="space-y-4">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Enforcement Policies</label>
                    
                    <div className="space-y-3">
                      <label className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors">
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-slate-800">Block Postpaid on High Debt</div>
                          <div className="text-xs text-slate-500">Prevent starting new sessions if max threshold is reached</div>
                        </div>
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                          checked={wallet.block_postpaid_on_debt} 
                          onChange={e => setWallet({ ...wallet, block_postpaid_on_debt: e.target.checked })}
                        />
                      </label>

                      <label className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-colors">
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-slate-800">Allow Manager Override</div>
                          <div className="text-xs text-slate-500">Managers can authorize sessions even if driver is over debt limit</div>
                        </div>
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                          checked={wallet.manager_override} 
                          onChange={e => setWallet({ ...wallet, manager_override: e.target.checked })}
                        />
                      </label>
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
                <div className="stat-card">
                  <h3 className="font-bold text-lg mb-6" style={{ color: 'var(--foreground)' }}>Receipt Configuration</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="form-label">Receipt Header Title</label>
                      <input className="form-input" value={receipts.header_title} onChange={e => setReceipts({ ...receipts, header_title: e.target.value })} />
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Information Visibility</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'show_logo', label: 'Show Station Logo' },
                          { key: 'show_driver', label: 'Driver Details' },
                          { key: 'show_vehicle', label: 'Vehicle Details' },
                          { key: 'show_units', label: 'Units Consumed' },
                          { key: 'show_rate', label: 'Applied Rate' },
                          { key: 'show_payment_method', label: 'Payment Method' },
                          { key: 'show_date', label: 'Transaction Date' },
                        ].map(item => (
                          <label key={item.key} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 cursor-pointer transition-colors hover:bg-slate-50">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              checked={(receipts as any)[item.key]} 
                              onChange={e => setReceipts({ ...receipts, [item.key]: e.target.checked })}
                            />
                            <span className="text-sm font-medium text-slate-700">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {receipts.show_logo && (
                      <div className="p-4 rounded-xl border border-blue-50 bg-blue-50/20">
                        <label className="text-[10px] font-bold uppercase text-blue-400 mb-3 block">Logo Scaling (Thermal Optimization)</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" 
                            min="20" 
                            max="80" 
                            className="flex-1 accent-blue-600" 
                            value={receipts.logo_size} 
                            onChange={e => setReceipts({ ...receipts, logo_size: Number(e.target.value) })}
                          />
                          <span className="text-xs font-bold text-blue-600 w-10">{receipts.logo_size}px</span>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="form-label">Footer Message</label>
                      <textarea 
                        className="form-input min-h-[80px]" 
                        value={receipts.receipt_footer} 
                        onChange={e => setReceipts({ ...receipts, receipt_footer: e.target.value })}
                        placeholder="e.g. Powered by Spero EV — Thank you!"
                      />
                    </div>

                    <SaveBar 
                      status={saveStatus['receipts'] || 'idle'} 
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
                          logoSize: receipts.logo_size
                        }
                      })} 
                    />
                  </div>
                </div>

                {/* Live Preview */}
                <div className="stat-card bg-slate-100/50 border-dashed border-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest text-center">Live Receipt Preview</div>
                  <div className="bg-white mx-auto w-full max-w-[320px] shadow-xl rounded-sm p-6 text-slate-800 font-mono text-[10px] space-y-4">
                    <div className="text-center space-y-1">
                      {receipts.show_logo && branding.logo_url && (
                        <div className="flex justify-center mb-3">
                          <img 
                            src={branding.logo_url} 
                            alt="Preview Logo" 
                            style={{ width: `${receipts.logo_size}px`, height: 'auto' }} 
                            className="object-contain contrast-125" 
                          />
                        </div>
                      )}
                      <div className="font-black text-xs uppercase">{receipts.header_title || 'STATION RECEIPT'}</div>
                      <div>Accra, Ghana</div>
                      <div className="pt-2 border-b border-dashed"></div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between"><span>RECEIPT:</span> <span>#RCP-123456</span></div>
                      {receipts.show_date && <div className="flex justify-between"><span>DATE:</span> <span>{new Date().toLocaleDateString()}</span></div>}
                    </div>

                    <div className="border-b border-dashed"></div>

                    <div className="space-y-1">
                      {receipts.show_driver && <div className="flex justify-between"><span>DRIVER:</span> <span>Kwame Mensah</span></div>}
                      {receipts.show_vehicle && <div className="flex justify-between"><span>VEHICLE:</span> <span>GR-1234-24</span></div>}
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between font-bold">
                        <span>DESCRIPTION</span>
                        <span>TOTAL</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>EV Charging {receipts.show_units && '(45.2 kWh)'}</span>
                        <span>GHS 248.60</span>
                      </div>
                      {receipts.show_rate && <div className="text-[8px] text-slate-400 italic">Rate: GHS 5.50 / kWh</div>}
                    </div>

                    <div className="border-t-2 border-double pt-2">
                      <div className="flex justify-between font-black text-xs">
                        <span>TOTAL PAID</span>
                        <span>GHS 248.60</span>
                      </div>
                      {receipts.show_payment_method && <div className="flex justify-between pt-1"><span>METHOD:</span> <span>MOBILE MONEY</span></div>}
                    </div>

                    <div className="pt-4 text-center space-y-2">
                      <div className="border-b border-dashed"></div>
                      <div className="italic text-[8px]">{receipts.receipt_footer || 'Thank you for your business!'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── BRANDING ── */}
            {activeTab === 'branding' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="stat-card">
                  <h3 className="font-bold text-lg mb-6" style={{ color: 'var(--foreground)' }}>Visual Identity</h3>
                  
                  <div className="space-y-6">
                    {/* Logo Section */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Station Logo</label>
                      <div className="flex items-center gap-6 p-4 rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50/50">
                        <div className="w-20 h-20 rounded-xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {branding.logo_url ? (
                            <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                          ) : (
                            <Palette className="text-slate-200" size={32} />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="text-sm font-medium text-slate-700">Upload your brand logo</div>
                          <div className="text-[10px] text-slate-400">PNG or JPG, Max 2MB. Recommended 200x200px.</div>
                          <label className="inline-block">
                            <span className="btn btn-secondary btn-sm cursor-pointer">
                              {isUploading ? 'Uploading...' : 'Choose File'}
                            </span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={isUploading} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* App Name */}
                    <div>
                      <label className="form-label">Application Name</label>
                      <input 
                        className="form-input font-bold" 
                        value={branding.app_name} 
                        onChange={e => setBranding({ ...branding, app_name: e.target.value })} 
                        placeholder="e.g. SPERO EV"
                      />
                    </div>

                    {/* Color Theme */}
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Brand Color Theme</label>
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                        <div className="relative group">
                          <input 
                            type="color" 
                            className="h-12 w-12 rounded-lg cursor-pointer border-none p-0 bg-transparent" 
                            value={branding.primary_color} 
                            onChange={e => setBranding({ ...branding, primary_color: e.target.value })} 
                          />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-100 flex items-center justify-center text-[8px] font-bold shadow-sm">
                            HEX
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-slate-800 uppercase">{branding.primary_color}</div>
                          <div className="text-[10px] text-slate-400">Primary button and accent color</div>
                        </div>
                      </div>
                    </div>

                    <SaveBar 
                      status={saveStatus['branding'] || 'idle'} 
                      onSave={() => handleSave('branding', branding)} 
                    />
                  </div>
                </div>

                {/* Live Theme Preview */}
                <div className="stat-card bg-slate-100/50 border-dashed border-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-6 tracking-widest text-center">UI Theme Preview</div>
                  
                  <div className="space-y-6">
                    {/* Component Previews */}
                    <div className="stat-card shadow-sm border border-slate-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: branding.primary_color }}>
                          <Zap size={16} className="text-white" />
                        </div>
                        <div className="font-black text-xs uppercase tracking-tight">{branding.app_name || 'SCMS'}</div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="h-2 w-2/3 bg-slate-100 rounded-full"></div>
                        <div className="h-2 w-1/2 bg-slate-100 rounded-full"></div>
                        <div className="flex gap-2 pt-2">
                          <button className="h-8 px-4 rounded-lg text-[10px] font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: branding.primary_color }}>
                            Primary Button
                          </button>
                          <button className="h-8 px-4 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 bg-white">
                            Secondary
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Status</div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branding.primary_color }}></div>
                          <div className="text-[10px] font-bold" style={{ color: branding.primary_color }}>Active Channel</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Badge Style</div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: `${branding.primary_color}15`, color: branding.primary_color }}>
                          Premium Tier
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="mt-8 text-center text-[10px] text-slate-400 italic">
                    Preview changes in real-time before saving to production.
                  </p>
                </div>
              </div>
            )}

            {/* ── MAINTENANCE ── */}
            {activeTab === 'maintenance' && user?.role === 'super_admin' && (
              <div className="space-y-6">
                
                {/* Integration Status */}
                <div className="stat-card">
                  <h3 className="font-bold text-lg mb-6" style={{ color: 'var(--foreground)' }}>System Health & Integrations</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { name: 'Supabase DB', status: 'connected', latency: '42ms', icon: RefreshCw },
                      { name: 'Paystack Gateway', status: 'connected', latency: '118ms', icon: CreditCard },
                      { name: 'Hubtel SMS API', status: 'connected', latency: '85ms', icon: Smartphone },
                    ].map(service => (
                      <div key={service.name} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/30 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                          <service.icon size={18} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">{service.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-[10px] font-medium text-green-600 uppercase tracking-wider">{service.status}</span>
                            <span className="text-[10px] text-slate-400 ml-1">({service.latency})</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Operational Tools */}
                  <div className="stat-card">
                    <h3 className="font-bold text-slate-800 mb-4">System Operations</h3>
                    <div className="space-y-3">
                      {[
                        { title: 'Re-index Database', desc: 'Optimize query performance and sync stats', icon: RefreshCw },
                        { title: 'Archive Sessions', desc: 'Move completed sessions to historical storage', icon: FileText },
                        { title: 'Sync Driver Wallets', desc: 'Reconcile balances with transaction history', icon: Wallet },
                      ].map(tool => (
                        <div key={tool.title} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                              <tool.icon size={14} />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-700">{tool.title}</div>
                              <div className="text-[10px] text-slate-500">{tool.desc}</div>
                            </div>
                          </div>
                          <button className="text-[10px] font-black uppercase text-blue-600 hover:underline">Run</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="stat-card border-red-100 bg-red-50/5 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-red-600 pointer-events-none">
                      <Trash2 size={120} />
                    </div>
                    <h3 className="font-bold text-red-900 mb-4 flex items-center gap-2"><Trash2 size={20}/> Danger Zone</h3>
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 text-sm text-red-800">
                        <p className="font-bold flex items-center gap-2"><AlertTriangle size={14}/> System Reset is irreversible.</p>
                        <p className="text-xs mt-1">All sessions, payments, drivers, and vehicles will be permanently deleted from the station database.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase text-red-400 tracking-widest">Administrative Confirmation</label>
                        <input 
                          className="form-input border-red-100 bg-white focus:border-red-500 focus:ring-red-200" 
                          placeholder='Type "RESET SYSTEM" to confirm'
                          value={resetConfirm}
                          onChange={e => setResetConfirm(e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={async () => {
                          if (resetConfirm !== 'RESET SYSTEM') return;
                          setIsResetting(true);
                          const res = await resetSystem();
                          setIsResetting(false);
                          if (res.success) {
                            toast.success('System reset successfully');
                            setResetConfirm('');
                          } else {
                            toast.error(res.error || 'Reset failed');
                          }
                        }}
                        disabled={resetConfirm !== 'RESET SYSTEM' || isResetting}
                        className="btn bg-red-600 text-white w-full py-4 font-black tracking-widest text-xs uppercase shadow-lg shadow-red-200 disabled:opacity-50 disabled:shadow-none"
                      >
                        {isResetting ? 'Wiping Database...' : 'Wipe All Station Data'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Pricing Modal */}
      {showNewRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="stat-card max-w-md w-full animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Create New Pricing Tier</h2>
              <button onClick={() => setShowNewRate(false)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="form-label">Billing Rate (GHS) *</label>
                <div className="relative">
                  <input 
                    type="number" 
                    className="form-input text-lg font-bold" 
                    style={{ paddingLeft: '60px' }}
                    placeholder="0.00" 
                    value={newRate} 
                    onChange={e => setNewRate(e.target.value)} 
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">GHS</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Unit Type</label>
                  <select 
                    className="form-select" 
                    value={newUnitType} 
                    onChange={e => setNewUnitType(e.target.value as any)}
                  >
                    <option value="kwh">⚡ kWh</option>
                    <option value="minutes">🕒 Minutes</option>
                    <option value="hours">⏰ Hours</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Quantity</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="e.g. 1" 
                    value={newQuantity} 
                    onChange={e => setNewQuantity(e.target.value)} 
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">Preview</div>
                <div className="text-sm font-medium text-blue-900">
                  {newRate ? `GHS ${Number(newRate).toFixed(2)}` : '0.00'} per {newQuantity || '1'} {newUnitType}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNewRate(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button 
                  onClick={handleUpdateRate} 
                  className="btn btn-primary flex-1"
                  disabled={!newRate || Number(newRate) <= 0}
                >
                  {saveStatus['pricing'] === 'saving' ? 'Saving...' : 'Add Pricing Tier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
