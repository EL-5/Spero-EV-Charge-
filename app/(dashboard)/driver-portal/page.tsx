'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { 
  useDrivers, 
  useVehicles, 
  useSessions, 
  useChargers, 
  useConnectors, 
  useSettings 
} from '@/hooks/use-database';
import { addDriver } from '@/app/actions/drivers';
import { addVehicle } from '@/app/actions/vehicles';
import { initiatePrepaidSession, stopSessionWithRefund } from '@/app/actions/sessions';
import { supabase } from '@/lib/supabase';
import { 
  Smartphone, 
  User, 
  Zap, 
  CreditCard, 
  RotateCw, 
  Play, 
  Square, 
  BatteryCharging, 
  ArrowRight, 
  Wallet, 
  UserPlus, 
  Lock, 
  Unlock, 
  CheckCircle,
  HelpCircle,
  Car,
  ChevronRight,
  TrendingDown,
  Info,
  Clock,
  Signal
} from 'lucide-react';
import { toast } from 'sonner';

export default function DriverPortalPage() {
  const queryClient = useQueryClient();

  // DB Hooks
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: sessions } = useSessions({ limit: 10 });
  const { data: chargers } = useChargers();
  const { data: connectors } = useConnectors();
  const { data: settingsRow } = useSettings();

  // Logged-in/Simulated Session State
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  
  // Registration Inputs
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPlate, setRegPlate] = useState('');
  const [regBrand, setRegBrand] = useState('BYD');
  const [regModel, setRegModel] = useState('Atto 3');
  const [regCapacity, setRegCapacity] = useState('60');

  // Wallet Simulation
  const [topUpAmount, setTopUpAmount] = useState('50');

  // Prepayment Inputs
  const [prepMode, setPrepMode] = useState<'charge_to_full' | 'fixed_budget'>('charge_to_full');
  const [prepStartSoc, setPrepStartSoc] = useState('20');
  const [prepBudgetAmount, setPrepBudgetAmount] = useState('50');
  const [momoCarrier, setMomoCarrier] = useState('MTN');
  const [momoNumber, setMomoNumber] = useState('');

  // Pending Transaction & Payment Callback Mock Simulation
  const [pendingSession, setPendingSession] = useState<any>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  // Active Charging Loop Simulation
  const [simulatedSession, setSimulatedSession] = useState<any>(null);
  const [simulatedKwh, setSimulatedKwh] = useState(0);
  const [simIntervalId, setSimIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Derive Pricing
  const kwhRate = 5.50; // standard fallback pricing

  // Filter Active Driver data
  const currentDriver = drivers?.find(d => d.id === activeDriverId);
  const currentVehicle = vehicles?.find(v => v.driverId === activeDriverId);

  // Set default momo number when active driver changes (User instruction 6: momo should be pre-filled from driver info)
  useEffect(() => {
    if (currentDriver) {
      setMomoNumber(currentDriver.phone || '');
    }
  }, [currentDriver]);

  // Load existing session if charging is active for driver
  useEffect(() => {
    if (activeDriverId && sessions) {
      const activeSess = sessions.find(s => s.driverId === activeDriverId && s.status === 'active');
      if (activeSess) {
        setSimulatedSession(activeSess);
        setSimulatedKwh(Number(activeSess.unitsConsumed || 0));
      }
    }
  }, [activeDriverId, sessions]);

  // Handle Driver Self Registration
  const handleSelfRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regPhone || !regPlate) {
      toast.error('Name, Phone Number and Plate Number are required!');
      return;
    }

    toast.loading('Creating account and registering vehicle...', { id: 'reg' });
    try {
      // 1. Add Driver
      const dRes = await addDriver({
        name: regName,
        phone: regPhone,
        email: regEmail || undefined,
        type: 'individual'
      });

      if (!dRes.success || !dRes.id) {
        toast.error(dRes.error || 'Registration failed', { id: 'reg' });
        return;
      }

      // 2. Add Vehicle linked to Driver
      const vRes = await addVehicle({
        brand: regBrand,
        model: regModel,
        plate_number: regPlate,
        driver_id: dRes.id
      });

      if (!vRes.success) {
        toast.error(vRes.error || 'Failed to link vehicle', { id: 'reg' });
        return;
      }

      // 3. Update battery capacity in DB (custom OCPP column)
      await supabase.from('vehicles')
        .update({ battery_capacity: Number(regCapacity) })
        .eq('driver_id', dRes.id);

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });

      setActiveDriverId(dRes.id);
      setShowRegisterForm(false);
      
      // Clear forms
      setRegName('');
      setRegPhone('');
      setRegPlate('');

      toast.success('Registration successful! Welcome to Spero EV.', { id: 'reg' });
    } catch (err: any) {
      toast.error('Unexpected error during registration: ' + err.message, { id: 'reg' });
    }
  };

  // Top Up Wallet Balance Simulation
  const handleWalletTopUp = async () => {
    if (!activeDriverId || !currentDriver) return;
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    try {
      const currentBalance = Number(currentDriver.walletBalance || 0);
      const newBalance = currentBalance + amount;

      await supabase.from('drivers')
        .update({ wallet_balance: newBalance })
        .eq('id', activeDriverId);

      await supabase.from('wallet_transactions').insert([{
        driver_id: activeDriverId,
        type: 'credit',
        amount: amount,
        balance_before: currentBalance,
        balance_after: newBalance,
        description: 'Self top-up via Mobile Money'
      }]);

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success(`GHS ${amount.toFixed(2)} credited to your wallet!`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Prepayment Initiation (Option A or Option B)
  const handleInitiatePayment = async () => {
    if (!activeDriverId || !currentVehicle) {
      toast.error('Please configure your driver account and vehicle capacity first');
      return;
    }

    if (!momoNumber) {
      toast.error('Carrier number is required');
      return;
    }

    toast.loading('Connecting Hubtel checkout...', { id: 'momo-init' });
    try {
      const capacity = Number(currentVehicle.batteryCapacity || 40.0);
      let targetUnits = 0;
      let cost = 0;

      if (prepMode === 'charge_to_full') {
        const remainingPercent = 100 - Number(prepStartSoc);
        targetUnits = capacity * (remainingPercent / 100);
        cost = targetUnits * kwhRate;
      } else {
        cost = Number(prepBudgetAmount);
        targetUnits = cost / kwhRate;
      }

      // Call initiate action
      const res = await initiatePrepaidSession({
        driver_id: activeDriverId,
        vehicle_id: currentVehicle.id,
        mode: prepMode,
        start_soc: prepMode === 'charge_to_full' ? Number(prepStartSoc) : undefined,
        budget_amount: prepMode === 'fixed_budget' ? Number(prepBudgetAmount) : undefined
      });

      if (res.success && res.session) {
        setPendingSession(res.session);
        setIsVerifyingPayment(true);
        toast.success('Mobile money OTP sent! Approve the prompt on your phone.', { id: 'momo-init' });
      } else {
        toast.error(res.error || 'Checkout initiation failed', { id: 'momo-init' });
      }
    } catch (err: any) {
      toast.error('Unexpected error: ' + err.message, { id: 'momo-init' });
    }
  };

  // Simulate Hubtel payment confirmation callback trigger
  const simulatePaymentWebhookCallback = async () => {
    if (!pendingSession) return;

    toast.loading('Simulating network callback confirmation...', { id: 'web-momo' });
    try {
      const response = await fetch('/api/webhooks/hubtel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientReference: pendingSession.receipt_number,
          status: 'success',
          amount: Number(pendingSession.prepaid_amount),
          transactionId: `HUB-${Math.floor(100000 + Math.random() * 900000)}`
        })
      });

      const resData = await response.json();
      if (resData.success) {
        // Fetch newly updated paid session from DB
        const { data: updatedSess } = await supabase.from('sessions')
          .select('*')
          .eq('id', pendingSession.id)
          .single();

        setPendingSession(updatedSess);
        setIsVerifyingPayment(false);
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        toast.success('Callback success! Prepayment verified, Charger RELEASED.', { id: 'web-momo' });
      } else {
        toast.error('Callback failed: ' + resData.error, { id: 'web-momo' });
      }
    } catch (err: any) {
      toast.error('Webhook trigger error: ' + err.message, { id: 'web-momo' });
    }
  };

  // Start Charging Command Simulation (Plugs charger gun and initiates active loop)
  const handleStartSimulatedCharge = async () => {
    if (!pendingSession) return;

    toast.loading('Connecting charging gun via OCPP...', { id: 'start' });
    try {
      const activeCharger = chargers?.[0] || { id: '00000000-0000-0000-0000-000000000000' };

      // Update Database session to active
      await supabase.from('sessions')
        .update({
          status: 'active',
          start_time: new Date().toISOString(),
          charger_id: activeCharger.id,
          connector_number: 1
        })
        .eq('id', pendingSession.id);

      // Link connector status
      await supabase.from('connectors')
        .update({
          status: 'Charging',
          current_session_id: pendingSession.id
        })
        .eq('connector_number', 1);

      // Log start log
      await supabase.from('ocpp_logs').insert([{
        charge_point_id: 'SPERO-EV-001',
        direction: 'IN',
        message_type: 'StartTransaction',
        payload: {
          connectorId: 1,
          idTag: 'MOCK_SELF_RFID',
          meterStart: 1024
        }
      }]);

      setSimulatedSession(pendingSession);
      setSimulatedKwh(0);
      setPendingSession(null);

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      toast.success('Connector plugged in! Energy flowing.', { id: 'start' });
    } catch (err: any) {
      toast.error('Error starting charge: ' + err.message, { id: 'start' });
    }
  };

  // Automated MeterValue loop simulation in driver app
  useEffect(() => {
    if (simulatedSession && !simIntervalId) {
      const targetUnits = Number(simulatedSession.target_units || 0);

      const interval = setInterval(async () => {
        setSimulatedKwh(prev => {
          const nextVal = prev + 1.2;

          // Push periodic meter updates directly to Supabase to mimic physical charger
          supabase.from('sessions')
            .update({
              units_consumed: nextVal,
              total_amount: nextVal * kwhRate
            })
            .eq('id', simulatedSession.id)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['sessions'] });
            });

          // Check if limit hit
          if (targetUnits > 0 && nextVal >= targetUnits) {
            clearInterval(interval);
            setSimIntervalId(null);
            setSimulatedSession(null);
            
            // Auto complete in database
            stopSessionWithRefund(simulatedSession.id, targetUnits).then(() => {
              supabase.from('connectors')
                .update({ status: 'Available', current_session_id: null })
                .eq('connector_number', 1)
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ['connectors'] });
                  queryClient.invalidateQueries({ queryKey: ['drivers'] });
                });
            });

            toast.success('Automated limit cutoff reached! Session closed and excess amount credited to your wallet!');
            return 0;
          }

          return nextVal;
        });
      }, 3500);

      setSimIntervalId(interval);
    }

    return () => {
      if (simIntervalId) {
        clearInterval(simIntervalId);
      }
    };
  }, [simulatedSession, simIntervalId]);

  // Stop Charging Command (Premature refund calculation)
  const handleStopChargingWithRefund = async () => {
    if (!simulatedSession) return;

    if (simIntervalId) {
      clearInterval(simIntervalId);
      setSimIntervalId(null);
    }

    toast.loading('Unplugging gun and calculating wallet refund...', { id: 'stop' });
    try {
      const finalKwh = simulatedKwh;
      
      // Stop session and calculate GHS refund in server action
      const res = await stopSessionWithRefund(simulatedSession.id, finalKwh);

      // Reset connector
      await supabase.from('connectors')
        .update({
          status: 'Available',
          current_session_id: null
        })
        .eq('connector_number', 1);

      setSimulatedSession(null);
      setSimulatedKwh(0);

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });

      if (res.success && (res.refundAmount || 0) > 0.01) {
        toast.success(`Stopped early! GHS ${res.refundAmount?.toFixed(2)} unused balance successfully credited back to your wallet!`, { id: 'stop' });
      } else {
        toast.success('Session completed successfully!', { id: 'stop' });
      }
    } catch (err: any) {
      toast.error(err.message, { id: 'stop' });
    }
  };

  // Estimations calculation helpers
  const calculatedEstimatedKwh = () => {
    const capacity = Number(currentVehicle?.batteryCapacity || 40.0);
    if (prepMode === 'charge_to_full') {
      const remainingPercent = 100 - Number(prepStartSoc);
      return capacity * (remainingPercent / 100);
    } else {
      return Number(prepBudgetAmount) / kwhRate;
    }
  };

  const calculatedCost = () => {
    if (prepMode === 'charge_to_full') {
      return calculatedEstimatedKwh() * kwhRate;
    } else {
      return Number(prepBudgetAmount);
    }
  };

  const calculatedRefund = () => {
    if (!simulatedSession) return 0;
    const prepaid = Number(simulatedSession.prepaidAmount || 0);
    const consumedCost = simulatedKwh * kwhRate;
    return Math.max(0, prepaid - consumedCost);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc]">
      <TopBar 
        title="Simulated Driver Self-Service Portal" 
        subtitle="Self-registration, prepaid MoMo mobile checkouts and active OCPP refund tracking" 
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: INSTRUCTION CARD & DRIVER LOGIN SELECTION */}
          <div className="lg:col-span-4 space-y-6">
            <div className="stat-card bg-[#1e293b] border-[#334155]">
              <div className="flex items-center gap-2 mb-4">
                <Info className="text-[#3b82f6]" size={18} />
                <h3 className="font-bold text-white text-sm">Self-Charging Sandbox Guidelines</h3>
              </div>
              <ul className="space-y-3 text-xs text-[#94a3b8] list-disc list-inside">
                <li>Create an account or select an existing driver in the portal.</li>
                <li>Momo payments first policy is strictly enforced. Attendant mode is required for manual postpaid cash collections.</li>
                <li>MoMo carriers utilize a sandbox callback webhook simulator (POSTs to <code className="bg-[#0f172a] px-1 rounded text-cyan-400">/api/webhooks/hubtel</code>).</li>
                <li>Automated OCPP shutdown triggers if target kWh threshold or 100% capacity limit is reached.</li>
                <li>Premature stopping will automatically credit the driver's system wallet balance for future sessions.</li>
              </ul>
            </div>

            <div className="stat-card bg-[#1e293b] border-[#334155] space-y-4">
              <h3 className="font-bold text-sm text-white">Select Active Driver Login</h3>
              <div>
                <label className="form-label text-[#94a3b8] text-[10px]">CURRENT SIMULATED SIGN-IN</label>
                <select
                  className="form-select bg-[#0f172a] border-[#334155] text-white"
                  value={activeDriverId}
                  onChange={(e) => {
                    setActiveDriverId(e.target.value);
                    setShowRegisterForm(false);
                    setPendingSession(null);
                    setSimulatedSession(null);
                  }}
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers?.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowRegisterForm(true)}
                  className="btn btn-secondary btn-sm bg-[#0f172a] hover:bg-[#1e293b] border-[#334155] text-white flex-1 flex justify-center items-center gap-1.5"
                >
                  <UserPlus size={14} /> Self-Register Account
                </button>
              </div>
            </div>
          </div>

          {/* CENTER: SIMULATED SMARTPHONE SCREEN MOCKUP */}
          <div className="lg:col-span-8 flex justify-center">
            
            <div className="w-full max-w-[390px] h-[780px] rounded-[45px] border-[12px] border-[#334155] bg-[#090d16] shadow-2xl relative overflow-hidden flex flex-col shadow-cyan-500/5">
              
              {/* Phone Speaker Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#334155] rounded-b-2xl z-50 flex items-center justify-center">
                <div className="w-12 h-1 bg-[#1e293b] rounded-full" />
              </div>

              {/* Status Bar */}
              <div className="h-8 bg-[#090d16] flex items-center justify-between px-6 pt-2 text-[10px] text-[#94a3b8] font-bold z-40 select-none">
                <span>11:49</span>
                <div className="flex items-center gap-1.5">
                  <Signal size={10} />
                  <span>5G</span>
                  <div className="w-4 h-2 border border-[#94a3b8] rounded-sm p-0.5 flex items-center">
                    <div className="w-full h-full bg-[#10b981] rounded-2xs" />
                  </div>
                </div>
              </div>

              {/* Phone Content Screen */}
              <div className="flex-1 overflow-y-auto p-5 pb-8 scrollbar-none relative">
                
                {/* SCREEN VIEW A: ACCOUNT REGISTRATION FORM */}
                {showRegisterForm && (
                  <form onSubmit={handleSelfRegister} className="space-y-4 pt-4">
                    <div className="text-center pb-4">
                      <UserPlus className="text-[#3b82f6] mx-auto mb-2" size={32} />
                      <h4 className="font-bold text-white text-base">Driver Self-Registration</h4>
                      <p className="text-[10px] text-[#94a3b8]">Create a personal driver profile and load vehicle battery details</p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="form-label text-[10px] text-white">DRIVER FULL NAME *</label>
                        <input 
                          className="form-input bg-[#0f172a] border-[#334155] text-white text-xs"
                          placeholder="e.g. Kwame Osei"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label text-[10px] text-white">MOBILE NUMBER (MOMO TRACING) *</label>
                        <input 
                          className="form-input bg-[#0f172a] border-[#334155] text-white text-xs"
                          placeholder="e.g. 0541223445"
                          required
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label text-[10px] text-white">EMAIL ADDRESS</label>
                        <input 
                          type="email"
                          className="form-input bg-[#0f172a] border-[#334155] text-white text-xs"
                          placeholder="e.g. kwame@spero.com"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                        />
                      </div>

                      <hr className="border-[#334155] my-2" />

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="form-label text-[10px] text-white">CAR MODEL *</label>
                          <input 
                            className="form-input bg-[#0f172a] border-[#334155] text-white text-xs"
                            placeholder="e.g. BYD Atto 3"
                            value={regModel}
                            onChange={(e) => setRegModel(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label text-[10px] text-white">PLATE NUMBER *</label>
                          <input 
                            className="form-input bg-[#0f172a] border-[#334155] text-white text-xs"
                            placeholder="e.g. GR-9028-24"
                            required
                            value={regPlate}
                            onChange={(e) => setRegPlate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="form-label text-[10px] text-white">BATTERY PACK CAPACITY (KWH) *</label>
                        <input 
                          type="number"
                          className="form-input bg-[#0f172a] border-[#334155] text-white text-xs font-bold text-cyan-400"
                          placeholder="e.g. 60"
                          required
                          value={regCapacity}
                          onChange={(e) => setRegCapacity(e.target.value)}
                        />
                        <p className="text-[9px] text-[#94a3b8] mt-1">Needed for automated "Charge to Full" estimations.</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <button 
                        type="button" 
                        onClick={() => setShowRegisterForm(false)}
                        className="btn btn-secondary bg-transparent border-[#334155] text-white text-xs py-2 flex-1"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        className="btn btn-primary bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs py-2 flex-1 font-bold justify-center"
                      >
                        Save Account
                      </button>
                    </div>
                  </form>
                )}

                {/* SCREEN VIEW B: WELCOME / NOT LOGGED IN STATE */}
                {!activeDriverId && !showRegisterForm && (
                  <div className="h-full flex flex-col justify-center items-center text-center pt-24 space-y-6">
                    <Smartphone className="text-[#3b82f6] animate-bounce" size={48} />
                    <div className="space-y-2">
                      <h4 className="font-bold text-white text-lg">Spero Driver App</h4>
                      <p className="text-xs text-[#94a3b8] px-4 leading-relaxed">
                        Log in using the panel on the left or register a new self-service account to begin automated charging.
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowRegisterForm(true)}
                      className="btn btn-primary bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs py-2.5 px-6 rounded-xl flex items-center gap-1.5"
                    >
                      <UserPlus size={14} /> Register Free Account
                    </button>
                  </div>
                )}

                {/* SCREEN VIEW C: MAIN HOME WALLET / CHECKOUT SCREEN */}
                {activeDriverId && !showRegisterForm && !pendingSession && !simulatedSession && (
                  <div className="space-y-6 pt-4">
                    {/* Header profile info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center justify-center text-[#3b82f6] font-bold text-sm">
                          {currentDriver?.name?.[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-white leading-tight">{currentDriver?.name}</h4>
                          <span className="text-[9px] text-cyan-400 font-bold">{currentVehicle?.brand} {currentVehicle?.model} ({currentVehicle?.batteryCapacity} kWh)</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-[#94a3b8] bg-[#1e293b] px-2 py-0.5 rounded font-bold">{currentVehicle?.plateNumber}</span>
                    </div>

                    {/* App Wallet Card */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#334155] space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-wider flex items-center gap-1"><Wallet size={12} /> Spero Wallet</span>
                        <span className="text-[10px] text-[#10b981] font-bold bg-[#10b981]/10 px-2 py-0.5 rounded-full">Secured</span>
                      </div>
                      <div className="text-2xl font-black text-white leading-none">
                        GHS {Number(currentDriver?.walletBalance || 0).toFixed(2)}
                      </div>
                      
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          className="form-input bg-[#090d16] border-[#334155] text-white text-xs py-1.5 w-24 font-bold"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                        />
                        <button
                          onClick={handleWalletTopUp}
                          className="btn btn-secondary btn-sm bg-[#3b82f6] border-none hover:bg-[#2563eb] text-white text-[10px] font-bold flex-1 py-1.5"
                        >
                          Top Up Balance
                        </button>
                      </div>
                    </div>

                    {/* Prepayment Checkout setup */}
                    <div className="stat-card bg-[#1e293b]/40 border-[#334155] space-y-4">
                      <h5 className="text-xs font-bold text-white border-b border-[#334155] pb-2">Prepaid Charging Checkout</h5>
                      
                      {/* Mode selection tabs */}
                      <div className="grid grid-cols-2 gap-1 bg-[#0f172a] p-1 rounded-lg border border-[#334155]">
                        <button
                          onClick={() => setPrepMode('charge_to_full')}
                          className={`py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            prepMode === 'charge_to_full' ? 'bg-[#3b82f6] text-white' : 'text-[#94a3b8]'
                          }`}
                        >
                          Charge To Full
                        </button>
                        <button
                          onClick={() => setPrepMode('fixed_budget')}
                          className={`py-1.5 rounded-md text-[10px] font-bold transition-all ${
                            prepMode === 'fixed_budget' ? 'bg-[#3b82f6] text-white' : 'text-[#94a3b8]'
                          }`}
                        >
                          Fixed Budget
                        </button>
                      </div>

                      {/* Inputs depending on tabs */}
                      {prepMode === 'charge_to_full' ? (
                        <div>
                          <label className="form-label text-[#94a3b8] text-[9px]">STARTING BATTERY STATE (%)</label>
                          <div className="flex gap-2">
                            <input 
                              type="range"
                              min="0"
                              max="90"
                              className="flex-1 accent-[#3b82f6]"
                              value={prepStartSoc}
                              onChange={(e) => setPrepStartSoc(e.target.value)}
                            />
                            <span className="text-xs font-mono font-bold text-white w-8">{prepStartSoc}%</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="form-label text-[#94a3b8] text-[9px]">ENTER PREPAYMENT AMOUNT (GHS)</label>
                          <input 
                            type="number"
                            className="form-input bg-[#0f172a] border-[#334155] text-white text-xs font-bold"
                            placeholder="e.g. 50.00"
                            value={prepBudgetAmount}
                            onChange={(e) => setPrepBudgetAmount(e.target.value)}
                          />
                        </div>
                      )}

                      {/* MoMo number prefilled based on instructions */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="form-label text-[#94a3b8] text-[9px]">CARRIER</label>
                          <select
                            className="form-select bg-[#0f172a] border-[#334155] text-white text-[10px] py-1.5"
                            value={momoCarrier}
                            onChange={(e) => setMomoCarrier(e.target.value)}
                          >
                            <option value="MTN">MTN MoMo</option>
                            <option value="Telecel">Telecel</option>
                            <option value="AT">AT Money</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="form-label text-[#94a3b8] text-[9px]">MOBILE NUMBER</label>
                          <input 
                            type="text"
                            className="form-input bg-[#0f172a] border-[#334155] text-white text-xs font-bold py-1.5 text-center"
                            placeholder="Prefilled Momo"
                            value={momoNumber}
                            onChange={(e) => setMomoNumber(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Dynamic Cost Estimator */}
                      <div className="p-3 rounded-xl bg-[#090d16]/60 border border-[#334155] text-xs text-[#94a3b8] space-y-1">
                        <div className="flex justify-between">
                          <span>Est. Energy Needed:</span>
                          <strong className="text-white">{calculatedEstimatedKwh().toFixed(2)} kWh</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Unit Pricing:</span>
                          <span>GHS {kwhRate.toFixed(2)} / kWh</span>
                        </div>
                        <hr className="border-[#334155] my-1" />
                        <div className="flex justify-between font-bold">
                          <span className="text-white">Estimated Cost:</span>
                          <strong className="text-[#3b82f6]">GHS {calculatedCost().toFixed(2)}</strong>
                        </div>
                      </div>

                      <button
                        onClick={handleInitiatePayment}
                        className="btn btn-primary bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs py-2.5 w-full font-bold justify-center flex items-center gap-1.5"
                      >
                        <CreditCard size={14} /> Pay GHS {calculatedCost().toFixed(2)} via MoMo
                      </button>
                    </div>
                  </div>
                )}

                {/* SCREEN VIEW D: HUBTEL PENDING CHECKOUT LOCK SCREEN */}
                {pendingSession && isVerifyingPayment && (
                  <div className="h-full flex flex-col justify-center items-center text-center pt-16 space-y-6">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full border-4 border-t-cyan-400 border-cyan-950 animate-spin flex items-center justify-center" />
                      <Lock className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400" size={24} />
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-white text-base">Securing Payment...</h4>
                      <p className="text-[10px] text-[#94a3b8] px-6 leading-relaxed">
                        A mobile money payment prompt has been sent to carrier on <strong className="text-white">{momoNumber}</strong>. Please confirm with your wallet PIN.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#1e293b]/40 border border-[#334155] w-full text-xs text-[#94a3b8] space-y-1">
                      <div className="flex justify-between"><span>Session ID:</span> <span className="font-mono">{pendingSession.receipt_number}</span></div>
                      <div className="flex justify-between"><span>Amount due:</span> <strong className="text-white">GHS {Number(pendingSession.prepaid_amount).toFixed(2)}</strong></div>
                    </div>

                    <div className="w-full pt-4 border-t border-[#334155] space-y-2">
                      <button
                        onClick={simulatePaymentWebhookCallback}
                        className="btn btn-primary bg-[#10b981] hover:bg-[#059669] text-white text-xs py-2.5 w-full font-bold justify-center"
                      >
                        ⚡ Simulate Callback Success
                      </button>
                      <button
                        onClick={() => {
                          setPendingSession(null);
                          setIsVerifyingPayment(false);
                        }}
                        className="text-xs text-red-400 hover:text-red-300 font-bold block mx-auto py-2"
                      >
                        Cancel Transaction
                      </button>
                    </div>
                  </div>
                )}

                {/* SCREEN VIEW E: PREPAYMENT CLEARED - START CHARGING padlocked SCREEN */}
                {pendingSession && !isVerifyingPayment && pendingSession.payment_status === 'paid' && (
                  <div className="h-full flex flex-col justify-center items-center text-center pt-16 space-y-6">
                    <div className="w-20 h-20 rounded-full bg-[#10b981]/15 border border-[#10b981]/30 flex items-center justify-center text-[#10b981]">
                      <Unlock className="animate-pulse" size={32} />
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-white text-base">Payment Verified!</h4>
                      <p className="text-[10px] text-[#94a3b8] px-6">
                        Checkout reference <strong className="text-white">{pendingSession.receipt_number}</strong> is fully funded. Please connect the nozzle gun to your car and tap start.
                      </p>
                    </div>

                    <button
                      onClick={handleStartSimulatedCharge}
                      className="btn btn-primary bg-[#10b981] hover:bg-[#059669] text-white text-xs py-3 w-full font-black uppercase tracking-widest justify-center flex items-center gap-2 shadow-lg shadow-green-500/10"
                    >
                      <Play size={14} /> Start Charge Nozzle
                    </button>
                  </div>
                )}

                {/* SCREEN VIEW F: ACTIVE TELEMETRY CHARGING AND REFUND PORTAL */}
                {simulatedSession && (
                  <div className="space-y-6 pt-4 text-center">
                    
                    {/* Glowing active loader */}
                    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-cyan-500/10" />
                      <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 animate-spin" />
                      
                      <div className="text-center space-y-0.5">
                        <BatteryCharging className="text-[#06b6d4] mx-auto animate-bounce" size={24} />
                        <div className="text-2xl font-black text-white leading-none">
                          {simulatedKwh.toFixed(1)}
                        </div>
                        <span className="text-[9px] font-bold text-[#94a3b8] uppercase tracking-wider block">kWh Charge</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="badge status-info text-[9px]"><Clock size={10} /> Active OCPP Telemetry</span>
                      <h4 className="font-black text-white text-base">Charging Your Vehicle...</h4>
                      <p className="text-[10px] text-cyan-400 font-bold">{simulatedSession.vehiclePlate || 'GR-9028-24'} • BYD Atto 3</p>
                    </div>

                    {/* Prepayment consumption breakdown and live refund estimaton */}
                    <div className="p-4 rounded-xl bg-[#1e293b]/40 border border-[#334155] text-xs text-left text-[#94a3b8] space-y-2">
                      <div className="flex justify-between">
                        <span>Paid Deposit:</span>
                        <strong className="text-white">GHS {Number(simulatedSession.prepaidAmount || 0).toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Consumed Cost:</span>
                        <strong className="text-white">GHS {(simulatedKwh * kwhRate).toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Unit Cap Limit:</span>
                        <span className="text-white font-bold">{Number(simulatedSession.targetUnits || 0).toFixed(2)} kWh</span>
                      </div>
                      <hr className="border-[#334155] my-1" />
                      
                      {/* Live refund widget */}
                      <div className="p-3 rounded-lg bg-gradient-to-r from-[#06b6d4]/10 to-transparent border border-[#06b6d4]/20 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-bold text-[#06b6d4] uppercase tracking-wider flex items-center gap-1"><TrendingDown size={10} /> Live Refund Credit</span>
                          <div className="font-black text-white text-sm">GHS {calculatedRefund().toFixed(2)}</div>
                        </div>
                        <span className="text-[8px] text-[#94a3b8] italic text-right max-w-[120px]">Will instantly credit your wallet if stopped early</span>
                      </div>
                    </div>

                    <button
                      onClick={handleStopChargingWithRefund}
                      className="btn btn-danger py-3 w-full font-bold uppercase tracking-wider text-xs justify-center flex items-center gap-2 shadow-lg shadow-red-500/10"
                    >
                      <Square size={12} /> Stop Charge & Get Refund
                    </button>
                  </div>
                )}

              </div>

              {/* Phone Home Indicator Bar */}
              <div className="h-4 bg-[#090d16] flex justify-center items-center pb-2 z-50">
                <div className="w-24 h-1 bg-[#475569] rounded-full" />
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
