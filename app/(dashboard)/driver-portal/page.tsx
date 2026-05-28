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
import { initiatePrepaidSession, processPayment, stopSessionWithRefund } from '@/app/actions/sessions';
import { supabase } from '@/lib/supabase';
import { 
  Smartphone, User, Zap, CreditCard, Play, Square, 
  BatteryCharging, Wallet, UserPlus, Info, Clock, 
  Signal, ShieldCheck, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function DriverPortalPage() {
  const queryClient = useQueryClient();

  // Data Hooks
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: chargers } = useChargers();
  const { data: connectors } = useConnectors();

  // Top level tab
  const [activeTab, setActiveTab] = useState<'registered'|'guest'>('registered');

  // Registered State
  const [activeDriverId, setActiveDriverId] = useState<string>('');
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

    try {
      const newBal = Number(currentDriver.walletBalance || 0) + amount;
      await supabase.from('drivers').update({ wallet_balance: newBal }).eq('id', activeDriverId);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success(`Wallet topped up by GHS ${amount}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleInitiateCharge = async () => {
    if (!selectedChargerId) return toast.error('Please select a charger');
    if (!isGunPluggedIn) return toast.error('Please plug the gun into the vehicle first');

    const cost = getEstimatedCost();
    if (cost <= 0) return toast.error('Cost must be greater than 0');

    toast.loading('Initiating session & dispatching start command...', { id: 'start' });

    try {
      // 1. Create Session
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

      // 2. Process Payment (Wallet for registered, Manual for guest)
      const payRes = await processPayment({
        session_id: sessionId,
        shift_id: '', // Empty since it's app driven, not attendant driven
        amount: cost,
        method: activeTab === 'registered' ? 'wallet' : guestPaymentMethod,
        attendant_id: 'system', // or the authenticated user's ID
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
      // If we had automated stopping over OCPP, we would send a RemoteStopTransaction here.
      // But we also need to refund via stopSessionWithRefund.
      // For now, in a physical setup, we can just trigger stopSessionWithRefund. 
      // In a real physical setup, we'd also send RemoteStopTransaction.
      await stopSessionWithRefund(activeSessionId, Number(liveSession.units_consumed || 0));
      
      // Also manually reset connector status if gateway doesn't do it instantly
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
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc]">
      <TopBar title="Driver Portal" subtitle="Live App-Driven Charging" />

      <div className="p-6 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: SETUP */}
        <div className="space-y-6">
          <div className="flex bg-[#1e293b] p-1 rounded-xl">
            <button 
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${activeTab === 'registered' ? 'bg-[#3b82f6] text-white' : 'text-[#94a3b8]'}`}
              onClick={() => setActiveTab('registered')}
            >Registered Driver</button>
            <button 
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${activeTab === 'guest' ? 'bg-[#3b82f6] text-white' : 'text-[#94a3b8]'}`}
              onClick={() => setActiveTab('guest')}
            >Guest Quick Charge</button>
          </div>

          <div className="stat-card bg-[#1e293b] border-[#334155] p-5 space-y-4">
            {activeTab === 'registered' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-[#94a3b8] font-bold">SELECT DRIVER</label>
                  <select 
                    className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white"
                    value={activeDriverId} onChange={e => setActiveDriverId(e.target.value)}
                  >
                    <option value="">-- Choose Profile --</option>
                    {drivers?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                {currentDriver && (
                  <div className="p-3 bg-gradient-to-r from-blue-900/20 to-transparent border border-blue-900/50 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Wallet Balance</div>
                      <div className="text-xl font-black">GHS {Number(currentDriver.walletBalance || 0).toFixed(2)}</div>
                    </div>
                    <div className="flex gap-2">
                      <input type="number" className="w-16 bg-[#090d16] border border-[#334155] rounded px-2 text-xs text-white" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} />
                      <button onClick={handleWalletTopUp} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 rounded">Top Up</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#94a3b8] font-bold">FULL NAME</label>
                    <input className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="e.g. Kwame Osei" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#94a3b8] font-bold">PHONE</label>
                    <input className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="054..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#94a3b8] font-bold">PLATE NUMBER</label>
                    <input className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={guestPlate} onChange={e => setGuestPlate(e.target.value)} placeholder="GR-1234-24" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#94a3b8] font-bold">BATTERY CAPACITY (kWh)</label>
                    <input type="number" className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={guestCapacity} onChange={e => setGuestCapacity(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="stat-card bg-[#1e293b] border-[#334155] p-5 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Session Setup</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">SELECT CHARGER</label>
                <select className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={selectedChargerId} onChange={e => setSelectedChargerId(e.target.value)}>
                  <option value="">-- Select --</option>
                  {chargers?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">SELECT GUN</label>
                <select className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={selectedGun} onChange={e => setSelectedGun(Number(e.target.value))}>
                  <option value={1}>Gun 1</option>
                  <option value={2}>Gun 2</option>
                </select>
              </div>
            </div>

            <div className="flex bg-[#0f172a] p-1 rounded-md">
              <button onClick={() => setPrepMode('charge_to_full')} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${prepMode === 'charge_to_full' ? 'bg-[#334155] text-white' : 'text-[#94a3b8]'}`}>Charge to Full</button>
              <button onClick={() => setPrepMode('fixed_budget')} className={`flex-1 py-1.5 text-[10px] font-bold rounded ${prepMode === 'fixed_budget' ? 'bg-[#334155] text-white' : 'text-[#94a3b8]'}`}>Fixed Budget</button>
            </div>

            {prepMode === 'charge_to_full' ? (
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">CURRENT BATTERY SOC: {prepStartSoc}%</label>
                <input type="range" min="0" max="90" value={prepStartSoc} onChange={e => setPrepStartSoc(e.target.value)} className="w-full accent-blue-500" />
              </div>
            ) : (
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">BUDGET AMOUNT (GHS)</label>
                <input type="number" value={prepBudgetAmount} onChange={e => setPrepBudgetAmount(e.target.value)} className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" />
              </div>
            )}

            {activeTab === 'guest' && (
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">PAYMENT METHOD</label>
                <select className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-xs text-white" value={guestPaymentMethod} onChange={e => setGuestPaymentMethod(e.target.value)}>
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
        <div className="space-y-6">
          
          {/* Pre-flight Check */}
          {!activeSessionId && (
            <div className={`p-6 rounded-2xl border ${isGunPluggedIn ? 'bg-green-900/20 border-green-500/50' : 'bg-[#1e293b] border-[#334155]'} flex flex-col items-center justify-center text-center space-y-4 h-64`}>
              {isGunPluggedIn ? (
                <>
                  <CheckCircle className="text-green-400 w-12 h-12 mb-2" />
                  <h3 className="text-lg font-bold text-white">✅ Gun Connected Successfully and Ready</h3>
                  <div className="text-xs text-green-200 bg-green-900/40 px-3 py-1.5 rounded-lg border border-green-500/30">
                    Est. Cost: <strong>GHS {getEstimatedCost().toFixed(2)}</strong> ({getEstimatedUnits().toFixed(2)} kWh)
                  </div>
                  <button onClick={handleInitiateCharge} className="w-full max-w-xs mt-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
                    <Play size={16} /> {activeTab === 'registered' ? 'Start Charge (Deduct Wallet)' : 'Confirm Payment & Start'}
                  </button>
                </>
              ) : (
                <>
                  <ShieldCheck className="text-[#475569] w-12 h-12 mb-2" />
                  <h3 className="text-sm font-bold text-white">Waiting for connection...</h3>
                  <p className="text-xs text-[#94a3b8]">Select a charger and gun, then physically plug the cable into your vehicle. The system will detect it instantly.</p>
                  <div className="w-full max-w-xs p-3 mt-4 bg-[#0f172a] border border-[#334155] rounded-lg text-xs font-mono text-[#94a3b8] space-y-1">
                    <div className="flex justify-between"><span>Selected Charger:</span> <span className="text-white">{activeCharger?.name || 'None'}</span></div>
                    <div className="flex justify-between"><span>Selected Gun:</span> <span className="text-white">Gun {selectedGun}</span></div>
                    <div className="flex justify-between"><span>Status:</span> <span className="text-yellow-400">{activeConnector?.status || 'Unknown'}</span></div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Active Session Telemetry */}
          {activeSessionId && liveSession && (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#080b12] border border-[#1e293b] flex flex-col items-center justify-center text-center space-y-6 shadow-2xl relative overflow-hidden h-[500px]">
              
              <div className="absolute top-4 left-4 right-4 flex justify-between items-center text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest">
                <span>{liveSession.receipt_number}</span>
                <span className="flex items-center gap-1"><Signal size={12} className="text-green-400" /> LIVE</span>
              </div>

              {isCharging ? (
                 <div className="relative w-48 h-48 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-cyan-500/10" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 animate-spin" />
                    <div className="text-center space-y-1 z-10">
                      <BatteryCharging className="text-[#06b6d4] mx-auto animate-pulse" size={28} />
                      <div className="text-3xl font-black text-white leading-none">
                        {Number(liveSession.units_consumed || 0).toFixed(2)}
                      </div>
                      <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider block">kWh Consumed</span>
                    </div>
                 </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center flex-col space-y-4 rounded-full border-4 border-[#334155] border-dashed">
                  <div className="animate-pulse w-8 h-8 rounded-full bg-blue-500/20" />
                  <span className="text-xs text-[#94a3b8]">Initializing Charge...</span>
                </div>
              )}

              <div className="w-full bg-[#1e293b]/50 p-4 rounded-xl border border-[#334155] text-left text-xs text-[#94a3b8] space-y-2 backdrop-blur-sm">
                <div className="flex justify-between"><span>Prepaid Amount:</span> <strong className="text-white">GHS {Number(liveSession.prepaid_amount || 0).toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Current Cost:</span> <strong className="text-cyan-400">GHS {Number(liveSession.total_amount || 0).toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Target kWh limit:</span> <strong className="text-white">{Number(liveSession.target_units || 0).toFixed(2)}</strong></div>
              </div>

              <button onClick={handleStopCharge} className="w-full py-3 bg-red-900/50 hover:bg-red-900/80 border border-red-500/30 text-red-200 font-bold rounded-xl flex items-center justify-center gap-2 transition-all">
                <Square size={14} /> Stop Charging
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
