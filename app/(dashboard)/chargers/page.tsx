'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { 
  useChargers, 
  useConnectors, 
  useOcppLogs, 
  useSettings, 
  useDrivers, 
  useVehicles, 
  useSessions 
} from '@/hooks/use-database';
import { 
  addCharger, 
  deleteCharger, 
  sendOcppCommand, 
  clearOcppLogs 
} from '@/app/actions/chargers';
import { saveSettings } from '@/app/actions/settings';
import { initiatePrepaidSession, stopSessionWithRefund } from '@/app/actions/sessions';
import { supabase } from '@/lib/supabase';
import { 
  Zap, 
  Settings, 
  RefreshCw, 
  Play, 
  Square, 
  Unlock, 
  Power, 
  Terminal, 
  Plus, 
  Trash2, 
  Signal, 
  AlertCircle, 
  BatteryCharging, 
  CreditCard,
  CheckCircle,
  HelpCircle,
  Cpu,
  Monitor,
  User,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

export default function ChargersPage() {
  const queryClient = useQueryClient();

  // DB Hooks
  const { data: chargers, isLoading: chargersLoading } = useChargers();
  const { data: connectors, isLoading: connectorsLoading } = useConnectors();
  const { data: ocppLogs } = useOcppLogs();
  const { data: settingsRow } = useSettings();
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const { data: sessions } = useSessions({ limit: 10 });

  // UI States
  const [activeChargerId, setActiveChargerId] = useState<string | null>(null);
  const [showAddChargerModal, setShowAddChargerModal] = useState(false);
  const [newCharger, setNewCharger] = useState({
    charge_point_id: '',
    name: '',
    vendor: '',
    model: '',
    serial_number: '',
    location: '',
  });

  // Simulator Inputs
  const [simSelectedDriverId, setSimSelectedDriverId] = useState('');
  const [simStartingBatteryPercent, setSimStartingBatteryPercent] = useState('20');
  const [simPrepaidBudget, setSimPrepaidBudget] = useState('50');
  const [simChargingMode, setSimChargingMode] = useState<'charge_to_full' | 'fixed_budget'>('charge_to_full');
  const [simSelectedRfidTag, setSimSelectedRfidTag] = useState('');
  const [simMeterIncrement, setSimMeterIncrement] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive connection state
  const isActiveOcpp = settingsRow?.ocpp_mode ?? false;

  // Sync RFID tag selection with selected driver
  useEffect(() => {
    if (simSelectedDriverId) {
      // Create a mock RFID tag based on driver initials and phone last digits
      const drv = drivers?.find(d => d.id === simSelectedDriverId);
      if (drv) {
        const initials = drv.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const lastDigits = drv.phone?.slice(-4) || '7788';
        setSimSelectedRfidTag(`RFID-${initials}-${lastDigits}`);
      }
    }
  }, [simSelectedDriverId, drivers]);

  // Set default active charger
  useEffect(() => {
    if (chargers && chargers.length > 0 && !activeChargerId) {
      setActiveChargerId(chargers[0].chargePointId);
    }
  }, [chargers, activeChargerId]);

  const activeCharger = chargers?.find(c => c.chargePointId === activeChargerId);
  const activeChargerConnectors = connectors?.filter(cn => cn.chargerId === activeCharger?.id) || [];

  // Toggle connection mode
  const handleToggleOcppMode = async (enabled: boolean) => {
    try {
      const res = await saveSettings({ ocpp_mode: enabled });
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        toast.success(`System mode updated to: ${enabled ? 'Active OCPP (Production)' : 'Standalone Sandbox (Simulation)'}`);
      } else {
        toast.error(res.error || 'Failed to update system mode');
      }
    } catch (e: any) {
      toast.error('Unexpected error toggling mode: ' + e.message);
    }
  };

  // Add Charger Action
  const handleAddChargerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharger.charge_point_id || !newCharger.name) {
      toast.error('Charge Point ID and Name are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addCharger(newCharger);
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['chargers'] });
        toast.success('Charger successfully added to central inventory!');
        setNewCharger({
          charge_point_id: '',
          name: '',
          vendor: '',
          model: '',
          serial_number: '',
          location: '',
        });
        setShowAddChargerModal(false);
      } else {
        toast.error(res.error || 'Failed to add charger');
      }
    } catch (err: any) {
      toast.error('Error adding charger: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Charger Action
  const handleDeleteCharger = async (id: string) => {
    if (!confirm('Are you sure you want to completely decommission and delete this charger? All linked connector records will be deleted.')) {
      return;
    }

    try {
      const res = await deleteCharger(id);
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['chargers'] });
        toast.success('Charger decommissioned successfully.');
        setActiveChargerId(null);
      } else {
        toast.error(res.error || 'Failed to delete charger');
      }
    } catch (err: any) {
      toast.error('Error deleting charger: ' + err.message);
    }
  };

  // Send Remote Commands (Standard OCPP commands via queue)
  const handleOcppCommandSend = async (command: string, payload: any = {}) => {
    if (!activeChargerId) {
      toast.error('No active charger selected');
      return;
    }

    const commandPromise = sendOcppCommand({
      chargePointId: activeChargerId,
      command,
      payload
    });

    toast.promise(commandPromise, {
      loading: `Queuing remote ${command} command...`,
      success: (data) => {
        queryClient.invalidateQueries({ queryKey: ['ocpp_logs'] });
        return `${command} remote trigger queued successfully!`;
      },
      error: 'Failed to send remote command.'
    });
  };

  // Clear OCPP Logs Action
  const handleClearLogs = async () => {
    try {
      const res = await clearOcppLogs(activeChargerId || undefined);
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['ocpp_logs'] });
        toast.success('Terminal diagnostics cleared');
      } else {
        toast.error(res.error || 'Failed to clear logs');
      }
    } catch (err: any) {
      toast.error('Error clearing logs: ' + err.message);
    }
  };

  // ===========================================================================
  // MOCK SANDBOX SIMULATOR EVENT ACTIONS (Saves database logs and mocks values)
  // ===========================================================================
  
  // Inserts a mock OCPP log row
  const logSimPacket = async (direction: 'IN' | 'OUT', action: string, payload: any) => {
    if (!activeChargerId) return;
    await supabase.from('ocpp_logs').insert([{
      charge_point_id: activeChargerId,
      direction,
      message_type: action,
      payload
    }]);
    queryClient.invalidateQueries({ queryKey: ['ocpp_logs'] });
  };

  // 1. Sim: Boot Notification
  const simBootNotification = async () => {
    if (!activeCharger || !activeChargerId) return;
    
    toast.loading('Sending BootNotification packet...', { id: 'sim-boot' });
    try {
      await logSimPacket('IN', 'BootNotification', {
        chargePointVendor: activeCharger.vendor || 'SPERO EV',
        chargePointModel: activeCharger.model || 'SPERO-AC-022',
        chargePointSerialNumber: activeCharger.serialNumber || 'SN-1002883',
        firmwareVersion: 'v1.6.4-beta'
      });

      // Update charger online in DB
      await supabase.from('chargers').update({
        status: 'online',
        last_heartbeat: new Date().toISOString()
      }).eq('id', activeCharger.id);

      // Respond
      await logSimPacket('OUT', 'CallResult', {
        status: 'Accepted',
        currentTime: new Date().toISOString(),
        interval: 60
      });

      queryClient.invalidateQueries({ queryKey: ['chargers'] });
      toast.success('Charger booted successfully! Status is now ONLINE.', { id: 'sim-boot' });
    } catch (err: any) {
      toast.error('Simulator error: ' + err.message, { id: 'sim-boot' });
    }
  };

  // 2. Sim: Send Heartbeat
  const simHeartbeat = async () => {
    if (!activeCharger || !activeChargerId) return;

    try {
      await logSimPacket('IN', 'Heartbeat', {});
      await supabase.from('chargers').update({
        status: 'online',
        last_heartbeat: new Date().toISOString()
      }).eq('id', activeCharger.id);

      await logSimPacket('OUT', 'CallResult', {
        currentTime: new Date().toISOString()
      });

      queryClient.invalidateQueries({ queryKey: ['chargers'] });
      toast.success('Heartbeat acknowledged.');
    } catch (err: any) {
      toast.error('Simulator error: ' + err.message);
    }
  };

  // 3. Sim: Status Notification (Plug / Unplug / Fault)
  const simStatusNotification = async (connectorNumber: number, status: string) => {
    if (!activeCharger || !activeChargerId) return;

    try {
      await logSimPacket('IN', 'StatusNotification', {
        connectorId: connectorNumber,
        errorCode: 'NoError',
        status: status,
        info: 'Manual simulation override'
      });

      await supabase.from('connectors').update({
        status: status,
        last_status_notification: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('charger_id', activeCharger.id).eq('connector_number', connectorNumber);

      await logSimPacket('OUT', 'CallResult', {});

      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      toast.success(`Connector #${connectorNumber} status updated to: ${status}`);
    } catch (err: any) {
      toast.error('Simulator error: ' + err.message);
    }
  };

  // 4. Sim: Complete Flow (Start Charging / Plug RFID)
  const simStartChargingFlow = async (connectorNumber: number) => {
    if (!activeCharger || !activeChargerId) return;
    if (!simSelectedDriverId) {
      toast.error('Please select a driver from the simulation toolbar to start charging!');
      return;
    }

    const driver = drivers?.find(d => d.id === simSelectedDriverId);
    const vehicle = vehicles?.find(v => v.driverId === simSelectedDriverId) || vehicles?.[0];
    
    if (!driver) {
      toast.error('Driver not found');
      return;
    }

    toast.loading('Starting Simulated Billing & StartTransaction...', { id: 'sim-flow' });

    try {
      // A. RFID Auth Packet
      await logSimPacket('IN', 'Authorize', { idTag: simSelectedRfidTag });
      const balance = Number(driver.walletBalance || 0);
      const isCorporate = driver.type === 'corporate';

      if (!isCorporate && balance <= 0.50) {
        await logSimPacket('OUT', 'CallResult', { idTagInfo: { status: 'Blocked', expiryDate: new Date().toISOString() } });
        toast.error(`Auth Blocked: Driver wallet balance is GHS ${balance.toFixed(2)}. Top up required!`, { id: 'sim-flow' });
        return;
      }

      await logSimPacket('OUT', 'CallResult', { idTagInfo: { status: 'Accepted' } });

      // B. Check if prepaid session is already created and PAID (Option A or Option B),
      // if not, simulate manual postpaid session activation.
      let targetSession = sessions?.find(
        s => s.driverId === driver.id && 
        s.status === 'pending_payment' && 
        s.paymentStatus === 'paid'
      );

      if (!targetSession) {
        toast.loading('No prepaid/paid session found. Initializing ad-hoc Postpaid session...', { id: 'sim-flow' });
        
        // Let's create an ad-hoc session
        const ratePerKwh = 5.50;
        const receiptNumber = `RCP-${Math.floor(100000 + Math.random() * 900000)}`;
        
        const { data: newSess, error: sessErr } = await supabase.from('sessions').insert([{
          receipt_number: receiptNumber,
          driver_id: driver.id,
          driver_name: driver.name,
          vehicle_id: vehicle?.id || null,
          vehicle_plate: vehicle?.plateNumber || 'MOCK-PLT',
          vehicle_details: vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Mock Tesla Model Y',
          mode: 'postpaid',
          status: 'pending_payment',
          unit_type: 'kwh',
          rate_at_time: ratePerKwh,
          start_time: new Date().toISOString(),
          charger_id: activeCharger.id,
          connector_number: connectorNumber
        }]).select().single();

        if (sessErr || !newSess) throw new Error('Adhoc session insert failed: ' + sessErr?.message);
        targetSession = {
          id: newSess.id,
          receiptNumber: newSess.receipt_number,
          driverId: newSess.driver_id,
          driverName: newSess.driver_name,
          prepaidAmount: newSess.prepaid_amount,
          targetUnits: newSess.target_units,
          rateAtTime: newSess.rate_at_time
        };
      }

      // C. Send StartTransaction OCPP Packet
      const transactionId = Math.floor(100000 + Math.random() * 900000);
      await logSimPacket('IN', 'StartTransaction', {
        connectorId: connectorNumber,
        idTag: simSelectedRfidTag,
        meterStart: 1024,
        timestamp: new Date().toISOString()
      });

      // Update Database records
      await supabase.from('sessions').update({
        status: 'active',
        start_time: new Date().toISOString(),
        charger_id: activeCharger.id,
        connector_number: connectorNumber
      }).eq('id', targetSession.id);

      await supabase.from('connectors').update({
        status: 'Charging',
        current_session_id: targetSession.id,
        updated_at: new Date().toISOString()
      }).eq('charger_id', activeCharger.id).eq('connector_number', connectorNumber);

      await logSimPacket('OUT', 'CallResult', {
        transactionId: transactionId,
        idTagInfo: { status: 'Accepted' }
      });

      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(`Transaction started! TxID: ${transactionId}. Connector #${connectorNumber} is now CHARGING.`, { id: 'sim-flow' });
    } catch (err: any) {
      toast.error('Simulator flow error: ' + err.message, { id: 'sim-flow' });
    }
  };

  // 5. Sim: Stream Meter Readings / Energy Increment
  const simIncrementMeter = async (connectorNumber: number) => {
    if (!activeCharger) return;
    const connector = connectors?.find(cn => cn.chargerId === activeCharger.id && cn.connectorNumber === connectorNumber);
    if (!connector || !connector.currentSessionId) {
      toast.error('No active charging session on this connector to increment metering!');
      return;
    }

    toast.loading('Streaming MeterValues OCPP packet...', { id: 'sim-meter' });
    try {
      const { data: session } = await supabase.from('sessions').select('*').eq('id', connector.currentSessionId).single();
      if (!session) throw new Error('Session not found in DB');

      const increment = Number(simMeterIncrement);
      const newUnits = Number(session.units_consumed || 0) + increment;
      const rateAtTime = Number(session.rate_at_time || 5.50);
      const newAmount = newUnits * rateAtTime;

      // OCPP Meter Value Packet
      await logSimPacket('IN', 'MeterValues', {
        connectorId: connectorNumber,
        transactionId: 100028,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [{
            value: (newUnits * 1000 + 1024).toString(), // Convert kWh to Wh
            context: 'Sample.Periodic',
            format: 'Raw',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh'
          }]
        }]
      });

      // Update Db
      await supabase.from('sessions').update({
        units_consumed: newUnits,
        total_amount: newAmount
      }).eq('id', session.id);

      // Check for automatic limit cutoff!
      const targetUnits = Number(session.target_units || 0);
      if (targetUnits > 0 && newUnits >= targetUnits) {
        toast.info(`LIMIT EXCEEDED: Consumed ${newUnits.toFixed(2)} kWh / Limit ${targetUnits.toFixed(2)} kWh. Remote shutting down connector...`, { id: 'sim-meter' });
        
        // Remotely close session and issue refund
        await stopSessionWithRefund(session.id, targetUnits);
        
        // Reset connector status
        await supabase.from('connectors').update({
          status: 'Available',
          current_session_id: null,
          updated_at: new Date().toISOString()
        }).eq('charger_id', activeCharger.id).eq('connector_number', connectorNumber);

        await logSimPacket('IN', 'StopTransaction', {
          connectorId: connectorNumber,
          transactionId: 100028,
          meterStop: targetUnits * 1000 + 1024,
          timestamp: new Date().toISOString(),
          reason: 'EVSE'
        });

        toast.success(`Successfully stopped at exact limit! Refund credited back to driver wallet.`, { id: 'sim-meter' });
      } else {
        toast.success(`Simulated meter added: +${increment} kWh. Total: ${newUnits.toFixed(2)} kWh.`, { id: 'sim-meter' });
      }

      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (err: any) {
      toast.error('Simulator meter error: ' + err.message, { id: 'sim-meter' });
    }
  };

  // 6. Sim: Remote/Manual Stop Charge
  const simStopChargingFlow = async (connectorNumber: number) => {
    if (!activeCharger) return;
    const connector = connectors?.find(cn => cn.chargerId === activeCharger.id && cn.connectorNumber === connectorNumber);
    if (!connector || !connector.currentSessionId) {
      toast.error('No active transaction to stop!');
      return;
    }

    toast.loading('Stopping session and issuing refunds...', { id: 'sim-stop' });
    try {
      const { data: session } = await supabase.from('sessions').select('*').eq('id', connector.currentSessionId).single();
      if (!session) throw new Error('Session not found in DB');

      const finalKwh = Number(session.units_consumed || 0);

      // StopTransaction packet
      await logSimPacket('IN', 'StopTransaction', {
        connectorId: connectorNumber,
        transactionId: 100028,
        meterStop: finalKwh * 1000 + 1024,
        timestamp: new Date().toISOString(),
        reason: 'Local'
      });

      // Fire server-side stop-with-refund action
      const res = await stopSessionWithRefund(session.id, finalKwh);

      // Reset connector
      await supabase.from('connectors').update({
        status: 'Available',
        current_session_id: null,
        updated_at: new Date().toISOString()
      }).eq('charger_id', activeCharger.id).eq('connector_number', connectorNumber);

      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['drivers'] });

      if (res.success && (res.refundAmount || 0) > 0.01) {
        toast.success(`Transaction Stopped! Final energy: ${finalKwh.toFixed(2)} kWh. Wallet credited GHS ${res.refundAmount?.toFixed(2)} refund!`, { id: 'sim-stop' });
      } else {
        toast.success(`Transaction Stopped successfully! Final energy: ${finalKwh.toFixed(2)} kWh.`, { id: 'sim-stop' });
      }
    } catch (err: any) {
      toast.error('Simulator stop error: ' + err.message, { id: 'sim-stop' });
    }
  };

  // Mock Prepayment Helper for Attendants in Sandbox Mode
  const handleCreateMockPrepaidSession = async () => {
    if (!simSelectedDriverId) {
      toast.error('Select a driver for prepayment setup');
      return;
    }

    const vehicle = vehicles?.find(v => v.driverId === simSelectedDriverId) || vehicles?.[0];
    if (!vehicle) {
      toast.error('Selected driver does not have a vehicle linked in the database');
      return;
    }

    toast.loading('Creating prepaid session...', { id: 'prep-sim' });
    try {
      const res = await initiatePrepaidSession({
        driver_id: simSelectedDriverId,
        vehicle_id: vehicle.id,
        mode: simChargingMode,
        start_soc: Number(simStartingBatteryPercent),
        budget_amount: Number(simPrepaidBudget),
      });

      if (res.success && res.session) {
        // Simulate immediate Hubtel callback success in sandbox mode
        await supabase.from('sessions')
          .update({ payment_status: 'paid' })
          .eq('id', res.session.id);

        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        toast.success(`Prepaid session registered as PAID! Total GHS ${Number(res.session.prepaid_amount).toFixed(2)} paid. Press "Start Charge" RFID trigger to plug gun.`, { id: 'prep-sim' });
      } else {
        toast.error(res.error || 'Prepaid initiation failed', { id: 'prep-sim' });
      }
    } catch (err: any) {
      toast.error(err.message, { id: 'prep-sim' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc]">
      <TopBar 
        title="Central OCPP Chargers Console" 
        subtitle="Live monitor for EVSE terminals, telemetry logs, and remote operations" 
      />

      <div className="p-6 space-y-6">
        {/* =====================================================================
            TOP BAR CONFIGURATION PANELS
            ===================================================================== */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Mode Switch Card */}
          <div className="stat-card bg-[#1e293b] border-[#334155] xl:col-span-2">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cpu className="text-[#3b82f6]" size={20} />
                  <h3 className="font-bold text-base text-white">Central System Connection Mode</h3>
                </div>
                <p className="text-xs text-[#94a3b8]">
                  {isActiveOcpp 
                    ? 'Active OCPP Mode: Listening for live WebSocket connections from physical charging machines on port 8080.'
                    : 'Standalone Sandbox Mode: Hardware sockets are simulated. Perform end-to-end payments and automated cut-offs offline.'}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-[#0f172a] p-1.5 rounded-xl border border-[#334155]">
                <button 
                  onClick={() => handleToggleOcppMode(false)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    !isActiveOcpp 
                      ? 'bg-[#3b82f6] text-white shadow-md' 
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <Monitor size={14} /> Standalone Sandbox
                </button>
                <button 
                  onClick={() => handleToggleOcppMode(true)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isActiveOcpp 
                      ? 'bg-[#10b981] text-white shadow-md' 
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  <Activity size={14} /> Active OCPP
                </button>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="stat-card bg-[#1e293b] border-[#334155] flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">Gateway Sockets</span>
                <h4 className="text-2xl font-black text-white mt-1">
                  {chargers?.filter(c => c.status === 'online').length || 0} <span className="text-xs font-normal text-[#94a3b8]">/ {chargers?.length || 0} active</span>
                </h4>
              </div>
              <button 
                onClick={() => setShowAddChargerModal(true)}
                className="btn btn-primary btn-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Station
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================================
            SANDBOX SIMULATOR TOOLBAR
            ===================================================================== */}
        {!isActiveOcpp && (
          <div className="stat-card bg-gradient-to-r from-[#1e293b] to-[#0f172a] border-[#3b82f6] border-2 shadow-lg shadow-blue-500/10">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#334155]">
              <Cpu className="text-[#3b82f6] animate-pulse" size={18} />
              <span className="text-xs font-bold uppercase tracking-wider text-[#3b82f6]">Offline Charger Simulator (Prepayment Sandbox)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="form-label text-[#94a3b8] text-[10px]">1. SELECT SIMULATED DRIVER</label>
                <select 
                  className="form-select bg-[#0f172a] border-[#334155] text-white text-xs"
                  value={simSelectedDriverId}
                  onChange={(e) => setSimSelectedDriverId(e.target.value)}
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers?.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Wallet: GHS {Number(d.walletBalance || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label text-[#94a3b8] text-[10px]">2. SIMULATE CHARGING MODE</label>
                <select 
                  className="form-select bg-[#0f172a] border-[#334155] text-white text-xs"
                  value={simChargingMode}
                  onChange={(e) => setSimChargingMode(e.target.value as any)}
                >
                  <option value="charge_to_full">Charge to 100% Full</option>
                  <option value="fixed_budget">Fixed Budget (GHS Limit)</option>
                </select>
              </div>

              {simChargingMode === 'charge_to_full' ? (
                <div>
                  <label className="form-label text-[#94a3b8] text-[10px]">START BATTERY (%)</label>
                  <input 
                    type="number" 
                    className="form-input bg-[#0f172a] border-[#334155] text-white text-xs font-bold"
                    placeholder="e.g. 20"
                    value={simStartingBatteryPercent}
                    onChange={(e) => setSimStartingBatteryPercent(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <label className="form-label text-[#94a3b8] text-[10px]">BUDGET AMOUNT (GHS)</label>
                  <input 
                    type="number" 
                    className="form-input bg-[#0f172a] border-[#334155] text-white text-xs font-bold"
                    placeholder="e.g. 50"
                    value={simPrepaidBudget}
                    onChange={(e) => setSimPrepaidBudget(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  onClick={handleCreateMockPrepaidSession}
                  className="btn btn-primary btn-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold w-full h-9 flex justify-center items-center gap-1.5"
                >
                  <CreditCard size={14} /> Buy Prepaid (GHS)
                </button>
              </div>
            </div>

            {simSelectedDriverId && (
              <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-[#0f172a]/50 text-xs text-[#94a3b8]">
                <span><strong>Simulated RFID Auth Tag:</strong> <code className="text-[#3b82f6] bg-[#1e293b] px-1.5 py-0.5 rounded font-mono font-bold">{simSelectedRfidTag}</code></span>
                <span>Select a charger below to plug in the RFID tag.</span>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            MAIN CONTENT SPLIT GRID
            ===================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CHARGER MANAGEMENT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Charger Selection Sidebar */}
            <div className="stat-card bg-[#1e293b] border-[#334155]">
              <h3 className="font-bold text-base text-white mb-4 flex items-center gap-2">
                <Zap className="text-yellow-400" size={18} /> Available Charge Points ({chargers?.length || 0})
              </h3>

              {chargersLoading ? (
                <div className="py-8 text-center text-xs text-[#94a3b8]">Loading charge points...</div>
              ) : chargers?.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#94a3b8] border-2 border-dashed border-[#334155] rounded-xl">
                  No chargers registered yet. Click "Add Station" to create one.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {chargers?.map(charger => {
                    const isOnline = charger.status === 'online';
                    const activeSelect = activeChargerId === charger.chargePointId;
                    
                    return (
                      <button
                        key={charger.id}
                        onClick={() => setActiveChargerId(charger.chargePointId)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          activeSelect 
                            ? 'bg-[#1e3a8a]/20 border-[#3b82f6] border-2 shadow-md' 
                            : 'bg-[#0f172a]/40 border-[#334155] hover:border-[#475569]'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-sm text-white">{charger.name}</span>
                          <span className={`badge ${
                            charger.status === 'online' ? 'status-active' : 'status-cancelled'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              charger.status === 'online' ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                            } ${charger.status === 'online' ? 'animate-ping' : ''}`} />
                            {charger.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] font-mono mb-2 block">
                          CPID: {charger.chargePointId}
                        </div>
                        <div className="text-xs text-[#94a3b8] truncate">
                          📍 {charger.location || 'Not Configured'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Charger Operations & Telemetry Console */}
            {activeCharger ? (
              <div className="stat-card bg-[#1e293b] border-[#334155] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#334155] gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-white">{activeCharger.name}</h3>
                    <p className="text-xs text-[#94a3b8]">
                      Vendor: <strong className="text-white">{activeCharger.vendor || 'SPERO'}</strong> | Model: <strong className="text-white">{activeCharger.model || 'Standard EVSE'}</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleOcppCommandSend('Reset', { type: 'Soft' })}
                      className="btn btn-secondary btn-sm bg-[#0f172a] text-[#f8fafc] border-[#334155] hover:bg-[#1e293b] text-[10px] font-bold"
                    >
                      <RefreshCw size={12} /> soft reset
                    </button>
                    <button 
                      onClick={() => handleDeleteCharger(activeCharger.id)}
                      className="btn btn-danger btn-sm text-[10px] font-bold"
                    >
                      <Trash2 size={12} /> decommissioning
                    </button>
                  </div>
                </div>

                {/* Simulation Control Board */}
                {!isActiveOcpp && (
                  <div className="p-4 rounded-xl border border-dashed border-[#3b82f6]/40 bg-[#3b82f6]/5 space-y-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#3b82f6]">
                      <Cpu size={14} /> Hardware Sockets Simulation Board
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={simBootNotification}
                        className="btn btn-secondary btn-sm bg-[#0f172a]/60 text-white border-[#334155] hover:bg-[#3b82f6]/10 text-[10px]"
                      >
                        ⚡ Boot Station (Online)
                      </button>
                      <button 
                        onClick={simHeartbeat}
                        className="btn btn-secondary btn-sm bg-[#0f172a]/60 text-white border-[#334155] hover:bg-[#3b82f6]/10 text-[10px]"
                      >
                        💓 Send Heartbeat
                      </button>
                      <button 
                        onClick={() => simStatusNotification(1, 'Faulted')}
                        className="btn btn-secondary btn-sm bg-[#0f172a]/60 text-[#ef4444] border-[#334155] hover:bg-[#ef4444]/10 text-[10px]"
                      >
                        ⚠️ Simulate Fault
                      </button>
                      <button 
                        onClick={() => simStatusNotification(1, 'Available')}
                        className="btn btn-secondary btn-sm bg-[#0f172a]/60 text-[#10b981] border-[#334155] hover:bg-[#10b981]/10 text-[10px]"
                      >
                        🟢 Clear Fault (Available)
                      </button>
                    </div>
                  </div>
                )}

                {/* Connectors Status */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Live Connector Outlets</h4>
                  
                  {activeChargerConnectors.length === 0 ? (
                    <div className="text-xs text-[#94a3b8] italic">No active outlets configured for this machine.</div>
                  ) : (
                    <div className="space-y-4">
                      {activeChargerConnectors.map(cn => {
                        const isCharging = cn.status === 'Charging';
                        const isFaulted = cn.status === 'Faulted' || cn.status === 'Faulty';
                        
                        return (
                          <div 
                            key={cn.id} 
                            className="p-5 rounded-2xl border border-[#334155] bg-[#0f172a]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                isCharging 
                                  ? 'bg-[#06b6d4]/10 text-[#06b6d4]' 
                                  : isFaulted 
                                    ? 'bg-[#ef4444]/10 text-[#ef4444]' 
                                    : 'bg-[#10b981]/10 text-[#10b981]'
                              }`}>
                                <Zap className={isCharging ? 'animate-bounce' : ''} size={22} />
                              </div>
                              <div>
                                <div className="font-bold text-sm text-white flex items-center gap-2">
                                  Connector #{cn.connectorNumber}
                                  <span className={`badge ${
                                    isCharging 
                                      ? 'status-completed' 
                                      : isFaulted 
                                        ? 'status-cancelled' 
                                        : 'status-active'
                                  }`}>
                                    {cn.status.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-[10px] text-[#94a3b8] mt-0.5">
                                  Power Output: <strong className="text-white">{cn.powerType} ({cn.maxPower} kW)</strong>
                                </p>
                              </div>
                            </div>

                            {/* Attendant Operations Triggers */}
                            <div className="flex flex-wrap items-center gap-2">
                              {!isCharging ? (
                                <>
                                  <button
                                    onClick={() => handleOcppCommandSend('UnlockConnector', { connectorId: cn.connectorNumber })}
                                    className="btn btn-secondary btn-sm bg-[#1e293b] border-[#334155] text-white hover:bg-[#334155] text-[10px]"
                                    title="Manually release locked charging gun"
                                  >
                                    <Unlock size={12} /> Unlock
                                  </button>

                                  {!isActiveOcpp && (
                                    <button
                                      onClick={() => simStartChargingFlow(cn.connectorNumber)}
                                      className="btn btn-primary btn-sm bg-[#10b981] hover:bg-[#059669] text-white text-[10px] font-bold"
                                    >
                                      🔌 Plug & Start Charging
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleOcppCommandSend('RemoteStopTransaction', { connectorId: cn.connectorNumber })}
                                    className="btn btn-danger btn-sm text-[10px] font-bold"
                                  >
                                    <Power size={12} /> Force Stop
                                  </button>

                                  {!isActiveOcpp && (
                                    <div className="flex items-center gap-1">
                                      <select 
                                        className="form-select bg-[#0f172a] border-[#334155] text-white text-[10px] w-20 py-1"
                                        value={simMeterIncrement}
                                        onChange={(e) => setSimMeterIncrement(e.target.value)}
                                      >
                                        <option value="5">+5 kWh</option>
                                        <option value="10">+10 kWh</option>
                                        <option value="20">+20 kWh</option>
                                      </select>
                                      <button
                                        onClick={() => simIncrementMeter(cn.connectorNumber)}
                                        className="btn btn-primary btn-sm bg-[#06b6d4] hover:bg-[#0891b2] text-white text-[10px] font-bold"
                                      >
                                        <BatteryCharging size={12} /> Charge Meter
                                      </button>
                                      <button
                                        onClick={() => simStopChargingFlow(cn.connectorNumber)}
                                        className="btn btn-danger btn-sm text-[10px] font-bold"
                                      >
                                        <Square size={12} /> Stop Sim
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="stat-card bg-[#1e293b] border-[#334155] py-20 text-center text-xs text-[#94a3b8]">
                Select a charge point machine above to interact with telemetry operations.
              </div>
            )}
          </div>

          {/* OCPP REAL-TIME TERMINAL LOGS COLUMN */}
          <div className="space-y-6">
            <div className="stat-card bg-[#1e293b] border-[#334155] flex flex-col h-[650px] relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-[#334155] mb-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Terminal className="text-[#3b82f6]" size={16} /> Central Diagnostics Terminal
                </h3>
                <button 
                  onClick={handleClearLogs}
                  className="text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 flex items-center gap-1 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 px-2.5 py-1.5 rounded-lg border border-[#ef4444]/20 transition-all"
                >
                  <Trash2 size={10} /> Clear
                </button>
              </div>

              {/* Terminal Monospace Logs Container */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-mono text-[10px] select-text">
                {ocppLogs && ocppLogs.length > 0 ? (
                  ocppLogs.map(log => {
                    const isIncoming = log.direction === 'IN';
                    const isError = log.messageType === 'CallError' || log.messageType === 'CallResult' && log.payload?.status === 'Failed';
                    
                    return (
                      <div 
                        key={log.id} 
                        className={`p-2.5 rounded-lg border leading-relaxed ${
                          isIncoming 
                            ? 'bg-[#0f172a]/60 border-[#334155] text-cyan-300' 
                            : 'bg-[#1e293b]/40 border-[#334155] text-pink-300'
                        } ${isError ? 'border-red-500/50 bg-red-950/20 text-red-400' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[8px] opacity-75">
                          <span className="flex items-center gap-1 font-bold">
                            {isIncoming ? '📥 INCOMING' : '📤 OUTGOING'} | {log.chargePointId}
                          </span>
                          <span>
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="font-bold text-xs mb-1 text-white">
                          Action: {log.messageType}
                        </div>
                        <pre className="overflow-x-auto bg-[#090d16]/80 p-2 rounded border border-[#1e293b] max-h-36 text-[9px] text-gray-300 scrollbar-thin">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col justify-center items-center text-center text-[#94a3b8] italic">
                    <Terminal size={32} className="opacity-25 mb-2" />
                    No network frames logged yet. Send simulator packets or connect physical OCPP EVSE to start.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ADD NEW CHARGER SECTIONS MODAL
          ===================================================================== */}
      {showAddChargerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-[#334155] flex justify-between items-center bg-[#0f172a]/40">
              <h3 className="font-bold text-base text-white flex items-center gap-1.5">
                <Plus className="text-[#3b82f6]" size={18} /> Provision New EVSE Station
              </h3>
              <button 
                onClick={() => setShowAddChargerModal(false)}
                className="text-[#94a3b8] hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddChargerSubmit} className="p-6 space-y-4">
              <div>
                <label className="form-label text-white">Charge Point ID (OCPP IdentityKey) *</label>
                <input 
                  className="form-input bg-[#0f172a] border-[#334155] text-white"
                  placeholder="e.g. SPERO-EV-001"
                  required
                  value={newCharger.charge_point_id}
                  onChange={(e) => setNewCharger({ ...newCharger, charge_point_id: e.target.value })}
                />
                <p className="text-[10px] text-[#94a3b8] mt-1">Must exactly match the charger's backend configured ID.</p>
              </div>

              <div>
                <label className="form-label text-white">Station Name *</label>
                <input 
                  className="form-input bg-[#0f172a] border-[#334155] text-white"
                  placeholder="e.g. Airport Shell Station - Fast AC"
                  required
                  value={newCharger.name}
                  onChange={(e) => setNewCharger({ ...newCharger, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-white">Hardware Vendor</label>
                  <input 
                    className="form-input bg-[#0f172a] border-[#334155] text-white"
                    placeholder="e.g. Delta / ABB"
                    value={newCharger.vendor}
                    onChange={(e) => setNewCharger({ ...newCharger, vendor: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label text-white">Model Name</label>
                  <input 
                    className="form-input bg-[#0f172a] border-[#334155] text-white"
                    placeholder="e.g. SPERO-AC-022"
                    value={newCharger.model}
                    onChange={(e) => setNewCharger({ ...newCharger, model: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-white">Hardware Serial Number</label>
                <input 
                  className="form-input bg-[#0f172a] border-[#334155] text-white"
                  placeholder="e.g. SN-0902883391"
                  value={newCharger.serial_number}
                  onChange={(e) => setNewCharger({ ...newCharger, serial_number: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label text-white">Physical Location</label>
                <input 
                  className="form-input bg-[#0f172a] border-[#334155] text-white"
                  placeholder="e.g. Airport Bypass Road, Accra"
                  value={newCharger.location}
                  onChange={(e) => setNewCharger({ ...newCharger, location: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-4 border-t border-[#334155]">
                <button 
                  type="button" 
                  onClick={() => setShowAddChargerModal(false)}
                  className="btn btn-secondary bg-transparent border-[#334155] text-white hover:bg-[#334155] flex-1 py-2"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="btn btn-primary bg-[#3b82f6] hover:bg-[#2563eb] text-white flex-1 py-2 font-bold justify-center"
                >
                  {isSubmitting ? 'Registering...' : 'Provision Charger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
