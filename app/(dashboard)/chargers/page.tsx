'use client';

import { useState, useEffect } from 'react';
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
  clearOcppLogs 
} from '@/app/actions/chargers';
import { saveSettings } from '@/app/actions/settings';
import { supabase } from '@/lib/supabase';
import { 
  Zap, Settings, RefreshCw, Power, Terminal, Plus, Trash2, 
  Signal, AlertCircle, BatteryCharging, CheckCircle, 
  Cpu, Monitor, Activity, Wifi, WifiOff, Copy, Clock,
  MapPin, Box, Unlock, Radio, ServerCrash, Key
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

  const activeCharger = chargers?.find(c => c.id === selectedChargerId);
  const activeChargerConnectors = connectors?.filter(c => c.chargerId === selectedChargerId) || [];

  // Logs
  const { data: ocppLogs } = useOcppLogs(activeCharger?.chargePointId || '');

  // Modals / Forms
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [newStation, setNewStation] = useState({ name: '', location: '' });

  const [isAddChargerOpen, setIsAddChargerOpen] = useState(false);
  const [newCharger, setNewCharger] = useState({ 
    charge_point_id: '', 
    vendor: 'Unknown', 
    model: 'Generic',
    station_id: ''
  });

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gatewayHost, setGatewayHost] = useState('');
  const [gatewayPort, setGatewayPort] = useState('8080');

  useEffect(() => {
    if (settings) {
      setGatewayHost(settings.gateway_host || '127.0.0.1');
      setGatewayPort(settings.gateway_port || '8080');
    }
  }, [settings]);

  // Actions
  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('stations').insert([newStation]);
      if (error) throw error;
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
      toast.success('Charger registered');
      setIsAddChargerOpen(false);
      setNewCharger({ charge_point_id: '', vendor: 'Unknown', model: 'Generic', station_id: '' });
      queryClient.invalidateQueries({ queryKey: ['chargers'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoteCommand = async (command: string, payload: any = {}) => {
    if (!activeCharger) return;
    toast.loading(`Sending ${command}...`, { id: 'ocpp-cmd' });
    try {
      const res = await sendOcppCommand({ chargePointId: activeCharger.chargePointId, command, payload });
      if (!res.success) throw new Error(res.error);
      toast.success(`${command} Sent! Waiting for response...`, { id: 'ocpp-cmd' });
    } catch (err: any) {
      toast.error(err.message, { id: 'ocpp-cmd' });
    }
  };

  const filteredChargers = selectedStationId === 'all' 
    ? chargers 
    : chargers?.filter(c => c.stationId === selectedStationId);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-black border border-slate-800 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">Infrastructure Control</h1>
            <p className="text-slate-400 text-sm">Manage your stations, configure chargers, and monitor OCPP streams.</p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setIsAddStationOpen(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-cyan-400 hover:bg-white/10 hover:border-cyan-500/50 transition-all flex items-center gap-2 backdrop-blur-md">
              <MapPin size={16} /> New Station
            </button>
            <button onClick={() => setIsAddChargerOpen(true)} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2">
              <Zap size={16} /> Add Charger
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl transition-all">
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Station Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 hide-scrollbar">
        <button 
          onClick={() => setSelectedStationId('all')}
          className={`px-6 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all duration-300 ${
            selectedStationId === 'all' 
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.15)]' 
              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          } border`}
        >
          <div className="flex items-center gap-2"><Box size={16}/> Global Network</div>
        </button>
        {stations?.map(st => (
          <button 
            key={st.id}
            onClick={() => setSelectedStationId(st.id)}
            className={`px-6 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all duration-300 ${
              selectedStationId === st.id 
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.15)]' 
                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            } border`}
          >
            <div className="flex items-center gap-2"><MapPin size={16}/> {st.name}</div>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left: Chargers List */}
        <div className="xl:col-span-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest pl-2 mb-4">Fleet List</h2>
          
          <div className="space-y-4">
            {!filteredChargers || filteredChargers.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 border-dashed rounded-3xl p-10 text-center text-slate-500">
                <AlertCircle size={32} className="mx-auto mb-4 opacity-50 text-slate-400" />
                <p className="text-sm font-medium">No chargers active in this zone.</p>
              </div>
            ) : (
              filteredChargers.map(charger => {
                const isOnline = charger.status === 'online';
                const isSelected = selectedChargerId === charger.id;
                const stationName = stations?.find(s => s.id === charger.stationId)?.name || 'Unassigned';

                return (
                  <div 
                    key={charger.id}
                    onClick={() => setSelectedChargerId(charger.id)}
                    className={`relative overflow-hidden p-5 rounded-3xl border transition-all duration-300 cursor-pointer group ${
                      isSelected 
                        ? 'bg-slate-900/80 border-cyan-500/50 shadow-[0_0_30px_rgba(34,211,238,0.1)]' 
                        : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    {/* Hover Glow */}
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 rounded-full bg-cyan-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>

                    <div className="relative z-10 flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                          {charger.chargePointId}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <MapPin size={12}/> {stationName}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 backdrop-blur-md ${
                        isOnline ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isOnline ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                            </span>
                            ONLINE
                          </>
                        ) : (
                          <>
                            <WifiOff size={10} /> OFFLINE
                          </>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800/50 flex justify-between items-center text-xs text-slate-400">
                      <span className="font-medium bg-slate-800/50 px-2.5 py-1 rounded-lg">{charger.vendor}</span>
                      <span>{charger.model}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Charger Details & Diagnostics */}
        <div className="xl:col-span-8">
          {!activeCharger ? (
            <div className="bg-slate-900/30 border border-slate-800 rounded-3xl h-full min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800/20 via-transparent to-transparent"></div>
              <Cpu size={64} className="text-slate-800 mb-6" />
              <h2 className="text-2xl font-black text-slate-400 mb-2">No Hardware Selected</h2>
              <p className="text-sm text-slate-600">Select a unit from the fleet list to open the diagnostics panel.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              
              {/* Active Charger Header */}
              <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden">
                {/* Circuit background pattern */}
                <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none">
                  <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 50 L100 50 L100 100" stroke="white" strokeWidth="2" fill="none"/>
                    <circle cx="100" cy="100" r="4" fill="white"/>
                    <path d="M150 150 L200 150 L250 100 L300 100" stroke="white" strokeWidth="2" fill="none"/>
                    <circle cx="300" cy="100" r="4" fill="white"/>
                  </svg>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start mb-8 relative z-10">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                        <ServerCrash size={24} className="text-blue-400" />
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tight">{activeCharger.chargePointId}</h2>
                    </div>
                    <p className="text-sm text-slate-400 ml-14">
                      Hardware: <span className="text-slate-300 font-medium">{activeCharger.vendor} {activeCharger.model}</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => handleRemoteCommand('TriggerMessage', { requestedMessage: 'BootNotification' })}
                    className="mt-4 md:mt-0 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors flex items-center gap-2 text-sm font-bold shadow-lg"
                  >
                    <RefreshCw size={16} /> Request Boot
                  </button>
                </div>

                {/* Connectors Status */}
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Connectors Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {[1, 2].map(num => {
                    const conn = activeChargerConnectors.find(c => c.connectorNumber === num);
                    const status = conn?.status || 'Unavailable';
                    
                    let statusConfig = {
                      text: 'text-slate-400',
                      bg: 'bg-slate-800/50',
                      border: 'border-slate-700/50',
                      glow: 'shadow-none'
                    };
                    
                    if (status === 'Available') statusConfig = { text: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.1)]' };
                    if (status === 'Preparing') statusConfig = { text: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', glow: 'shadow-[0_0_15px_rgba(251,191,36,0.1)]' };
                    if (status === 'Charging') statusConfig = { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]' };
                    if (status === 'Faulted') statusConfig = { text: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.1)]' };

                    return (
                      <div key={num} className={`p-5 rounded-2xl border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.glow} transition-all relative overflow-hidden`}>
                        {status === 'Charging' && (
                          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent animate-[shimmer_2s_infinite]"></div>
                        )}
                        <div className="flex justify-between items-center mb-4 relative z-10">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-slate-900 border ${statusConfig.border}`}>
                              <BatteryCharging size={18} className={statusConfig.text} />
                            </div>
                            <span className="font-bold text-white">Gun {num}</span>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${statusConfig.border} ${statusConfig.text} bg-slate-900/50`}>
                            {status}
                          </span>
                        </div>
                        
                        <div className="relative z-10">
                          {conn?.currentSessionId ? (
                            <div className="flex items-center gap-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                              </span>
                              <span className="text-xs font-bold text-cyan-400">Active Charging Session</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-3 bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
                              <div className="h-2 w-2 rounded-full bg-slate-600"></div>
                              <span className="text-xs font-medium text-slate-500">Awaiting Connection</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Remote Actions */}
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Remote Actions</h3>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 1 })} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors">
                    <Key size={14} className="text-emerald-400" /> Unlock Gun 1
                  </button>
                  <button onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 2 })} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors">
                    <Key size={14} className="text-emerald-400" /> Unlock Gun 2
                  </button>
                  <div className="w-px h-8 bg-slate-800 mx-2 self-center"></div>
                  <button onClick={() => handleRemoteCommand('Reset', { type: 'Soft' })} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors">
                    <Power size={14} className="text-amber-400" /> Soft Reset
                  </button>
                  <button onClick={() => handleRemoteCommand('Reset', { type: 'Hard' })} className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors">
                    <Power size={14} /> Hard Reset
                  </button>
                </div>
              </div>

              {/* Terminal Panel */}
              <div className="bg-[#0a0a0a] rounded-3xl border border-slate-800 overflow-hidden flex flex-col h-[500px] shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
                
                <div className="bg-slate-900/80 backdrop-blur-md px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Terminal size={18} className="text-cyan-400" />
                    <h3 className="text-sm font-bold text-slate-200">OCPP Stream</h3>
                    <div className="flex items-center gap-2 ml-4 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded text-[10px] text-green-400 font-bold uppercase tracking-wider">
                      <Radio size={10} className="animate-pulse"/> Live
                    </div>
                  </div>
                  <button onClick={() => clearOcppLogs(activeCharger.chargePointId)} className="text-xs font-bold text-slate-500 hover:text-rose-400 flex items-center gap-1.5 transition-colors">
                    <Trash2 size={14} /> Clear Stream
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto font-mono text-xs space-y-4">
                  {ocppLogs?.map(log => {
                    const isOut = log.direction === 'OUT';
                    const isError = log.messageType === 'CallError';
                    const colorClass = isError ? 'text-rose-400' : isOut ? 'text-cyan-400' : 'text-emerald-400';
                    
                    return (
                      <div key={log.id} className="group hover:bg-white/[0.02] p-2 -mx-2 rounded transition-colors">
                        <div className="flex gap-3 text-slate-500 mb-1">
                          <span className="opacity-50">{new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 })}</span>
                          <span className={`font-bold ${colorClass}`}>[{log.direction}]</span>
                          <span className="text-slate-300 font-semibold">{log.messageType}</span>
                        </div>
                        <div className="pl-20 text-slate-400 break-all leading-relaxed whitespace-pre-wrap">
                          {JSON.stringify(log.payload, null, 2)}
                        </div>
                      </div>
                    );
                  })}
                  {(!ocppLogs || ocppLogs.length === 0) && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                      <Radio size={32} className="animate-pulse opacity-20" />
                      <p className="font-mono">Listening for socket payloads...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Station Modal */}
      {isAddStationOpen && (
        <div className="fixed inset-0 bg-[#030712]/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-md p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <h2 className="text-2xl font-black text-white mb-6">Add New Station</h2>
            <form onSubmit={handleAddStation} className="space-y-5">
              <div>
                <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Station Name</label>
                <input required value={newStation.name} onChange={e => setNewStation({...newStation, name: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-white outline-none transition-colors" placeholder="e.g. Accra Mall Fast Chargers" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Location</label>
                <input required value={newStation.location} onChange={e => setNewStation({...newStation, location: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-white outline-none transition-colors" placeholder="e.g. Accra Mall, Tetteh Quarshie" />
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setIsAddStationOpen(false)} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-cyan-500/20">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Charger Modal */}
      {isAddChargerOpen && (
        <div className="fixed inset-0 bg-[#030712]/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-md p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <h2 className="text-2xl font-black text-white mb-6">Register Charger</h2>
            <form onSubmit={handleAddCharger} className="space-y-5">
              <div>
                <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Charge Point ID</label>
                <input required value={newCharger.charge_point_id} onChange={e => setNewCharger({...newCharger, charge_point_id: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm font-mono text-cyan-400 outline-none transition-colors uppercase" placeholder="SPERO-EV-002" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Assign Station</label>
                <select required value={newCharger.station_id} onChange={e => setNewCharger({...newCharger, station_id: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-white outline-none transition-colors appearance-none">
                  <option value="">-- Select Station --</option>
                  {stations?.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Vendor</label>
                  <input required value={newCharger.vendor} onChange={e => setNewCharger({...newCharger, vendor: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-white outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-2 block">Model</label>
                  <input required value={newCharger.model} onChange={e => setNewCharger({...newCharger, model: e.target.value})} className="w-full bg-black/50 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-white outline-none transition-colors" />
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setIsAddChargerOpen(false)} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-blue-500/20">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
