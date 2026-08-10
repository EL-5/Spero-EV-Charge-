'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { 
  useDrivers, 
  useVehicles, 
  useSessions, 
  useChargers, 
  useConnectors, 
  useSettings 
} from '@/hooks/use-database';
import { initiatePrepaidSession, processPayment, stopSessionWithRefund } from '@/app/actions/sessions';
import { requestWalletTopUp } from '@/app/actions/wallets';
import { supabase } from '@/lib/supabase';
import { 
  User, Zap, Play, Square, 
  BatteryCharging, CheckCircle, 
  Signal, ShieldCheck, Battery, ZapOff, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function DriverPortalPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Data Hooks
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: chargers } = useChargers();
  const { data: connectors } = useConnectors();

  // Top level tab
  const [activeTab, setActiveTab] = useState<'registered'|'guest'>('registered');

  // Registered State
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
         router.push('/driver-login');
      } else {
        setActiveDriverId(data.user.id);
      }
    });
  }, [router]);

  const currentDriver = drivers?.find(d => d.id === activeDriverId);
  const currentVehicle = vehicles?.find(v => v.driverId === activeDriverId);
  const [topUpAmount, setTopUpAmount] = useState('50');

  // Guest State
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [guestCapacity, setGuestCapacity] = useState('40');
  const [guestPaymentMethod, setGuestPaymentMethod] = useState('momo_mtn');

  // Common Charge Setup
  const [prepMode, setPrepMode] = useState<'charge_to_full' | 'fixed_budget'>('charge_to_full');
  const [prepStartSoc, setPrepStartSoc] = useState('20');
  const [prepBudgetAmount, setPrepBudgetAmount] = useState('50');
  const [selectedChargerId, setSelectedChargerId] = useState('');
  const [selectedGun, setSelectedGun] = useState<number>(1);

  // Live Session / Telemetry State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<any>(null);

  const kwhRate = 5.50; // standard fallback

  // Polling / Realtime for Connector Status
  const activeCharger = chargers?.find(c => c.id === selectedChargerId);
  const activeConnector = connectors?.find(
    c => c.chargerId === selectedChargerId && c.connectorNumber === selectedGun
  );

  const isGunPluggedIn = activeConnector?.status === 'Preparing';
  const isCharging = activeConnector?.status === 'Charging';

  // Live Telemetry Subscription
  useEffect(() => {
    let sub: any;
    if (activeSessionId) {
      sub = supabase
        .channel(`session_${activeSessionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${activeSessionId}` }, 
          (payload) => {
            setLiveSession(payload.new);
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
          })
        .subscribe();
      
      // Fetch initial
      supabase.from('sessions').select('*').eq('id', activeSessionId).single().then(({data}) => {
        if (data) setLiveSession(data);
      });
    }
    return () => { if (sub) supabase.removeChannel(sub); };
  }, [activeSessionId, queryClient]);

  // Calculations
  const getCapacity = () => activeTab === 'registered' ? Number(currentVehicle?.batteryCapacity || 40) : Number(guestCapacity || 40);
  
  const getEstimatedCost = () => {
    if (prepMode === 'fixed_budget') return Number(prepBudgetAmount);
    const neededPercent = 100 - Number(prepStartSoc);
    const units = getCapacity() * (neededPercent / 100);
    let cost = units * kwhRate;
    
    // Wallet cap logic for registered users
    if (activeTab === 'registered' && currentDriver) {
      const bal = Number(currentDriver.walletBalance || 0);
      if (bal < cost) cost = bal;
    }
    return cost;
  };

  const getEstimatedUnits = () => getEstimatedCost() / kwhRate;

  // Actions
  const handleWalletTopUp = async () => {
    if (!activeDriverId || !currentDriver) return;
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('Enter valid amount');

    toast.loading('Submitting top-up request...', { id: 'topup' });
    try {
      const res = await requestWalletTopUp({
        amount,
        method: 'momo_manual',
        reference: 'Driver Portal Quick Top-Up',
      });
      if (!res.success) throw new Error(res.error || 'Failed to submit request');
      
      toast.success(`Request for GHS ${amount} submitted. Awaiting staff approval.`, { id: 'topup' });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    } catch (e: any) {
      toast.error(e.message || 'An unexpected error occurred.', { id: 'topup' });
    }
  };

  const handleInitiateCharge = async () => {
    if (!selectedChargerId) return toast.error('Please select a charger');
    if (!isGunPluggedIn) return toast.error('Please plug the gun into the vehicle first');

    const cost = getEstimatedCost();
    if (cost <= 0) return toast.error('Cost must be greater than 0');

    toast.loading('Initiating session & dispatching start command...', { id: 'start' });

    try {
      const initRes = await initiatePrepaidSession({
        charger_id: selectedChargerId,
        connector_number: selectedGun,
        mode: prepMode,
        start_soc: prepMode === 'charge_to_full' ? Number(prepStartSoc) : undefined,
        budget_amount: prepMode === 'fixed_budget' ? cost : undefined,
        
        is_guest: activeTab === 'guest',
        driver_id: activeTab === 'registered' ? activeDriverId : undefined,
        vehicle_id: activeTab === 'registered' ? currentVehicle?.id : undefined,
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_plate: guestPlate,
      });

      if (!initRes.success || !initRes.session) throw new Error(initRes.error || 'Failed to create session');

      const sessionId = initRes.session.id;

      const payRes = await processPayment({
        session_id: sessionId,
        shift_id: '',
        amount: cost,
        method: activeTab === 'registered' ? 'wallet' : guestPaymentMethod,
        attendant_id: 'system',
      });

      if (!payRes.success) throw new Error(payRes.error || 'Payment failed');

      setActiveSessionId(sessionId);
      toast.success('Session paid. Remote Start sent to Charger!', { id: 'start' });
    } catch (e: any) {
      toast.error(e.message, { id: 'start' });
    }
  };

  const handleStopCharge = async () => {
    if (!activeSessionId || !liveSession) return;
    toast.loading('Sending Stop command...', { id: 'stop' });
    try {
      await stopSessionWithRefund(activeSessionId, Number(liveSession.units_consumed || 0));
      
      if (activeCharger) {
        await supabase.from('connectors').update({ status: 'Available', current_session_id: null })
          .eq('charge_point_id', activeCharger.chargePointId)
          .eq('connector_number', selectedGun);
      }

      setActiveSessionId(null);
      setLiveSession(null);
      queryClient.invalidateQueries({ queryKey: ['sessions', 'connectors', 'drivers'] });
      toast.success('Charge stopped successfully.', { id: 'stop' });
    } catch (e: any) {
      toast.error(e.message, { id: 'stop' });
    }
  };

  return (
    <div className="w-full animate-fade-in space-y-6">
      
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-black border border-slate-800 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-1">Charge</h1>
          <p className="text-slate-400 text-xs">Live Telemetry & Control</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: SETUP */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Tabs */}
          <div className="flex bg-slate-900/50 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800">
            <button 
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all duration-300 ${activeTab === 'registered' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setActiveTab('registered')}
            >
              Registered
            </button>
            <button 
              className={`flex-1 py-3 text-xs font-black rounded-xl transition-all duration-300 ${activeTab === 'guest' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setActiveTab('guest')}
            >
              Guest
            </button>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-6 space-y-6">
            
            {/* User Info Section */}
            {activeTab === 'registered' ? (
              <div className="space-y-4">
                <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-full border border-blue-500/20 flex items-center justify-center">
                    <User size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-0.5">Driver</div>
                    <div className="text-sm text-white font-bold">{currentDriver ? currentDriver.name : 'Loading profile...'}</div>
                    {currentVehicle && (
                      <div className="text-[10px] text-cyan-400 mt-1">
                        {currentVehicle.brand} {currentVehicle.model} • {currentVehicle.plateNumber}
                      </div>
                    )}
                  </div>
                </div>

                {currentDriver && (
                  <div className="p-5 bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Wallet Balance</div>
                        <div className="text-2xl font-black text-white">GHS {Number(currentDriver.walletBalance || 0).toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">GHS</span>
                        <input type="number" className="w-full bg-black/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500 transition-colors" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} />
                      </div>
                      <button onClick={handleWalletTopUp} className="bg-white text-blue-900 hover:bg-slate-200 text-xs font-bold px-4 rounded-xl transition-colors shadow-lg shadow-white/10">Top Up</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Full Name</label>
                    <input className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="e.g. Kwame Osei" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Phone</label>
                    <input className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="054..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Plate</label>
                    <input className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors" value={guestPlate} onChange={e => setGuestPlate(e.target.value)} placeholder="GR-1234-24" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Capacity (kWh)</label>
                    <input type="number" className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors" value={guestCapacity} onChange={e => setGuestCapacity(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Session Setup */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-6 space-y-6">
            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Zap size={14} className="text-cyan-400"/> Configure Charge
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Charger</label>
                <select className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors appearance-none" value={selectedChargerId} onChange={e => setSelectedChargerId(e.target.value)}>
                  <option value="">-- Select --</option>
                  {chargers?.map(c => <option key={c.id} value={c.id}>{c.chargePointId}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Gun</label>
                <select className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors appearance-none" value={selectedGun} onChange={e => setSelectedGun(Number(e.target.value))}>
                  <option value={1}>Gun 1</option>
                  <option value={2}>Gun 2</option>
                </select>
              </div>
            </div>

            <div className="flex bg-black/30 p-1.5 rounded-2xl border border-slate-800">
              <button onClick={() => setPrepMode('charge_to_full')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${prepMode === 'charge_to_full' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Full Charge</button>
              <button onClick={() => setPrepMode('fixed_budget')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${prepMode === 'fixed_budget' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Fixed Budget</button>
            </div>

            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              {prepMode === 'charge_to_full' ? (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase block">Current Battery</label>
                    <span className="text-sm font-black text-cyan-400">{prepStartSoc}%</span>
                  </div>
                  <input type="range" min="0" max="90" value={prepStartSoc} onChange={e => setPrepStartSoc(e.target.value)} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Budget Amount (GHS)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">GHS</span>
                    <input type="number" value={prepBudgetAmount} onChange={e => setPrepBudgetAmount(e.target.value)} className="w-full bg-black/50 border border-slate-700 rounded-xl py-3 pl-10 pr-3 text-sm font-bold text-white outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'guest' && (
              <div>
                <label className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2 block">Payment Method</label>
                <select className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-white outline-none transition-colors appearance-none" value={guestPaymentMethod} onChange={e => setGuestPaymentMethod(e.target.value)}>
                  <option value="momo">MTN MoMo</option>
                  <option value="telecel">Telecel Cash</option>
                  <option value="tigo">Tigo Cash</option>
                  <option value="cash">Cash to Attendant</option>
                </select>
              </div>
            )}

          </div>
        </div>

        {/* RIGHT COLUMN: STATUS & TELEMETRY */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Pre-flight Check */}
          {!activeSessionId && (
            <div className={`relative overflow-hidden p-8 rounded-3xl border transition-all duration-500 h-[500px] flex flex-col items-center justify-center text-center shadow-2xl ${isGunPluggedIn ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.1)]' : 'bg-slate-900/40 border-slate-800'}`}>
              
              {isGunPluggedIn && (
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent opacity-50"></div>
              )}

              <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
                {isGunPluggedIn ? (
                  <>
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full border border-emerald-500/30 flex items-center justify-center mb-6">
                      <CheckCircle className="text-emerald-400 w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">Gun Connected & Ready</h3>
                    
                    <div className="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl p-5 border border-slate-800 mb-8 mt-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Est. Cost</span>
                        <span className="text-lg font-black text-emerald-400">GHS {getEstimatedCost().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Energy</span>
                        <span className="text-sm font-bold text-white">{getEstimatedUnits().toFixed(2)} kWh</span>
                      </div>
                    </div>

                    <button onClick={handleInitiateCharge} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 transition-all">
                      <Play size={18} /> {activeTab === 'registered' ? 'Start Charge (Deduct)' : 'Pay & Start'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-24 h-24 bg-slate-800/50 rounded-full border border-slate-700 border-dashed flex items-center justify-center mb-6">
                      <ZapOff className="text-slate-500 w-10 h-10" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3">Awaiting Connection</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-8 px-4">
                      Please select a charger and gun from the settings, then physically plug the cable into your vehicle.
                    </p>
                    
                    <div className="w-full bg-black/40 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-400 space-y-3">
                      <div className="flex justify-between items-center">
                        <span>Target:</span> 
                        <span className="text-white font-sans font-bold bg-slate-800 px-2 py-1 rounded">{activeCharger?.chargePointId || 'None'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Interface:</span> 
                        <span className="text-white font-sans font-bold bg-slate-800 px-2 py-1 rounded">Gun {selectedGun}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-800 pt-3">
                        <span>Status:</span> 
                        <span className="text-amber-400 font-sans font-bold flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          {activeConnector?.status || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Active Session Telemetry */}
          {activeSessionId && liveSession && (
            <div className="relative overflow-hidden p-8 rounded-3xl bg-[#0a0a0a] border border-slate-800 flex flex-col items-center justify-center text-center shadow-2xl h-[500px]">
              
              {/* Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px]"></div>

              <div className="absolute top-5 left-6 right-6 flex justify-between items-center z-10">
                <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                  {liveSession.receipt_number}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-500/20 backdrop-blur-md">
                  <Signal size={12} className="animate-pulse" /> LIVE
                </span>
              </div>

              <div className="relative z-10 flex flex-col items-center justify-center w-full mt-4">
                {isCharging ? (
                   <div className="relative w-56 h-56 flex items-center justify-center mb-8">
                      {/* Outer spinning ring */}
                      <div className="absolute inset-0 rounded-full border border-slate-800" />
                      <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-cyan-400 border-r-blue-500 animate-[spin_3s_linear_infinite]" />
                      
                      {/* Inner pulsing ring */}
                      <div className="absolute inset-4 rounded-full bg-cyan-500/5 border border-cyan-500/20 animate-pulse" />

                      <div className="text-center space-y-2 z-10 flex flex-col items-center">
                        <BatteryCharging className="text-cyan-400 mb-1" size={24} />
                        <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 leading-none">
                          {Number(liveSession.units_consumed || 0).toFixed(2)}
                        </div>
                        <span className="text-[10px] font-black text-cyan-500/70 uppercase tracking-widest block">kWh Delivered</span>
                      </div>
                   </div>
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center flex-col space-y-6 rounded-full border border-slate-800 mb-8 bg-slate-900/50">
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                      <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin relative z-10"></div>
                    </div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Handshake...</span>
                  </div>
                )}

                <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-md p-5 rounded-2xl border border-slate-800 text-left space-y-4 shadow-xl mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Budget Limit</span> 
                    <strong className="text-sm text-white font-mono">GHS {Number(liveSession.prepaid_amount || 0).toFixed(2)}</strong>
                  </div>
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Cost</span> 
                    <strong className="text-lg font-black text-cyan-400 font-mono">GHS {Number(liveSession.total_amount || 0).toFixed(2)}</strong>
                  </div>
                </div>

                <button onClick={handleStopCharge} className="w-full max-w-sm py-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 transition-all group">
                  <Square size={14} className="group-hover:scale-90 transition-transform" /> Terminate Session
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
