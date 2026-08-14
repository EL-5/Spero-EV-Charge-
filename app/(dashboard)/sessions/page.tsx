'use client';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Search, Plus, Zap, Clock, CheckCircle, XCircle, UserPlus, Car, AlertTriangle, DollarSign, Smartphone, Wallet, Trash2, Upload, Camera, FileImage, ShieldCheck, Calendar, History } from 'lucide-react';
import type { Session } from '@/lib/types';
import { useSessions, useDrivers, useVehicles, useShifts, usePricing } from '@/hooks/use-database';
import { useAuthStore } from '@/store/auth';
import { startSession, updateSessionStatus, completeSession, processPayment, deleteSession, uploadPaymentProof } from '@/app/actions/sessions';
import { addDriver } from '@/app/actions/drivers';
import { addVehicle } from '@/app/actions/vehicles';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function getLocalDatetimeString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Sub-step inside the Start Session modal
type ModalStep = 'session' | 'register_new';

export default function SessionsPage() {
  const { user } = useAuthStore();
  const isAttendant = user?.role === 'attendant';
  // FIX: loadAll=true ensures no sessions are ever dropped due to a record limit
  const { data: sessions, isLoading, refetch: refetchSessions } = useSessions({ 
    loadAll: true, 
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
  
  // Backdated charge state
  const [isBackdated, setIsBackdated] = useState(false);
  const [backdatedDate, setBackdatedDate] = useState('');
  const [isBackdatedCompleted, setIsBackdatedCompleted] = useState(true);
  const [backdatedUnits, setBackdatedUnits] = useState<number>(0);

  // Completion/Payment state
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeForm, setCompleteForm] = useState({ units: 0, amount: 0 });
  const [isPaying, setIsPaying] = useState(false);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'mtn' | 'telecel' | 'airteltigo'>('mtn');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState<number>(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedPayment, setCompletedPayment] = useState<any>(null);

  // MoMo SMS proof upload state
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofSmsText, setProofSmsText] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofUploaded, setProofUploaded] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const lastPaymentIdRef = useRef<string | null>(null);

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

    if (isBackdated && !backdatedDate) {
      return toast.error('Please select a date and time for the backdated session.');
    }
    if (isBackdated && isBackdatedCompleted && (!backdatedUnits || backdatedUnits <= 0)) {
      return toast.error('Please enter the units consumed (kWh) for the completed session.');
    }
    
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
      custom_date: isBackdated && backdatedDate ? new Date(backdatedDate).toISOString() : undefined,
      is_completed: isBackdated ? isBackdatedCompleted : false,
      units_consumed: isBackdated && isBackdatedCompleted ? backdatedUnits : undefined,
      total_amount: isBackdated && isBackdatedCompleted ? (backdatedUnits * rateToUse) : undefined,
    });
    setLoading(false);
    if (res.success) {
      setShowNew(false);
      const savedDriverId = formData.driver_id;
      setFormData({ driver_id: '', vehicle_id: '', unit_type: 'kwh', pricing_id: '', prepaid_amount: 0 });
      setIsBackdated(false);
      setBackdatedUnits(0);
      await refetchSessions();

      if (isBackdated && isBackdatedCompleted && res.session) {
        toast.success('Backdated session recorded successfully!');
        const targetSession = res.session as any;
        setSelected(targetSession);
        setIsPaying(true);
        setActualAmount(targetSession.total_amount || (backdatedUnits * rateToUse));
        const driver = drivers?.find(d => d.id === savedDriverId);
        if (driver) setPaymentPhone(driver.phone);
      } else {
        toast.success(isBackdated ? 'Backdated session created!' : 'Session started successfully!');
      }
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
        // Pre-fill phone from driver record for payment tracking
        const driver = drivers?.find(d => d.id === selected.driverId);
        if (driver) setPaymentPhone(driver.phone);
      } else {
        setSelected(null);
      }
      await refetchSessions();
    }
  };

  // Send to Pending: records kWh & amount but does NOT open payment
  const handleSendToPending = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await completeSession(selected.id, {
      units_consumed: completeForm.units,
      total_amount: completeForm.amount,
    });
    setLoading(false);
    if (res.success) {
      setIsCompleting(false);
      setSelected(null);
      await refetchSessions();
      toast.success('Session moved to Pending Payment. Collect MoMo when ready.');
    } else {
      toast.error('Error: ' + ((res as any).error || 'Failed to update session.'));
    }

  };

  const handleTriggerPayment = async () => {
    if (!selected || !activeShift) return toast.error('No active session or shift found.');
    
    const sessionCost = completeForm.amount || selected.totalAmount || 0;
    if (actualAmount < sessionCost) {
      return toast.error(`Amount cannot be less than the cost of GHS ${sessionCost.toFixed(2)}`);
    }

    setLoading(true);

    // Generate a local reference for all payment types
    const reference = `${paymentMethod.toUpperCase()}-${Date.now()}`;

    // Directly record the payment — no external gateway calls
    const res = await processPayment({
      session_id: selected.id,
      shift_id: activeShift.id,
      amount: actualAmount,
      method: paymentMethod,
      reference,
      attendant_id: user?.id || '',
    });

    setLoading(false);
    
    if (res.success) {
      const methodLabel = {
        wallet: 'Wallet', mtn: 'MTN MoMo',
        telecel: 'Telecel Cash', airteltigo: 'Tigo Cash',
      }[paymentMethod] || paymentMethod.toUpperCase();

      toast.success(`Payment recorded — ${methodLabel}`);
      
      setCompletedPayment({
        ...selected,
        amount: actualAmount,
        method: paymentMethod,
        reference,
        createdAt: new Date().toISOString(),
        receiptNumber: selected.receiptNumber || (selected as any).receipt_number,
        paymentId: reference, // use reference as a unique ID for proof linking
      });

      // Reset proof state for new payment
      setProofFile(null);
      setProofPreview(null);
      setProofSmsText('');
      setProofUploaded(false);
      lastPaymentIdRef.current = reference;
      
      setIsPaying(false);
      setShowSuccess(true);
      await refetchSessions();
    } else {
      toast.error('Payment recording failed: ' + res.error);
    }
  };

  const generatePDFBlob = async (payment: any) => {
    const element = document.getElementById('printable-receipt-success');
    if (!element) return null;
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdfWidth = 80;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      return { blob: pdf.output('blob'), filename: `Receipt-${payment.receiptNumber}.pdf`, pdfObj: pdf };
    } catch (error) {
      console.error('PDF Generation Error:', error);
      return null;
    }
  };

  const handleShareWhatsApp = async (payment: any) => {
    toast.loading('Preparing receipt...', { id: 'pdf-share-session' });
    const result = await generatePDFBlob(payment);
    if (!result) {
      toast.error('Failed to generate PDF', { id: 'pdf-share-session' });
      return;
    }
    const file = new File([result.blob], result.filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Receipt ${payment.receiptNumber}`,
          text: `Hello ${payment.driverName || 'Driver'}, here is your charging receipt from Spero Fleet. Total: ${formatCurrency(payment.amount)}`,
        });
        toast.success('Shared successfully', { id: 'pdf-share-session' });
      } catch (err) { console.error('Sharing failed', err); }
    } else {
      result.pdfObj.save(result.filename);
      toast.info('Direct sharing not supported. PDF downloaded.', { id: 'pdf-share-session' });
    }
  };
  

  const handleDelete = async (id: string) => {
    if (!user || user.role !== 'super_admin') return;
    if (!window.confirm('PERMANENT DELETE: Are you sure you want to delete this session and all its records? This cannot be undone.')) return;
    
    setLoading(true);
    const res = await deleteSession(id);
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
                  <th>Receipt</th><th>Mode</th><th>Unit</th><th>Volume</th><th>Rate</th><th>Amount</th><th>Status</th><th>Started</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSelected(s)}>
                    <td className="font-mono text-xs">{(s as any).receipt_number || s.receiptNumber}</td>
                    <td><span className={`badge ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{s.mode}</span></td>
                    <td className="capitalize">{(s as any).unit_type || s.unitType}</td>
                    <td className="font-bold text-slate-700">
                      {s.unitsConsumed ? `${s.unitsConsumed} ${s.unitType}` : '—'}
                    </td>
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

                    {/* Backdated Charge Section */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className={isBackdated ? "text-amber-600" : "text-slate-400"} />
                          <div>
                            <div className="text-xs font-bold text-slate-800">Record Past / Backdated Charge</div>
                            <div className="text-[10px] text-slate-500">Record a charge from a previous date (e.g. yesterday)</div>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={isBackdated} 
                            onChange={e => {
                              const checked = e.target.checked;
                              setIsBackdated(checked);
                              if (checked && !backdatedDate) {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                setBackdatedDate(getLocalDatetimeString(yesterday));
                              }
                            }} 
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>

                      {isBackdated && (
                        <div className="mt-3 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 animate-in fade-in duration-200">
                          <div>
                            <label className="form-label text-xs text-amber-900 font-bold mb-1">Session Date & Time *</label>
                            <input 
                              type="datetime-local" 
                              className="form-input text-xs bg-white border-amber-200 focus:ring-amber-400 font-medium"
                              value={backdatedDate}
                              onChange={e => setBackdatedDate(e.target.value)}
                            />
                            <div className="flex gap-2 mt-1.5">
                              <button 
                                type="button" 
                                onClick={() => {
                                  const d = new Date();
                                  d.setDate(d.getDate() - 1);
                                  setBackdatedDate(getLocalDatetimeString(d));
                                }}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors"
                              >
                                Yesterday (Same time)
                              </button>
                              <button 
                                type="button" 
                                onClick={() => {
                                  const d = new Date();
                                  d.setDate(d.getDate() - 2);
                                  setBackdatedDate(getLocalDatetimeString(d));
                                }}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors"
                              >
                                2 Days Ago
                              </button>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-amber-200/60">
                            <label className="flex items-center gap-2 cursor-pointer mb-2">
                              <input 
                                type="checkbox" 
                                checked={isBackdatedCompleted}
                                onChange={e => setIsBackdatedCompleted(e.target.checked)}
                                className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                              />
                              <span className="text-xs font-bold text-amber-900">Mark charge as Already Completed</span>
                            </label>

                            {isBackdatedCompleted && (
                              <div className="space-y-2 pl-6 pt-1">
                                <div>
                                  <label className="form-label text-[11px] text-amber-900 font-bold mb-1">Energy Delivered ({formData.unit_type.toUpperCase()}) *</label>
                                  <input 
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    className="form-input text-xs bg-white border-amber-200 font-bold"
                                    placeholder="Enter kWh delivered (e.g. 25)"
                                    value={backdatedUnits || ''}
                                    onChange={e => setBackdatedUnits(parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                {backdatedUnits > 0 && (
                                  <div className="p-2 rounded-lg bg-white border border-amber-200 flex items-center justify-between text-xs">
                                    <span className="text-amber-800 font-medium">Calculated Bill:</span>
                                    <span className="font-black text-amber-900">
                                      {formatCurrency(backdatedUnits * (
                                        activeRates?.find(r => r.id === formData.pricing_id)?.rate || 
                                        activeRates?.find(r => r.unitType === formData.unit_type)?.rate || 5.5
                                      ))}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button onClick={closeModal} className="btn btn-secondary flex-1" disabled={loading}>Cancel</button>
                      <button
                        onClick={handleStart}
                        className={`btn flex-1 gap-2 ${isBackdated ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'btn-primary'}`}
                        disabled={loading || !formData.driver_id || !formData.vehicle_id || (isBackdated && isBackdatedCompleted && backdatedUnits <= 0)}
                      >
                        {isBackdated ? <History size={15} /> : <Zap size={15} />}
                        {loading ? 'Saving...' : isBackdated ? 'Record Past Charge' : 'Start Session'}
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
            <div className="stat-card max-w-lg w-full" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between p-6 pb-2">
                <div>
                  <h2 className="font-bold text-xl">Session Summary</h2>
                  <div className="text-xs text-slate-400 font-mono tracking-tight mt-0.5">{(selected as any).receipt_number || selected.receiptNumber}</div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-5">
                {/* Status Banner */}
                <div className={`p-4 rounded-xl flex items-center justify-between border ${
                  selected.status === 'active' ? 'bg-orange-50 border-orange-100' :
                  selected.status === 'pending_payment' ? 'bg-red-50 border-red-100' :
                  selected.status === 'completed' ? 'bg-green-50 border-green-100' :
                  'bg-slate-50 border-slate-100'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      selected.status === 'active' ? 'bg-orange-100 text-orange-600' :
                      selected.status === 'pending_payment' ? 'bg-red-100 text-red-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {selected.status === 'active' ? <Clock size={20} /> : 
                       selected.status === 'pending_payment' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Session Status</div>
                      <div className="font-bold text-sm capitalize">{getStatusLabel(selected.status)}</div>
                    </div>
                  </div>
                  <span className={`badge ${getStatusColor(selected.status)}`}>{getStatusLabel(selected.status)}</span>
                </div>

                {/* Data Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Driver</div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <UserPlus size={14} className="text-slate-400" />
                      {selected.driverName || 'Walk-in Customer'}
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Vehicle</div>
                    <div className="font-semibold text-slate-900 flex items-center justify-end gap-1.5">
                      {selected.vehiclePlate || 'N/A'}
                      <Car size={14} className="text-slate-400" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Energy Delivered</div>
                    <div className="font-black text-blue-600 flex items-center gap-1.5">
                      <Zap size={14} />
                      {selected.unitsConsumed ? `${selected.unitsConsumed} ${selected.unitType}` : 'Calculating...'}
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Total Bill</div>
                    <div className="font-black text-slate-900">
                      {formatCurrency(selected.totalAmount || selected.prepaidAmount || 0)}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Started At</span>
                    <span className="text-slate-700 font-bold">{formatDateTime(selected.startTime || selected.createdAt)}</span>
                  </div>
                  {selected.endTime && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Finished At</span>
                      <span className="text-slate-700 font-bold">{formatDateTime(selected.endTime)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Pricing Tier</span>
                    <span className="text-slate-700 font-bold">GHS {selected.rateAtTime} / {selected.unitType}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  {selected.status === 'active' && (
                    <button onClick={handleOpenComplete} className="btn btn-primary w-full py-4 gap-2 text-base shadow-lg shadow-blue-200">
                      <Zap size={18} fill="currentColor" /> Finish Charging Session
                    </button>
                  )}
                  
                  {selected.status === 'pending_payment' && (
                    <button onClick={() => { 
                      setIsPaying(true); 
                      const driver = drivers?.find(d => d.id === selected.driverId);
                      if (driver) setPaymentPhone(driver.phone);
                    }} className="btn btn-primary w-full py-4 gap-2 text-base shadow-lg shadow-blue-200">
                      <DollarSign size={18} /> Record & Collect Payment
                    </button>
                  )}

                  {selected.status === 'completed' && (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-100 text-green-700 text-center font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle size={16} /> TRANSACTION FULLY SETTLED
                    </div>
                  )}

                  {selected.status === 'active' && (
                    <button 
                      onClick={() => {
                        if (confirm('CANCEL SESSION: This will stop the session without recording usage. Proceed?')) {
                          handleUpdateStatus(selected.id, 'cancelled');
                        }
                      }} 
                      className="btn bg-white border border-red-200 text-red-500 hover:bg-red-50 w-full py-3 gap-2"
                      disabled={loading}
                    >
                      <XCircle size={16}/> Cancel Active Session
                    </button>
                  )}

                  {user?.role === 'super_admin' && (
                    <div className="pt-4 mt-2 border-t border-slate-100">
                      <button 
                        onClick={() => handleDelete(selected.id)} 
                        className="w-full btn bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-2 py-3"
                        disabled={loading}
                      >
                        <Trash2 size={16}/> {loading ? 'Deleting...' : 'Permanent Data Pruning'}
                      </button>
                      <p className="text-[9px] text-center text-slate-400 mt-2 font-medium">SUPER ADMIN ONLY: PERMANENTLY REMOVE RECORDS</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── COMPLETE SESSION FORM ─── */}
        {isCompleting && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="stat-card max-w-md w-full" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
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
                  {/* Send to Pending — records usage but does NOT open payment */}
                  <button
                    onClick={handleSendToPending}
                    className="btn flex-1 gap-2 font-bold"
                    style={{ background: '#fef3c7', color: '#92400e', border: '1.5px solid #fde68a' }}
                    disabled={loading || (selected?.mode !== 'prepaid' && completeForm.units <= 0)}
                  >
                    <Clock size={15} /> Send to Pending
                  </button>
                  {/* Finish & Pay Now — records usage AND opens payment collection */}
                  <button onClick={handleComplete} className="btn btn-primary flex-1" disabled={loading}>
                    {loading ? 'Processing...' : 'Finish & Pay Now'}
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
                      { id: 'wallet', label: 'Wallet', color: 'bg-blue-600', icon: Wallet },
                      { id: 'mtn', label: 'MTN MoMo', color: 'bg-yellow-500', icon: Smartphone },
                      { id: 'telecel', label: 'Telecel Cash', color: 'bg-red-600', icon: Smartphone },
                      { id: 'airteltigo', label: 'Tigo Cash', color: 'bg-blue-500', icon: Smartphone },
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
                  {/* Cash removed: attendants must use MoMo only per payment protocol */}
                  <p className="text-[10px] text-slate-400 mt-2 italic text-center">💡 Cash payments are not accepted. Use MoMo or Wallet only.</p>
                </div>

                {['mtn', 'telecel', 'airteltigo'].includes(paymentMethod) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="form-label">MoMo Number <span className="text-slate-400 font-normal">(for records)</span></label>
                    <div className="relative">
                      <input 
                        className="form-input text-base tracking-widest" 
                        style={{ paddingLeft: '52px' }}
                        placeholder="024XXXXXXX" 
                        value={paymentPhone} 
                        onChange={e => setPaymentPhone(e.target.value)} 
                      />
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      Saved for financial records — no MoMo prompt is sent
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setIsPaying(false)} className="btn btn-secondary flex-1">Back</button>
                  <button onClick={handleTriggerPayment} className="btn btn-primary flex-1 py-4" disabled={loading}>
                    {loading ? 'Processing...' : paymentMethod === 'wallet' ? 'Pay from Wallet' : 'Record Payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── PAYMENT SUCCESS & RECEIPT MODAL ─── */}
        {showSuccess && completedPayment && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-y-auto border border-slate-200 animate-in zoom-in-95 duration-300" style={{ maxHeight: '95vh' }}>
              <div className="p-6 text-center bg-blue-600 text-white">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <CheckCircle size={40} className="text-white" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight">Payment Success!</h2>
                <p className="text-blue-100 text-xs mt-1">Transaction recorded and verified</p>
              </div>

              <div id="printable-receipt-success" className="p-6 bg-white">
                <div className="text-center mb-6">
                  <div className="font-black text-lg uppercase tracking-tight text-slate-900">SPERO ENERGY RESOURCES</div>
                  <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">EV Charging Receipt</div>
                </div>
                
                <div className="border-y border-dashed border-slate-200 py-4 mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase text-[10px] font-bold">Receipt #</span>
                    <span className="font-mono font-bold text-blue-600">{completedPayment.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase text-[10px] font-bold">Driver</span>
                    <span className="font-bold text-slate-800">{completedPayment.driverName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase text-[10px] font-bold">Vehicle</span>
                    <span className="font-bold text-slate-800">{completedPayment.vehiclePlate}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-50">
                    <span className="text-slate-400 uppercase text-[10px] font-bold">Energy</span>
                    <span className="font-bold text-slate-800">{completedPayment.unitsConsumed} {completedPayment.unitType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 uppercase text-[10px] font-bold">Total Paid</span>
                    <span className="font-black text-blue-600 text-lg">{formatCurrency(completedPayment.amount)}</span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-[10px] italic text-slate-400">Powered by Spero Fleet SCMS</p>
                </div>
              </div>

              {/* MoMo SMS Proof Upload — shown for MoMo payments */}
              {completedPayment && ['mtn', 'telecel', 'airteltigo'].includes(completedPayment.method) && (
                <div className="p-5 border-t border-slate-100 bg-slate-50">
                  {proofUploaded ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-200">
                      <ShieldCheck size={20} className="text-green-600 shrink-0" />
                      <div>
                        <div className="font-bold text-green-800 text-sm">MoMo Proof Saved</div>
                        <div className="text-xs text-green-600">Payment verification complete. Fraud checks enabled.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Upload size={14} className="text-blue-600" />
                        <span className="text-xs font-bold uppercase text-slate-600 tracking-wider">Upload MoMo SMS Proof</span>
                        <span className="text-[10px] text-slate-400">(Required for audit)</span>
                      </div>

                      {/* Image preview */}
                      {proofPreview && (
                        <div className="relative w-full rounded-xl overflow-hidden border border-slate-200">
                          <img src={proofPreview} alt="SMS Proof" className="w-full max-h-40 object-cover" />
                          <button
                            onClick={() => { setProofFile(null); setProofPreview(null); }}
                            className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      {/* File input — hidden, triggered by buttons below */}
                      <input
                        ref={proofInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setProofFile(file);
                          const reader = new FileReader();
                          reader.onload = () => setProofPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        {/* Camera capture */}
                        <button
                          onClick={() => {
                            if (proofInputRef.current) {
                              proofInputRef.current.setAttribute('capture', 'environment');
                              proofInputRef.current.click();
                            }
                          }}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                        >
                          <Camera size={16} /> Take Photo
                        </button>
                        {/* Gallery picker */}
                        <button
                          onClick={() => {
                            if (proofInputRef.current) {
                              proofInputRef.current.removeAttribute('capture');
                              proofInputRef.current.click();
                            }
                          }}
                          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                        >
                          <FileImage size={16} /> Choose File
                        </button>
                      </div>

                      {/* Optional SMS text */}
                      <textarea
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                        rows={2}
                        placeholder="Paste SMS text here (optional)..."
                        value={proofSmsText}
                        onChange={(e) => setProofSmsText(e.target.value)}
                      />

                      {/* Upload button */}
                      {proofFile && (
                        <button
                          onClick={async () => {
                            if (!proofFile || !completedPayment) return;
                            setIsUploadingProof(true);
                            try {
                              const img = new Image();
                              const objectUrl = URL.createObjectURL(proofFile);
                              img.src = objectUrl;
                              img.onload = async () => {
                                URL.revokeObjectURL(objectUrl);
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                const MAX_WIDTH = 1000;
                                const MAX_HEIGHT = 1000;
                                let width = img.width;
                                let height = img.height;
                                
                                if (width > height) {
                                  if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                  }
                                } else {
                                  if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                  }
                                }
                                
                                canvas.width = width;
                                canvas.height = height;
                                ctx?.drawImage(img, 0, 0, width, height);
                                
                                // Compress image to JPEG at 60% quality to avoid 1MB server action limits
                                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                                const ext = 'jpg';
                                
                                const res = await uploadPaymentProof({
                                  session_id: completedPayment.id,
                                  receipt_number: completedPayment.receiptNumber,
                                  image_base64: compressedBase64,
                                  image_mime_type: 'image/jpeg',
                                  image_extension: ext,
                                  sms_text: proofSmsText || undefined,
                                });
                                if (res.success) {
                                  setProofUploaded(true);
                                  toast.success('MoMo proof uploaded successfully!');
                                } else {
                                  toast.error('Upload failed: ' + res.error);
                                }
                                setIsUploadingProof(false);
                              };
                              img.onerror = () => {
                                setIsUploadingProof(false);
                                toast.error('Failed to process image');
                              };
                            } catch (err) {
                              setIsUploadingProof(false);
                              toast.error('Upload failed. Try again.');
                            }
                          }}
                          disabled={isUploadingProof}
                          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-sm transition-all active:scale-95 disabled:opacity-60"
                        >
                          {isUploadingProof ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                          ) : (
                            <><Upload size={16} /> Upload MoMo Proof</>  
                          )}
                        </button>
                      )}

                      {!proofFile && (
                        <p className="text-[10px] text-amber-600 text-center font-medium">
                          ⚠️ Please take a photo of the client's MoMo confirmation SMS before closing.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 bg-slate-50 flex flex-col gap-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleShareWhatsApp(completedPayment)}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                  >
                    <Smartphone size={14} /> Send to WhatsApp
                  </button>
                </div>
                <button 
                  onClick={() => { setShowSuccess(false); setSelected(null); setCompletedPayment(null); }}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {!proofUploaded && ['mtn', 'telecel', 'airteltigo'].includes(completedPayment?.method || '') 
                    ? '⚠️ Close Without Proof (Not Recommended)' 
                    : 'Close & Continue'
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
