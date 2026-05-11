'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Search, Plus, Zap, Clock, CheckCircle, XCircle, UserPlus, Car, AlertTriangle, DollarSign, Smartphone, Wallet } from 'lucide-react';
import type { Session } from '@/lib/types';
import { useSessions, useDrivers, useVehicles, useShifts, usePricing } from '@/hooks/use-database';
import { useAuthStore } from '@/store/auth';
import { startSession, updateSessionStatus, completeSession, processPayment, initiatePaystackCharge, deleteSession } from '@/app/actions/sessions';
import { addDriver } from '@/app/actions/drivers';
import { addVehicle } from '@/app/actions/vehicles';

// Sub-step inside the Start Session modal
type ModalStep = 'session' | 'register_new';

export default function SessionsPage() {
  const { user } = useAuthStore();
  const isAttendant = user?.role === 'attendant';
  const { data: sessions, isLoading, refetch: refetchSessions } = useSessions({ 
    limit: 50, 
    attendantId: isAttendant ? user?.id : undefined 
  });
  const { data: drivers, refetch: refetchDrivers } = useDrivers();
  const { data: vehicles, refetch: refetchVehicles } = useVehicles();
  const { data: shifts } = useShifts(isAttendant ? { attendantId: user?.id } : {});
  const { data: activeRates } = usePricing();

  const activeShift = shifts?.find(s => s.status === 'active' && s.attendantId === user?.id);

  // Table filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  // Session modal
  const [showNew, setShowNew] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('session');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Session | null>(null);
  
  // Completion/Payment state
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeForm, setCompleteForm] = useState({ units: 0, amount: 0 });
  const [isPaying, setIsPaying] = useState(false);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'mtn' | 'telecel' | 'airteltigo' | 'hubtel'>('mtn');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState<number>(0);

  const [newMode, setNewMode] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [formData, setFormData] = useState({
    driver_id: '',
    vehicle_id: '',
    unit_type: 'kwh' as const,
    pricing_id: '',
    prepaid_amount: 0,
  });

  // Unified Registration Form
  const [regForm, setRegForm] = useState({
    name: '',
    phone: '',
    email: '',
    type: 'individual' as const,
    brand: '',
    model: '',
    plate_number: '',
  });

  const currentSessions = sessions || [];

  const handleStart = async () => {
    if (!user) return toast.error('Session expired. Please login again.');
    if (!activeShift) return toast.error('You must START A SHIFT on the Dashboard before starting a session.');
    
    // Find specific selected rate or fallback to unit-type default
    const selectedRate = activeRates?.find(r => r.id === formData.pricing_id) || 
                         activeRates?.find(r => r.unitType === formData.unit_type);
                         
    const rateToUse = selectedRate ? (selectedRate.rate / selectedRate.unitQuantity) : 5.5;

    setLoading(true);
    const res = await startSession({
      ...formData,
      unit_type: selectedRate?.unitType || formData.unit_type,
      mode: newMode,
      rate_at_time: rateToUse,
      attendant_id: user.id,
      shift_id: activeShift.id,
    });
    setLoading(false);
    if (res.success) {
      setShowNew(false);
      setFormData({ driver_id: '', vehicle_id: '', unit_type: 'kwh', pricing_id: '', prepaid_amount: 0 });
      await refetchSessions();
      toast.success('Session started successfully!');
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    if (status === 'cancelled' && !window.confirm('Are you sure you want to cancel this session? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    const res = await updateSessionStatus(id, status);
    setLoading(false);
    
    if (res.success) {
      setSelected(null);
      // Wait a moment for Supabase Realtime to catch up if needed
      setTimeout(() => refetchSessions(), 500);
      toast.success(`Session ${status === 'cancelled' ? 'cancelled' : 'updated'}!`);
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  const handleOpenComplete = () => {
    if (!selected) return;
    if (selected.mode === 'prepaid') {
      const pAmt = selected.prepaidAmount || 0;
      const units = pAmt / selected.rateAtTime;
      setCompleteForm({ units, amount: pAmt });
    } else {
      setCompleteForm({ units: 0, amount: 0 });
    }
    setIsCompleting(true);
  };

  const handleComplete = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await completeSession(selected.id, {
      units_consumed: completeForm.units,
      total_amount: completeForm.amount,
    });
    setLoading(false);
    if (res.success) {
      setIsCompleting(false);
      // Automatically open payment if amount > 0
      if (completeForm.amount > 0) {
        setIsPaying(true);
        setActualAmount(completeForm.amount || selected.totalAmount || 0);
        // Pre-fill phone if driver exists
        const driver = drivers?.find(d => d.id === selected.driverId);
        if (driver) setPaymentPhone(driver.phone);
      } else {
        setSelected(null);
      }
      await refetchSessions();
    }
  };

  const handleTriggerPayment = async () => {
    if (!selected || !activeShift) return toast.error('No active session or shift found.');
    
    const sessionCost = completeForm.amount || selected.totalAmount || 0;
    if (actualAmount < sessionCost) {
      return toast.error(`Amount cannot be less than the cost of GHS ${sessionCost.toFixed(2)}`);
    }

    setLoading(true);
    setPaymentStatus('Initiating payment...');
    
    // 1. If Mobile Money (MTN, Telecel, etc), initiate Paystack Charge
    let reference = `${paymentMethod.toUpperCase()}-${Date.now()}`;
    if (!['cash', 'wallet', 'hubtel'].includes(paymentMethod)) {
      const paystackRes = await initiatePaystackCharge({
        sessionId: selected.id,
        amount: actualAmount,
        phone: paymentPhone,
        provider: paymentMethod as any,
        email: user?.email || 'attendant@spero.com',
      });

      if (!paystackRes.success) {
        setLoading(false);
        setPaymentStatus(null);
        return toast.error('Paystack Error: ' + paystackRes.error);
      }
      reference = paystackRes.reference || reference;
      setPaymentStatus('Prompt sent! Waiting for driver authorization...');
    }

    // 2. Process the payment record and update shift
    const res = await processPayment({
      session_id: selected.id,
      shift_id: activeShift.id,
      amount: actualAmount,
      method: paymentMethod,
      reference: reference,
      attendant_id: user?.id || '',
    });

    setLoading(false);
    setPaymentStatus(null);
    
    if (res.success) {
      toast.success(`Payment processed via ${paymentMethod.toUpperCase()}`);
      setIsPaying(false);
      setSelected(null);
      await refetchSessions();
    } else {
      toast.error('Payment recording failed: ' + res.error);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!user || user.role !== 'super_admin') return;
    if (!window.confirm('PERMANENT DELETE: Are you sure you want to delete this session and all its records? This cannot be undone.')) return;
    
    setLoading(true);
    const res = await deleteSession(id, user.id);
    setLoading(false);
    
    if (res.success) {
      setSelected(null);
      await refetchSessions();
      toast.success('Session permanently deleted.');
    } else {
      toast.error('Error: ' + res.error);
    }
  };

  // Auto-select vehicle when driver is selected
  useEffect(() => {
    if (formData.driver_id && vehicles) {
      const driverVehicle = vehicles.find(v => v.driverId === formData.driver_id);
      if (driverVehicle) {
        setFormData(prev => ({ ...prev, vehicle_id: driverVehicle.id }));
      } else {
        setFormData(prev => ({ ...prev, vehicle_id: '' }));
      }
    }
  }, [formData.driver_id, vehicles]);

  const handleRegisterNew = async () => {
    if (!regForm.name || !regForm.phone || !regForm.plate_number) {
      return toast.error('Name, phone, and plate number are required');
    }
    
    setLoading(true);
    try {
      // 1. Add Driver
      const dRes = await addDriver({
        name: regForm.name,
        phone: regForm.phone,
        email: regForm.email,
        type: regForm.type,
      });

      if (!dRes.success) throw new Error('Driver: ' + dRes.error);

      // 2. Add Vehicle (assigned to new driver)
      const vRes = await addVehicle({
        brand: regForm.brand,
        model: regForm.model,
        plate_number: regForm.plate_number,
        driver_id: dRes.id,
      });

      if (!vRes.success) throw new Error('Vehicle: ' + vRes.error);

      // 3. Refresh and update selection
      await Promise.all([refetchDrivers(), refetchVehicles()]);
      
      setFormData(prev => ({
        ...prev,
        driver_id: dRes.id!,
      }));
      
      setRegForm({ name: '', phone: '', email: '', type: 'individual', brand: '', model: '', plate_number: '' });
      setModalStep('session');
      toast.success('Driver and vehicle registered successfully!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = currentSessions.filter(s => {
    const matchSearch = (s.receiptNumber || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'pending_payment'
        ? (s.status === 'active' || s.status === 'pending_payment')
        : s.status === statusFilter;
    const matchMode = modeFilter === 'all' || s.mode === modeFilter;
    return matchSearch && matchStatus && matchMode;
  });

  const openModal = () => { setShowNew(true); setModalStep('session'); };
  const closeModal = () => { setShowNew(false); setModalStep('session'); };

  return (
    <div>
      <TopBar title="Charging Sessions" subtitle="Manage all EV charging sessions" />
      <div className="p-6 space-y-6">

        {/* Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Sessions', value: currentSessions.length, color: '#1d4ed8' },
            { label: 'Active', value: currentSessions.filter(s => s.status === 'active').length, color: '#d97706' },
            { label: 'Completed', value: currentSessions.filter(s => s.status === 'completed').length, color: '#16a34a' },
            { label: 'Pending Payment', value: currentSessions.filter(s => s.status === 'active' || s.status === 'pending_payment').length, color: '#dc2626' },
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
                placeholder="Search by receipt number..."
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
            {user?.role === 'attendant' && (
              <button onClick={openModal} className="btn btn-primary gap-2">
                <Plus size={16} /> Start Session
              </button>
            )}
          </div>
        </div>

        {/* Sessions table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th><th>Mode</th><th>Unit</th><th>Rate</th><th>Amount</th><th>Status</th><th>Started</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSelected(s)}>
                    <td className="font-mono text-xs">{(s as any).receipt_number || s.receiptNumber}</td>
                    <td><span className={`badge ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{s.mode}</span></td>
                    <td className="capitalize">{(s as any).unit_type || s.unitType}</td>
                    <td>GHS {(s as any).rate_at_time || s.rateAtTime}</td>
                    <td className="font-medium text-blue-600">
                      {s.mode === 'prepaid' ? (
                        formatCurrency(s.prepaidAmount || 0)
                      ) : s.status === 'active' ? (
                        <div className="flex items-center gap-1.5 text-slate-400 font-normal italic text-[11px] animate-pulse">
                          <Zap size={12} className="text-blue-400" /> calculating...
                        </div>
                      ) : (
                        formatCurrency(s.totalAmount || 0)
                      )}
                    </td>
                    <td><span className={`badge ${getStatusColor(s.status)}`}>{getStatusLabel(s.status)}</span></td>
                    <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">{formatDateTime(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── START SESSION MODAL ─── */}
        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card w-full" style={{ maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>

              {/* ── STEP: Register Driver & Vehicle Combined ── */}
              {modalStep === 'register_new' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <button onClick={() => setModalStep('session')} className="text-sm font-medium" style={{ color: 'var(--primary)' }}>← Back</button>
                    <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Register Driver & Vehicle</h2>
                  </div>
                  <div className="space-y-6">
                    {/* Driver Section */}
                    <div className="space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Driver Information</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label text-xs">Full Name *</label>
                          <input className="form-input" placeholder="e.g. Kwame Mensah" value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Phone *</label>
                          <input className="form-input" placeholder="e.g. 0244000000" value={regForm.phone} onChange={e => setRegForm({ ...regForm, phone: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label text-xs">Email (optional)</label>
                          <input type="email" className="form-input" placeholder="driver@email.com" value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Driver Type</label>
                          <select className="form-select" value={regForm.type} onChange={e => setRegForm({ ...regForm, type: e.target.value as any })}>
                            <option value="individual">Individual</option>
                            <option value="corporate">Corporate / Fleet</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <hr style={{ borderColor: 'var(--border)' }} />

                    {/* Vehicle Section */}
                    <div className="space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Vehicle Information</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label text-xs">Brand *</label>
                          <input className="form-input" placeholder="e.g. Tesla, BYD" value={regForm.brand} onChange={e => setRegForm({ ...regForm, brand: e.target.value })} />
                        </div>
                        <div>
                          <label className="form-label text-xs">Model *</label>
                          <input className="form-input" placeholder="e.g. Model 3" value={regForm.model} onChange={e => setRegForm({ ...regForm, model: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="form-label text-xs">Plate Number *</label>
                        <input className="form-input" placeholder="e.g. GR-1234-24" value={regForm.plate_number} onChange={e => setRegForm({ ...regForm, plate_number: e.target.value.toUpperCase() })} />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setModalStep('session')} className="btn btn-secondary flex-1" disabled={loading}>Cancel</button>
                      <button onClick={handleRegisterNew} className="btn btn-primary flex-1" disabled={loading}>
                        {loading ? 'Saving...' : 'Register Both'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP: Start Session ── */}
              {modalStep === 'session' && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Start Charging Session</h2>
                    <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                  </div>

                  {/* Mode select */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
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

                  {/* Display Current Rate info */}
                  <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50 flex items-center justify-between mb-5">
                    <div className="text-xs text-blue-600 font-medium uppercase">Active Rate</div>
                    <div className="text-sm font-bold text-blue-900">
                      {activeRates?.find(r => r.unitType === formData.unit_type) 
                        ? `GHS ${activeRates.find(r => r.unitType === formData.unit_type)?.rate.toFixed(2)} / ${activeRates.find(r => r.unitType === formData.unit_type)?.unitQuantity} ${formData.unit_type}`
                        : 'Loading rate...'}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Driver field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="form-label mb-0">Driver *</label>
                        <button
                          onClick={() => setModalStep('register_new')}
                          className="text-xs font-medium flex items-center gap-1"
                          style={{ color: 'var(--primary)' }}
                        >
                          <Plus size={12} /> Register new customer
                        </button>
                      </div>
                      <select
                        className="form-select"
                        value={formData.driver_id}
                        onChange={e => setFormData({ ...formData, driver_id: e.target.value })}
                      >
                        <option value="">Select a driver...</option>
                        {drivers?.map(d => (
                          <option key={d.id} value={d.id}>{d.name} — {d.phone}</option>
                        ))}
                      </select>
                      {formData.driver_id && drivers?.find(d => d.id === formData.driver_id) && (
                        <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-between">
                          <div className="text-[10px] font-bold text-blue-600 uppercase">Available Credit</div>
                          <div className="text-sm font-black text-blue-900">
                            {formatCurrency(drivers.find(d => d.id === formData.driver_id)?.walletBalance || 0)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vehicle Display (No longer a select box) */}
                    <div>
                      <label className="form-label mb-1">Vehicle Details</label>
                      {formData.driver_id ? (
                        <>
                          {formData.vehicle_id ? (
                            <div className="p-3 rounded-xl border-2 border-green-100 bg-green-50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-green-900">
                                    {vehicles?.find((v: any) => v.id === formData.vehicle_id)?.plateNumber}
                                  </div>
                                  <div className="text-xs text-green-700">
                                    {vehicles?.find((v: any) => v.id === formData.vehicle_id)?.brand} {vehicles?.find((v: any) => v.id === formData.vehicle_id)?.model}
                                  </div>
                                </div>
                                <div className="text-green-600">
                                  <CheckCircle size={20} />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl border-2 border-dashed border-red-200 bg-red-50 text-center">
                              <div className="text-red-600 mb-1"><AlertTriangle size={20} className="mx-auto" /></div>
                              <div className="text-xs font-medium text-red-800">No vehicle found for this driver</div>
                              <button 
                                onClick={() => setModalStep('register_new')}
                                className="text-[10px] mt-1 underline font-bold text-red-700"
                              >
                                ADD VEHICLE TO DRIVER
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-400 italic">
                          Select a driver first to see vehicle details
                        </div>
                      )}
                    </div>

                    {/* Pricing Selector */}
                    <div>
                      <label className="form-label">Pricing Tier</label>
                      <select
                        className="form-select border-blue-200 bg-blue-50/20"
                        value={formData.pricing_id}
                        onChange={e => {
                          const rid = e.target.value;
                          const r = activeRates?.find(i => i.id === rid);
                          setFormData({ 
                            ...formData, 
                            pricing_id: rid,
                            unit_type: r?.unitType || formData.unit_type 
                          });
                        }}
                      >
                        <option value="">Select pricing...</option>
                        {activeRates?.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.unitType === 'kwh' ? '⚡ kWh' : '🕒 Time'} — GHS {r.rate.toFixed(2)} / {r.unitQuantity} {r.unitType}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Prepaid amount */}
                    {newMode === 'prepaid' && (
                      <div>
                        <label className="form-label">Prepaid Amount (GHS) *</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="e.g. 200"
                          min="1"
                          value={formData.prepaid_amount || ''}
                          onChange={e => setFormData({ ...formData, prepaid_amount: Number(e.target.value) })}
                        />
                        <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                          {(() => {
                            const rate = activeRates?.find(r => r.unitType === formData.unit_type);
                            const val = rate ? (formData.prepaid_amount / (rate.rate / rate.unitQuantity)).toFixed(1) : '0';
                            return `Equivalent to ~${val} ${formData.unit_type} at current rate`;
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button onClick={closeModal} className="btn btn-secondary flex-1" disabled={loading}>Cancel</button>
                      <button
                        onClick={handleStart}
                        className="btn btn-primary flex-1 gap-2"
                        disabled={loading || !formData.driver_id || !formData.vehicle_id}
                      >
                        <Zap size={15} /> {loading ? 'Starting...' : 'Start Session'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── SESSION DETAILS & ACTIONS MODAL ─── */}
        {selected && !showNew && !isCompleting && !isPaying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-bold text-lg">Session Details</h2>
                  <div className="text-xs text-slate-400 font-mono">{(selected as any).receipt_number || selected.receiptNumber}</div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Status</span>
                    <span className={`badge ${getStatusColor(selected.status)}`}>{getStatusLabel(selected.status)}</span>
                  </div>
                  <div className="text-sm">
                    {selected.status === 'active' && (
                      <p className="text-slate-600 mb-4">This session is currently charging. You can end it when the driver is done.</p>
                    )}
                    {selected.status === 'completed' && (
                      <p className="text-green-600 font-medium mb-4">This session is finished. Ensure payment is collected.</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {selected.status === 'active' && (
                      <button onClick={handleOpenComplete} className="btn btn-primary flex-1 gap-2"><CheckCircle size={16}/> Complete Session</button>
                    )}
                    {selected.status === 'completed' && (
                      <button onClick={() => { setIsPaying(true); setPaymentPhone(''); }} className="btn btn-primary flex-1 gap-2"><Zap size={16}/> Make Payment</button>
                    )}
                    {selected.status === 'active' && (
                      <button 
                        onClick={() => {
                          if (confirm('Are you sure you want to cancel this active session?')) {
                            handleUpdateStatus(selected.id, 'cancelled').catch(err => console.error("Cancellation error:", err));
                          }
                        }} 
                        className="btn bg-red-50 text-red-600 border-red-100 flex-1 gap-2"
                        disabled={loading}
                      >
                        <XCircle size={16}/> {loading ? '...' : 'Cancel'}
                      </button>
                    )}
                  </div>
                  
                  {user?.role === 'super_admin' && (
                    <div className="pt-2 border-t border-slate-100 mt-2">
                      <button 
                        onClick={() => handleDelete(selected.id)} 
                        className="w-full btn bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-2 py-3"
                        disabled={loading}
                      >
                        <XCircle size={16}/> {loading ? 'Deleting...' : 'Permanent Delete Session'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Rate</div>
                    <div className="font-semibold text-slate-700">GHS {selected.rateAtTime} / {selected.unitType}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Mode</div>
                    <div className="font-semibold text-slate-700 capitalize">{selected.mode}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── COMPLETE SESSION FORM ─── */}
        {isCompleting && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card max-w-md w-full">
              <h2 className="font-bold text-lg mb-4">Finalize Session</h2>
              <div className="space-y-4">
                {selected.mode === 'prepaid' ? (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-xs font-bold text-blue-600 uppercase mb-2">Prepaid Session Summary</div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-blue-800">Target Amount:</span>
                      <span className="text-lg font-black text-blue-900">{formatCurrency(selected.prepaidAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-800">Equivalent Units:</span>
                      <span className="text-lg font-black text-blue-900">{completeForm.units.toFixed(2)} {selected.unitType}</span>
                    </div>
                    <p className="text-[10px] text-blue-500 mt-2 italic">* This session was prepaid. Units are calculated automatically based on the rate of GHS {selected.rateAtTime}/{selected.unitType}.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="form-label">Units Consumed ({selected.unitType})</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={completeForm.units || ''} 
                        placeholder="Enter kWh consumed"
                        onChange={e => {
                          const u = parseFloat(e.target.value) || 0;
                          setCompleteForm({ units: u, amount: u * selected.rateAtTime });
                        }} 
                      />
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-500 uppercase">Total Amount Due</span>
                      <span className="text-xl font-black text-slate-900">{formatCurrency(completeForm.amount)}</span>
                    </div>
                  </>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setIsCompleting(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={handleComplete} className="btn btn-primary flex-1" disabled={loading}>
                    {loading ? 'Processing...' : 'Finish & Pay'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── PAYMENT PROMPT MODAL ─── */}
        {isPaying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card w-full border-t-4 border-blue-600" style={{ maxWidth: '480px', maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><DollarSign size={24}/></div>
                  <div>
                    <h2 className="font-bold text-lg">Collect Payment</h2>
                    <p className="text-xs text-slate-500">Choose a method to finalize</p>
                  </div>
                </div>
                <button onClick={() => setIsPaying(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Session Cost</div>
                    <div className="text-xl font-black text-slate-800">{formatCurrency(completeForm.amount || selected?.totalAmount || 0)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Receipt</div>
                    <div className="text-xs font-mono text-slate-600">{(selected as any).receipt_number || selected?.receiptNumber}</div>
                  </div>
                </div>

                {/* Driver Balance Display */}
                {drivers?.find(d => d.id === selected?.driverId) && (
                  <div className="p-3 rounded-xl border-2 border-blue-100 bg-blue-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <Wallet size={14} />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-blue-500">Driver Wallet</div>
                        <div className="text-xs font-medium text-slate-600">{drivers.find(d => d.id === selected?.driverId)?.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-blue-900">
                        {formatCurrency(drivers.find(d => d.id === selected?.driverId)?.walletBalance || 0)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="animate-in slide-in-from-bottom-2">
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 block">Actual Amount Paid</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      className="form-input text-xl font-black py-3 disabled:bg-slate-50 disabled:text-slate-500" 
                      style={{ paddingLeft: '72px' }}
                      value={actualAmount}
                      onChange={e => setActualAmount(parseFloat(e.target.value) || 0)}
                      disabled={paymentMethod === 'wallet'}
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">GHS</div>
                  </div>
                  {(actualAmount - (completeForm.amount || selected?.totalAmount || 0)) > 0 && (
                    <div className="mt-2 text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Wallet size={12} />
                      + GHS {(actualAmount - (completeForm.amount || selected?.totalAmount || 0)).toFixed(2)} will be added to driver's credit
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 block">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'cash', label: 'Cash', color: 'bg-emerald-500', icon: DollarSign },
                      { id: 'wallet', label: 'Wallet', color: 'bg-blue-600', icon: Wallet },
                      { id: 'hubtel', label: 'Hubtel', color: 'bg-teal-600', icon: Smartphone },
                      { id: 'mtn', label: 'MTN MoMo', color: 'bg-yellow-400', icon: Smartphone },
                      { id: 'telecel', label: 'Telecel', color: 'bg-red-600', icon: Smartphone },
                      { id: 'airteltigo', label: 'AirtelTigo', color: 'bg-blue-500', icon: Smartphone },
                    ].map(m => (
                      <button 
                        key={m.id}
                        onClick={() => {
                          setPaymentMethod(m.id as any);
                          if (m.id === 'wallet') {
                            setActualAmount(completeForm.amount || selected?.totalAmount || 0);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                          paymentMethod === m.id 
                            ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100' 
                            : 'border-slate-100 hover:border-slate-200 bg-white'
                        }`}
                        style={{ padding: '10px' }}
                      >
                        <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center text-white`}>
                          <m.icon size={16} />
                        </div>
                        <span className="font-bold text-sm text-slate-700">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'hubtel' && (
                  <div className="p-4 rounded-xl border-2 border-teal-100 bg-teal-50 animate-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white">
                        <Smartphone size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-teal-600 tracking-widest">Hubtel USSD Payment</div>
                        <div className="text-sm font-bold text-teal-900">Direct Merchant Code</div>
                      </div>
                    </div>
                    <div className="bg-white border-2 border-teal-200 rounded-lg p-4 text-center shadow-sm">
                      <div className="text-2xl font-black text-teal-900 tracking-widest mb-1">*713*600#</div>
                      <div className="text-[10px] text-teal-500 font-bold uppercase">Dial this code to pay</div>
                    </div>
                  </div>
                )}

                {!['cash', 'wallet', 'hubtel'].includes(paymentMethod) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="form-label">Mobile Money Number</label>
                    <div className="relative">
                      <input 
                        className="form-input text-lg tracking-widest" 
                        style={{ paddingLeft: '52px' }}
                        placeholder="024XXXXXXX" 
                        value={paymentPhone} 
                        onChange={e => setPaymentPhone(e.target.value)} 
                      />
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>
                  </div>
                )}

                {paymentStatus && (
                  <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium flex items-center gap-2 animate-pulse">
                    <Clock size={16} />
                    {paymentStatus}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setIsPaying(false)} className="btn btn-secondary flex-1">Back</button>
                  <button onClick={handleTriggerPayment} className="btn btn-primary flex-1 py-4" disabled={loading || (!['cash', 'wallet', 'hubtel'].includes(paymentMethod) && !paymentPhone)}>
                    {loading ? 'Processing...' : paymentMethod === 'cash' ? 'Confirm Payment' : paymentMethod === 'wallet' ? 'Pay from Wallet' : paymentMethod === 'hubtel' ? 'Mark Payment' : 'Send Prompt'}
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
