'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { 
  useChargers, 
  useConnectors, 
  useOcppLogs, 
  useSettings, 
  useStations
} from '@/hooks/use-database';
import { 
  addCharger, 
  deleteCharger, 
  sendOcppCommand, 
  clearOcppLogs,
  addStation
} from '@/app/actions/chargers';
import { saveSettings } from '@/app/actions/settings';
import { supabase } from '@/lib/supabase';
import { 
  Zap, Settings, RefreshCw, Power, Terminal, Plus, Trash2, 
  Signal, AlertCircle, BatteryCharging, CheckCircle, 
  Cpu, Monitor, Activity, Wifi, WifiOff, Copy, Clock,
  MapPin, Box, Unlock, Radio, ServerCrash, Key, Search, Check, Gauge, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';

export default function ChargersPage() {
  const queryClient = useQueryClient();

  // DB Hooks
  const { data: stations, isLoading: loadingStations } = useStations();
  const { data: chargers, isLoading: loadingChargers } = useChargers();
  const { data: connectors } = useConnectors();
  const { data: settings } = useSettings();

  // Selected state
  const [selectedStationId, setSelectedStationId] = useState<string>('all');
  const [selectedChargerId, setSelectedChargerId] = useState<string | null>(null);
  
  // Modals / Forms
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [newStation, setNewStation] = useState({ name: '', location: '' });

  const [isAddChargerOpen, setIsAddChargerOpen] = useState(false);
  const [newCharger, setNewCharger] = useState({ 
    charge_point_id: '', 
    vendor: 'Generic', 
    model: 'SmartCharge',
    station_id: '',
    ocpp_version: '1.6-J',
    security_profile: 1,
    auth_password: 'SPERO-SEC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
    heartbeat_interval: 60,
    guns_count: 2,
    connector_type: 'CCS2 (DC)',
    max_power: 22
  });

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gatewayHost, setGatewayHost] = useState(settings?.gateway_host || 'spero-ev-charge.onrender.com');
  const [gatewayPort, setGatewayPort] = useState(settings?.gateway_port || '443');

  // Hard reboot double-confirmation states
  const [confirmingRebootId, setConfirmingRebootId] = useState<string | null>(null);

  // OCPP Logs view state
  const [logFilter, setLogFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ERROR'>('ALL');
  const [logSearch, setLogSearch] = useState('');

  const activeCharger = useMemo(() => {
    return chargers?.find(c => c.id === selectedChargerId);
  }, [chargers, selectedChargerId]);

  const activeChargerConnectors = useMemo(() => {
    return connectors?.filter(c => c.chargerId === selectedChargerId) || [];
  }, [connectors, selectedChargerId]);

  // Logs
  const { data: ocppLogs } = useOcppLogs(activeCharger?.chargePointId || '');

  useEffect(() => {
    if (settings) {
      setGatewayHost(settings.gateway_host || 'spero-ev-charge.onrender.com');
      setGatewayPort(settings.gateway_port || '443');
    }
  }, [settings]);

  // Dynamic calculations for NOC Row
  const totalChargersCount = chargers?.length || 0;
  const onlineChargersCount = chargers?.filter(c => c.status === 'online').length || 0;
  const activeSessionsCount = connectors?.filter(c => c.currentSessionId).length || 0;
  const totalPowerCapacity = useMemo(() => {
    return connectors?.reduce((sum, c) => sum + Number(c.maxPower || 0), 0) || 0;
  }, [connectors]);

  // Filtered Chargers
  const filteredChargers = useMemo(() => {
    if (selectedStationId === 'all') return chargers || [];
    return chargers?.filter(c => c.stationId === selectedStationId) || [];
  }, [chargers, selectedStationId]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (!ocppLogs) return [];
    return ocppLogs.filter((log: any) => {
      // Apply search keyword filter
      const searchStr = logSearch.toLowerCase();
      const matchesSearch = !logSearch || 
        log.messageType.toLowerCase().includes(searchStr) || 
        log.direction.toLowerCase().includes(searchStr) || 
        JSON.stringify(log.payload).toLowerCase().includes(searchStr);

      if (!matchesSearch) return false;

      // Apply type filter
      if (logFilter === 'ALL') return true;
      if (logFilter === 'IN') return log.direction === 'IN';
      if (logFilter === 'OUT') return log.direction === 'OUT';
      if (logFilter === 'ERROR') return log.messageType === 'CallError' || log.messageType.toLowerCase().includes('error');
      return true;
    });
  }, [ocppLogs, logFilter, logSearch]);

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Actions
  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await addStation(newStation);
      if (!res.success) throw new Error(res.error);
      toast.success('Station added successfully');
      setIsAddStationOpen(false);
      setNewStation({ name: '', location: '' });
      queryClient.invalidateQueries({ queryKey: ['stations'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddCharger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharger.charge_point_id) return toast.error('Charge Point ID required');
    try {
      const res = await addCharger(newCharger);
      if (!res.success) throw new Error(res.error);
      toast.success('Charger registered successfully via OCPP!');
      setIsAddChargerOpen(false);
      setNewCharger({ 
        charge_point_id: '', 
        vendor: 'Generic', 
        model: 'SmartCharge', 
        station_id: '',
        ocpp_version: '1.6-J',
        security_profile: 1,
        auth_password: 'SPERO-SEC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        heartbeat_interval: 60,
        guns_count: 2,
        connector_type: 'CCS2 (DC)',
        max_power: 22
      });
      queryClient.invalidateQueries({ queryKey: ['chargers'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteActiveCharger = async () => {
    if (!activeCharger) return;
    const confirmDelete = confirm(`Are you sure you want to permanently delete charger "${activeCharger.chargePointId}"? This will remove all its configured connectors.`);
    if (!confirmDelete) return;

    const loadingToast = toast.loading(`Deleting charger ${activeCharger.chargePointId}...`);
    try {
      const res = await deleteCharger(activeCharger.id);
      if (!res.success) throw new Error(res.error);
      toast.success(`Charger deleted successfully`, { id: loadingToast });
      setSelectedChargerId(null);
      queryClient.invalidateQueries({ queryKey: ['chargers'] });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const handleRemoteCommand = async (command: string, payload: any = {}) => {
    if (!activeCharger) return;
    const loadingToast = toast.loading(`Sending OCPP ${command} command...`);
    try {
      const res = await sendOcppCommand({ chargePointId: activeCharger.chargePointId, command, payload });
      if (!res.success) throw new Error(res.error);
      toast.success(`Command ${command} sent successfully!`, { id: loadingToast });
      queryClient.invalidateQueries({ queryKey: ['ocpp_logs', activeCharger.chargePointId] });
    } catch (err: any) {
      toast.error(err.message, { id: loadingToast });
    }
  };

  const handleSoftReset = () => {
    handleRemoteCommand('Reset', { type: 'Soft' });
  };

  const handleHardReset = () => {
    if (confirmingRebootId !== activeCharger?.id) {
      setConfirmingRebootId(activeCharger?.id || null);
      // Reset confirmation after 4 seconds
      setTimeout(() => setConfirmingRebootId(null), 4000);
      toast.warning('Click "Hard Reset" again to confirm reboot.');
      return;
    }
    handleRemoteCommand('Reset', { type: 'Hard' });
    setConfirmingRebootId(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 dark:bg-slate-950 transition-colors duration-300">
      {/* Header */}
      <TopBar 
        title="Infrastructure Control" 
        subtitle="Manage hardware configuration, monitor live OCPP logs, and run diagnostics." 
      />

      {/* Main Page Area */}
      <div className="flex-1 p-6 space-y-6 max-w-[1600px] w-full mx-auto">
        
        {/* NOC Network Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all duration-300 flex items-center justify-between group hover:border-blue-500/30">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Network Stations</p>
              <h4 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 leading-none">
                {stations?.length || 0}
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
                <MapPin size={10} /> Charging hubs
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center dark:bg-blue-500/5 group-hover:scale-110 transition-transform">
              <Box size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all duration-300 flex items-center justify-between group hover:border-cyan-500/30">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Chargers</p>
              <h4 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 leading-none flex items-center gap-2">
                {onlineChargersCount} <span className="text-sm font-medium text-slate-400">/ {totalChargersCount}</span>
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                {onlineChargersCount} live nodes
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center dark:bg-cyan-500/5 group-hover:scale-110 transition-transform">
              <Wifi size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all duration-300 flex items-center justify-between group hover:border-emerald-500/30">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Sessions</p>
              <h4 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 leading-none">
                {activeSessionsCount}
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
                {activeSessionsCount > 0 ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-500 font-medium">Delivering energy</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                    No vehicles plugged
                  </>
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center dark:bg-emerald-500/5 group-hover:scale-110 transition-transform">
              <Zap size={20} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-all duration-300 flex items-center justify-between group hover:border-purple-500/30">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Power Grid Capacity</p>
              <h4 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 leading-none">
                {totalPowerCapacity.toFixed(1)} <span className="text-xs font-semibold text-slate-400">kW</span>
              </h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1">
                <Gauge size={10} /> Grid configuration
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center dark:bg-purple-500/5 group-hover:scale-110 transition-transform">
              <Activity size={20} />
            </div>
          </div>

        </div>

        {/* Action Controls & Filters Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 transition-colors duration-300">
          
          {/* Left Side: Station Filter Segments */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto p-1 bg-slate-100 dark:bg-slate-950 rounded-xl max-w-full hide-scrollbar">
            <button 
              onClick={() => setSelectedStationId('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-300 flex items-center gap-1.5 ${
                selectedStationId === 'all' 
                  ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-cyan-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200'
              }`}
            >
              <Box size={14}/> 
              Global Network
              <span className="bg-slate-200/60 dark:bg-slate-800/80 text-[10px] px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
                {chargers?.length || 0}
              </span>
            </button>
            {stations?.map(st => {
              const count = chargers?.filter(c => c.stationId === st.id).length || 0;
              return (
                <button 
                  key={st.id}
                  onClick={() => setSelectedStationId(st.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-300 flex items-center gap-1.5 ${
                    selectedStationId === st.id 
                      ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-cyan-400 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200'
                  }`}
                >
                  <MapPin size={14}/> 
                  {st.name}
                  <span className="bg-slate-200/60 dark:bg-slate-800/80 text-[10px] px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Side: Setup Actions */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button 
              onClick={() => setIsAddStationOpen(true)} 
              className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus size={14} /> New Station
            </button>
            <button 
              onClick={() => setIsAddChargerOpen(true)} 
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={14} /> Add Charger
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)} 
              className="p-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition-all shadow-sm"
              title="OCPP Gateway Settings"
            >
              <Settings size={16} />
            </button>
          </div>

        </div>

        {/* Fleet Split Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Fleet List (4 Columns) */}
          <div className="xl:col-span-4 space-y-4">
            <div className="flex items-center justify-between pl-1">
              <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Activity size={12} className="text-blue-500" /> Fleet List
              </h3>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {filteredChargers.length} active units
              </span>
            </div>

            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
              {filteredChargers.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 border-dashed rounded-2xl p-10 text-center text-slate-500 transition-colors duration-300">
                  <AlertCircle size={28} className="mx-auto mb-3 opacity-40 text-slate-400 dark:text-slate-500" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No chargers found</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Register a hardware charger node to get started.</p>
                </div>
              ) : (
                filteredChargers.map(charger => {
                  const isOnline = charger.status === 'online';
                  const isSelected = selectedChargerId === charger.id;
                  const stationName = stations?.find(s => s.id === charger.stationId)?.name || 'Global Network';
                  
                  // Fetch charger connectors
                  const chargerConns = connectors?.filter(c => c.chargerId === charger.id) || [];

                  return (
                    <div 
                      key={charger.id}
                      onClick={() => setSelectedChargerId(charger.id)}
                      className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-300 cursor-pointer group ${
                        isSelected 
                          ? 'bg-white dark:bg-slate-900 border-blue-500 dark:border-cyan-400/70 shadow-lg shadow-blue-500/[0.04] ring-1 ring-blue-500/20 dark:ring-cyan-500/20' 
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                      }`}
                    >
                      {/* Active Left Indicator Strip */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all ${
                        isSelected 
                          ? 'bg-gradient-to-b from-blue-500 to-indigo-600 dark:from-cyan-400 dark:to-cyan-600' 
                          : 'bg-transparent'
                      }`} />

                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 font-mono tracking-tight flex items-center gap-1.5">
                            {charger.chargePointId}
                          </h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
                            <MapPin size={10} className="text-slate-400" /> {stationName}
                          </p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          isOnline 
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400 dark:bg-green-500/5 border border-green-500/20 dark:border-green-500/10' 
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800'
                        }`}>
                          {isOnline ? (
                            <>
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                              </span>
                              ONLINE
                            </>
                          ) : (
                            <>
                              <WifiOff size={8} /> OFFLINE
                            </>
                          )}
                        </div>
                      </div>

                      {/* Connectors Previews */}
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {chargerConns.map(conn => {
                            const status = conn.status || 'Unavailable';
                            let statusColor = 'bg-slate-400 text-slate-100';
                            if (status === 'Available') statusColor = 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/10';
                            if (status === 'Charging') statusColor = 'bg-blue-500/15 text-blue-600 dark:text-cyan-400 border border-blue-500/10 animate-pulse';
                            if (status === 'Preparing') statusColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/10';
                            if (status === 'Faulted') statusColor = 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/10';

                            return (
                              <span key={conn.id} className={`text-[8px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded ${statusColor}`}>
                                Gun {conn.connectorNumber}: {status}
                              </span>
                            );
                          })}
                          {chargerConns.length === 0 && (
                            <span className="text-[9px] text-slate-400 italic">No guns configured</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 rounded">
                          {charger.vendor}
                        </span>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Diagnostics & Streams (8 Columns) */}
          <div className="xl:col-span-8">
            {!activeCharger ? (
              // Empty State Illustration
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl h-[600px] flex flex-col items-center justify-center text-center p-8 shadow-sm transition-colors duration-300 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50/20 via-transparent to-transparent dark:from-slate-900/50 dark:via-transparent pointer-events-none"></div>
                <div className="relative">
                  <div className="w-20 h-20 rounded-[2.5rem] bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-cyan-400 dark:to-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mx-auto mb-6">
                    <Cpu size={36} className="animate-pulse" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-cyan-400 border-4 border-white dark:border-slate-900 flex items-center justify-center">
                    <Check className="text-white" size={10} strokeWidth={4} />
                  </div>
                </div>
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">Diagnostic Centre</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                  Select a charger hardware node from the fleet list to access remote action commands, view live connector statuses, and monitor the live OCPP telemetry stream.
                </p>
                <div className="flex gap-4 mt-8">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span> Live Telemetry
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-cyan-500"></span> Command Console
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span> OCPP Terminal
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Active Charger Header */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm transition-colors duration-300 relative overflow-hidden">
                  
                  {/* Decorative hardware vector grid */}
                  <div className="absolute right-0 top-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none">
                    <svg width="240" height="240" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1">
                      <circle cx="50" cy="50" r="40" />
                      <line x1="10" y1="50" x2="90" y2="50" />
                      <line x1="50" y1="10" x2="50" y2="90" />
                    </svg>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-500/10 text-blue-600 dark:bg-cyan-500/5 dark:text-cyan-400 rounded-2xl border border-blue-500/10">
                        <ServerCrash size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-mono tracking-tight">
                            {activeCharger.chargePointId}
                          </h3>
                          <button 
                            onClick={() => copyToClipboard(activeCharger.chargePointId)}
                            className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
                            title="Copy ID"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Vendor: <span className="font-semibold text-slate-600 dark:text-slate-300">{activeCharger.vendor}</span> • Model: <span className="font-semibold text-slate-600 dark:text-slate-300">{activeCharger.model}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button 
                        onClick={() => handleRemoteCommand('TriggerMessage', { requestedMessage: 'BootNotification' })}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <RefreshCw size={13} className="animate-spin-slow" /> Request Boot
                      </button>
                      <button 
                        onClick={() => handleRemoteCommand('TriggerMessage', { requestedMessage: 'Heartbeat' })}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <HeartbeatIcon className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Ping Node
                      </button>
                      <button 
                        onClick={handleDeleteActiveCharger}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                        title="Delete Charger Node"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>

                  {/* Connectors Telemetry */}
                  <h4 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 pl-0.5">
                    Live Connector Telemetry
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {[1, 2].map(num => {
                      const conn = activeChargerConnectors.find(c => c.connectorNumber === num);
                      const status = conn?.status || 'Unavailable';
                      
                      let statusConfig = {
                        text: 'text-slate-500 dark:text-slate-400',
                        bg: 'bg-slate-50 dark:bg-slate-900/60',
                        border: 'border-slate-200 dark:border-slate-800',
                        pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200/80 dark:border-slate-800'
                      };
                      
                      if (status === 'Available') {
                        statusConfig = { 
                          text: 'text-green-600 dark:text-green-400', 
                          bg: 'bg-green-500/[0.02] dark:bg-green-950/10', 
                          border: 'border-green-500/20 dark:border-green-500/10',
                          pill: 'bg-green-500/10 text-green-700 dark:bg-green-500/5 dark:text-green-400 border-green-500/20 dark:border-green-500/10'
                        };
                      } else if (status === 'Preparing') {
                        statusConfig = { 
                          text: 'text-amber-600 dark:text-amber-400', 
                          bg: 'bg-amber-500/[0.02] dark:bg-amber-950/10', 
                          border: 'border-amber-500/20 dark:border-amber-500/10',
                          pill: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/5 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/10'
                        };
                      } else if (status === 'Charging') {
                        statusConfig = { 
                          text: 'text-blue-600 dark:text-cyan-400', 
                          bg: 'bg-blue-500/[0.03] dark:bg-cyan-950/10', 
                          border: 'border-blue-500/30 dark:border-cyan-500/20',
                          pill: 'bg-blue-500/10 text-blue-700 dark:bg-cyan-500/10 dark:text-cyan-400 border-blue-500/20 dark:border-cyan-500/10'
                        };
                      } else if (status === 'Faulted') {
                        statusConfig = { 
                          text: 'text-red-600 dark:text-red-400', 
                          bg: 'bg-red-500/[0.02] dark:bg-red-950/10', 
                          border: 'border-red-500/20 dark:border-red-500/10',
                          pill: 'bg-red-500/10 text-red-700 dark:bg-red-500/5 dark:text-red-400 border-red-500/20 dark:border-red-500/10'
                        };
                      }

                      return (
                        <div 
                          key={num} 
                          className={`p-5 rounded-2xl border ${statusConfig.bg} ${statusConfig.border} transition-all relative overflow-hidden`}
                        >
                          {/* Flowing background shimmering indicator if charging */}
                          {status === 'Charging' && (
                            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-r from-transparent via-cyan-500/[0.03] to-transparent animate-[shimmer_2s_infinite]"></div>
                          )}

                          <div className="flex justify-between items-center mb-4 relative z-10">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 shadow-sm">
                                <BatteryCharging size={16} className={status === 'Charging' ? 'text-blue-500 dark:text-cyan-400 animate-pulse' : ''} />
                              </div>
                              <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Gun {num}</span>
                            </div>
                            <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${statusConfig.pill}`}>
                              {status}
                            </span>
                          </div>

                          <div className="relative z-10 space-y-3">
                            {conn?.currentSessionId ? (
                              <div className="space-y-3">
                                {/* Simulated Interactive Telemetry */}
                                <div className="p-3 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-xl space-y-2.5 shadow-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                    <span className="text-[10px] font-extrabold text-blue-600 dark:text-cyan-400 uppercase tracking-wider">
                                      Active Charging Session
                                    </span>
                                  </div>
                                  
                                  {/* Grid values */}
                                  <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-50 dark:border-slate-900/60 text-center">
                                    <div>
                                      <div className="text-[9px] text-slate-400 font-medium">Flow Rate</div>
                                      <div className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5">
                                        {(Number(conn.maxPower || 11.4) * 0.95).toFixed(1)} <span className="text-[8px] font-semibold text-slate-400">kW</span>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-slate-400 font-medium">Delivered</div>
                                      <div className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5">
                                        14.8 <span className="text-[8px] font-semibold text-slate-400">kWh</span>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-slate-400 font-medium">Elapsed</div>
                                      <div className="text-xs font-black text-slate-800 dark:text-slate-100 mt-0.5">
                                        35m 12s
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-3 bg-slate-100/50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-900 border-dashed text-xs text-slate-400 dark:text-slate-500 font-medium">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span> 
                                  Ready to charge
                                </span>
                                <span>Max: {conn?.maxPower || 22.0} kW</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* remote Actions Commands */}
                  <h4 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3.5 pl-0.5">
                    OCPP Command Console
                  </h4>

                  <div className="flex flex-wrap gap-2.5 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-2xl">
                    <button 
                      onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 1 })} 
                      className="px-3.5 py-2 hover:bg-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-95"
                    >
                      <Unlock size={13} className="text-emerald-500" /> Unlock Gun 1
                    </button>
                    <button 
                      onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 2 })} 
                      className="px-3.5 py-2 hover:bg-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-95"
                    >
                      <Unlock size={13} className="text-emerald-500" /> Unlock Gun 2
                    </button>

                    <button 
                      onClick={() => handleRemoteCommand('RemoteStartTransaction', { connectorId: 1, idTag: 'A1B2C3D4' })} 
                      className="px-3 py-1.5 hover:bg-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded flex items-center gap-1"
                    >
                      <Zap size={11} className="text-blue-500" /> Test 1 (Normal)
                    </button>
                    <button 
                      onClick={() => handleRemoteCommand('RemoteStartTransaction', { idTag: 'A1B2C3D4' })} 
                      className="px-3 py-1.5 hover:bg-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded flex items-center gap-1"
                    >
                      <Zap size={11} className="text-purple-500" /> Test 2 (No ID)
                    </button>
                    <button 
                      onClick={() => handleRemoteCommand('RemoteStartTransaction', { 
                        connectorId: 1, 
                        idTag: 'A1B2C3D4',
                        chargingProfile: {
                          chargingProfileId: 1,
                          stackLevel: 0,
                          chargingProfilePurpose: 'TxDefaultProfile',
                          chargingProfileKind: 'Absolute',
                          chargingSchedule: {
                            chargingRateUnit: 'A',
                            chargingSchedulePeriod: [{ startPeriod: 0, limit: 32 }]
                          }
                        }
                      })} 
                      className="px-3 py-1.5 hover:bg-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded flex items-center gap-1"
                    >
                      <Zap size={11} className="text-orange-500" /> Test 3 (Profile)
                    </button>
                    
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-1 self-center hidden sm:block"></div>
                    
                    <button 
                      onClick={handleSoftReset} 
                      className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95"
                    >
                      <Power size={13} className="text-amber-500" /> Soft Reboot
                    </button>
                    <button 
                      onClick={handleHardReset} 
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm active:scale-95 ${
                        confirmingRebootId === activeCharger.id
                          ? 'bg-red-600 hover:bg-red-500 text-white animate-bounce'
                          : 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      <ShieldAlert size={13} /> {confirmingRebootId === activeCharger.id ? 'Confirm Reboot' : 'Hard Reset'}
                    </button>
                  </div>

                </div>

                {/* Cyberpunk Logs Terminal Panel */}
                <div className="bg-[#0b0f19] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[550px] relative">
                  
                  {/* Glowing header light strip */}
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500"></div>
                  
                  {/* Terminal Header */}
                  <div className="bg-slate-900/90 border-b border-slate-800/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-3">
                      <Terminal size={17} className="text-cyan-400" />
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                          OCPP Operations Stream
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium">Real-time socket socket-stream console</p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] text-emerald-400 font-extrabold tracking-wider uppercase">
                        <Radio size={8} className="animate-pulse text-emerald-400"/> Live
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => clearOcppLogs(activeCharger.chargePointId)} 
                      className="text-[10px] font-bold text-slate-400 hover:text-red-400 flex items-center gap-1.5 transition-colors self-end sm:self-auto bg-slate-850 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg"
                    >
                      <Trash2 size={12} /> Clear Stream
                    </button>
                  </div>

                  {/* Log Filter and Search bar */}
                  <div className="bg-[#0e1423] border-b border-slate-800 px-4 py-2.5 flex flex-col sm:flex-row justify-between items-center gap-2.5 relative z-10">
                    {/* Log Filter Pills */}
                    <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-slate-800 w-full sm:w-auto overflow-x-auto">
                      {(['ALL', 'IN', 'OUT', 'ERROR'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setLogFilter(type)}
                          className={`px-3 py-1 rounded text-[10px] font-bold tracking-wide transition-all uppercase ${
                            logFilter === type 
                              ? 'bg-slate-800 text-cyan-400 shadow-sm' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    {/* Terminal Search bar */}
                    <div className="relative w-full sm:w-60">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
                        <Search size={11} />
                      </span>
                      <input 
                        type="text" 
                        value={logSearch}
                        onChange={e => setLogSearch(e.target.value)}
                        placeholder="Search OCPP logs..." 
                        className="w-full bg-black/30 border border-slate-850 focus:border-cyan-500 rounded-lg py-1 pl-7 pr-3 text-[10px] font-mono text-slate-300 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Terminal Log Console View */}
                  <div className="p-5 flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-3.5 bg-[#090c15] text-slate-300 scrollbar-terminal">
                    
                    {filteredLogs.map((log: any, index: number) => {
                      const isOut = log.direction === 'OUT';
                      const isError = log.messageType === 'CallError' || log.messageType.toLowerCase().includes('error');
                      
                      let directionBadge = 'text-green-400 bg-green-500/10 border-green-500/20';
                      let directionText = 'IN';
                      if (isOut) {
                        directionBadge = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
                        directionText = 'OUT';
                      }
                      if (isError) {
                        directionBadge = 'text-red-400 bg-red-500/10 border-red-500/20';
                      }

                      return (
                        <div key={log.id} className="group relative bg-[#0d1222]/40 hover:bg-[#0d1222]/80 border border-slate-900 hover:border-slate-800 p-3 rounded-xl transition-all">
                          
                          {/* Copy line helper button */}
                          <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyToClipboard(JSON.stringify(log, null, 2))}
                              className="p-1 rounded bg-[#161c2e] hover:bg-[#202943] text-slate-400 hover:text-white border border-slate-800 transition-colors flex items-center gap-1 text-[9px] font-bold"
                              title="Copy raw log object"
                            >
                              <Copy size={9} /> Copy
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-slate-600 select-none">{(index + 1).toString().padStart(2, '0')}</span>
                            <span className="text-slate-500 select-none">
                              {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 })}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${directionBadge}`}>
                              {directionText}
                            </span>
                            <span className="text-cyan-300 font-bold tracking-wide select-all">{log.messageType}</span>
                          </div>

                          <div className="pl-4 border-l border-slate-800 ml-4 font-mono text-[10px] text-slate-400 break-all select-all whitespace-pre-wrap">
                            {JSON.stringify(log.payload, null, 2)}
                          </div>
                        </div>
                      );
                    })}

                    {filteredLogs.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3.5 py-20 text-center">
                        <Radio size={28} className="animate-pulse opacity-15 text-slate-400" />
                        <p className="font-mono text-xs max-w-xs">
                          {logSearch || logFilter !== 'ALL' 
                            ? 'No logs match current search filters.' 
                            : 'Awaiting socket connection... Listening for OCPP heartbeat payload streams...'}
                        </p>
                      </div>
                    )}

                  </div>

                </div>

              </div>
            )}
          </div>

        </div>

      </div>

      {/* Modal: Add Station */}
      {isAddStationOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Add New Station</h3>
              <button 
                onClick={() => setIsAddStationOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold bg-slate-100 dark:bg-slate-800 rounded-lg p-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleAddStation} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Station Name</label>
                <input 
                  required 
                  value={newStation.name} 
                  onChange={e => setNewStation({...newStation, name: e.target.value})} 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-sm text-slate-900 dark:text-white outline-none transition-all" 
                  placeholder="e.g. Accra Mall Fast Chargers" 
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Physical Location</label>
                <input 
                  required 
                  value={newStation.location} 
                  onChange={e => setNewStation({...newStation, location: e.target.value})} 
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-sm text-slate-900 dark:text-white outline-none transition-all" 
                  placeholder="e.g. Accra Mall, Tetteh Quarshie" 
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button 
                  type="submit" 
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
                >
                  Create Station Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Charger */}
      {isAddChargerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Register Charger via OCPP</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configure hardware nodes and WebSocket protocols.</p>
              </div>
              <button 
                onClick={() => setIsAddChargerOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold bg-slate-100 dark:bg-slate-800 rounded-lg p-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleAddCharger} className="space-y-6">
              
              {/* Section 1: Basic Identifiers */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-widest border-b pb-1 border-slate-100 dark:border-slate-800">1. Basic Hardware Identifiers</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Charge Point ID (OCPP Ident)</label>
                    <input 
                      required 
                      value={newCharger.charge_point_id} 
                      onChange={e => setNewCharger({...newCharger, charge_point_id: e.target.value.toUpperCase()})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-blue-600 dark:text-cyan-400 outline-none transition-all uppercase" 
                      placeholder="e.g. SPERO-EV-004" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Assign Hub Station</label>
                    <select 
                      required 
                      value={newCharger.station_id} 
                      onChange={e => setNewCharger({...newCharger, station_id: e.target.value})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">-- Choose Hub Station --</option>
                      {stations?.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Vendor</label>
                    <input 
                      required 
                      value={newCharger.vendor} 
                      onChange={e => setNewCharger({...newCharger, vendor: e.target.value})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none transition-all" 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Model</label>
                    <input 
                      required 
                      value={newCharger.model} 
                      onChange={e => setNewCharger({...newCharger, model: e.target.value})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none transition-all" 
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: OCPP Protocols */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-widest border-b pb-1 border-slate-100 dark:border-slate-800">2. OCPP Protocols Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">OCPP Version</label>
                    <select 
                      value={newCharger.ocpp_version} 
                      onChange={e => setNewCharger({...newCharger, ocpp_version: e.target.value})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value="1.6-J">OCPP 1.6-J (JSON)</option>
                      <option value="2.0.1">OCPP 2.0.1</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Heartbeat Interval (Secs)</label>
                    <input 
                      type="number"
                      required
                      value={newCharger.heartbeat_interval} 
                      onChange={e => setNewCharger({...newCharger, heartbeat_interval: Number(e.target.value)})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Security Profile</label>
                    <select 
                      value={newCharger.security_profile} 
                      onChange={e => setNewCharger({...newCharger, security_profile: Number(e.target.value)})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value={0}>Profile 0: Unsecured (WS)</option>
                      <option value={1}>Profile 1: Basic Authentication (WSS)</option>
                      <option value={2}>Profile 2: TLS Client Certificate</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Basic Auth Password / Token</label>
                    <div className="relative">
                      <input 
                        type="text"
                        disabled={newCharger.security_profile === 0}
                        value={newCharger.security_profile === 0 ? 'Not Required' : newCharger.auth_password} 
                        onChange={e => setNewCharger({...newCharger, auth_password: e.target.value})} 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 pr-14 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none transition-all" 
                      />
                      {newCharger.security_profile > 0 && (
                        <button
                          type="button"
                          onClick={() => setNewCharger({
                            ...newCharger,
                            auth_password: 'SPERO-SEC-' + Math.random().toString(36).substring(2, 8).toUpperCase()
                          })}
                          className="absolute right-2 top-1.5 px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          Gen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Connector Configuration */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-blue-600 dark:text-cyan-400 uppercase tracking-widest border-b pb-1 border-slate-100 dark:border-slate-800">3. Connectors & Guns Configurations</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Number of Guns</label>
                    <select 
                      value={newCharger.guns_count} 
                      onChange={e => setNewCharger({...newCharger, guns_count: Number(e.target.value)})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value={1}>1 Gun</option>
                      <option value={2}>2 Guns</option>
                      <option value={4}>4 Guns</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Gun Port Type</label>
                    <select 
                      value={newCharger.connector_type} 
                      onChange={e => setNewCharger({...newCharger, connector_type: e.target.value})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value="CCS2 (DC)">CCS2 (DC)</option>
                      <option value="Type 2 (AC)">Type 2 (AC)</option>
                      <option value="GBT (DC)">GBT (DC)</option>
                      <option value="CHAdeMO (DC)">CHAdeMO (DC)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Max Power (kW)</label>
                    <select 
                      value={newCharger.max_power} 
                      onChange={e => setNewCharger({...newCharger, max_power: Number(e.target.value)})} 
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value={7.4}>7.4 kW (AC)</option>
                      <option value={11.0}>11 kW (AC)</option>
                      <option value={22.0}>22 kW (AC)</option>
                      <option value={50.0}>50 kW (Fast DC)</option>
                      <option value={150.0}>150 kW (Super DC)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                <button 
                  type="submit" 
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
                >
                  Register Node & Auto-Configure OCPP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gateway Settings */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">OCPP Network Operations Center</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configure WebSocket ports and diagnose connectivity.</p>
              </div>
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold bg-slate-100 dark:bg-slate-800 rounded-lg p-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await saveSettings({ gateway_host: gatewayHost, gateway_port: gatewayPort });
                if (!res.success) throw new Error(res.error);
                toast.success('Gateway configurations saved!');
                setIsSettingsOpen(false);
                queryClient.invalidateQueries({ queryKey: ['settings'] });
              } catch (err: any) {
                toast.error(err.message);
              }
            }} className="space-y-6">
              
              {/* Grid configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Gateway Host IP / DNS</label>
                  <input 
                    required 
                    value={gatewayHost} 
                    onChange={e => setGatewayHost(e.target.value)} 
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all" 
                    placeholder="127.0.0.1" 
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Gateway Port</label>
                  <input 
                    required 
                    value={gatewayPort} 
                    onChange={e => setGatewayPort(e.target.value)} 
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all" 
                    placeholder="8080" 
                  />
                </div>
              </div>

              {/* Dynamic Connection Insights */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">WebSocket Endpoint Insights</h4>
                <div className="p-4 bg-slate-950 text-slate-300 rounded-xl border border-slate-800 font-mono text-[10px] space-y-3">
                  <div>
                    <span className="text-slate-505">// Configure your physical chargers to connect to the active URL:</span>
                    <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-slate-850 mt-1 select-all">
                      <span className="text-cyan-400 font-mono">ws://{gatewayHost}:{gatewayPort}/ocpp/<span className="text-amber-300">[ChargePointId]</span></span>
                      <button 
                        type="button" 
                        onClick={() => copyToClipboard(`ws://${gatewayHost}:${gatewayPort}/ocpp/`)}
                        className="text-[9px] text-slate-500 hover:text-white font-bold bg-[#141b2c] px-2 py-1 rounded"
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-505">// Example connection path for a registered node (e.g. {chargers?.[0]?.chargePointId || 'SPERO-EV-001'}):</span>
                    <div className="p-3 bg-black/40 rounded-xl border border-slate-800/50 mt-2 font-mono text-[11px] text-slate-300">
                      ws://{gatewayHost}:{gatewayPort}/ocpp/{chargers?.[0]?.chargePointId || 'SPERO-EV-001'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Setup Diagnostics guidelines */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">OCPP Setup Diagnostics Guide</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] leading-relaxed">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-900/60">
                    <span className="font-extrabold text-blue-600 dark:text-cyan-400 block mb-1">1. SUBPROTOCOL HEADERS</span>
                    Make sure the charger specifies `ocpp1.6` or `ocpp2.0.1` WebSocket headers, otherwise the Gateway server will reject the handshake.
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-900/60">
                    <span className="font-extrabold text-blue-600 dark:text-cyan-400 block mb-1">2. SECURITY CREDENTIALS</span>
                    For Security Profile 1, configure the charger to use the generated basic authorization password matching the registered token.
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-900/60">
                    <span className="font-extrabold text-blue-600 dark:text-cyan-400 block mb-1">3. HEARTBEAT KEEP-ALIVE</span>
                    Ensure the heartbeat interval is set to 60s. Any node failing to ping within its heartbeat frame is flagged OFFLINE.
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-900/60">
                    <span className="font-extrabold text-blue-600 dark:text-cyan-400 block mb-1">4. STATUS NOTIFICATIONS</span>
                    Guns are initialized to \'Available\'. Status updates like \'Preparing\' or \'Charging\' automatically update dashboard telemetry.
                  </div>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-2 flex gap-3 border-t border-slate-100 dark:border-slate-800">
                <button 
                  type="submit" 
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 text-sm"
                >
                  Save NOC Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Local small visual SVGs to prevent empty layouts
function HeartbeatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
