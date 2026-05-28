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
  MapPin, Box, Unlock
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
    <div className="space-y-6 animate-fade-in">
      <TopBar title="Infrastructure" subtitle="Manage Stations, Chargers, and OCPP Metrics" />

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2">
          <button 
            onClick={() => setSelectedStationId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${
              selectedStationId === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:text-white'
            }`}
          >
            All Stations
          </button>
          {stations?.map(st => (
            <button 
              key={st.id}
              onClick={() => setSelectedStationId(st.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-2 ${
                selectedStationId === st.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:text-white'
              }`}
            >
              <MapPin size={12} /> {st.name}
            </button>
          ))}
          <button onClick={() => setIsAddStationOpen(true)} className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1e293b] border border-dashed border-[#475569] text-blue-400 hover:bg-[#334155] flex items-center gap-1 whitespace-nowrap">
            <Plus size={14} /> Add Station
          </button>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => setIsAddChargerOpen(true)} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2">
            <Plus size={14} /> Add Charger
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2">
            <Settings size={14} /> Gateway
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Chargers List */}
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Zap size={16} className="text-blue-400"/> Chargers</h2>
          
          {!filteredChargers || filteredChargers.length === 0 ? (
            <div className="bg-[#1e293b]/50 border border-[#334155] border-dashed rounded-2xl p-8 text-center text-[#94a3b8]">
              <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No chargers found in this station.</p>
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
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-[#1e293b] border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
                      : 'bg-[#0f172a] border-[#334155] hover:border-[#475569]'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        {charger.chargePointId}
                      </h3>
                      <p className="text-[10px] text-[#94a3b8] mt-1 flex items-center gap-1"><MapPin size={10}/> {stationName}</p>
                    </div>
                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      isOnline ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {charger.status}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#334155] flex justify-between text-[10px] text-[#94a3b8]">
                    <span>{charger.vendor} {charger.model}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Charger Details & Diagnostics */}
        <div className="lg:col-span-8 space-y-6">
          {!activeCharger ? (
            <div className="bg-[#1e293b]/30 border border-[#334155] rounded-3xl p-12 text-center h-[600px] flex flex-col items-center justify-center">
              <Box size={48} className="text-[#334155] mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Select a Charger</h2>
              <p className="text-sm text-[#94a3b8]">Click on a charger from the list to view live diagnostics, connectors, and send OCPP commands.</p>
            </div>
          ) : (
            <>
              {/* Active Charger Header */}
              <div className="bg-[#1e293b] rounded-2xl p-6 border border-[#334155]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-black text-white">{activeCharger.chargePointId}</h2>
                    <p className="text-xs text-[#94a3b8] mt-1">{activeCharger.vendor} {activeCharger.model}</p>
                  </div>
                  <button 
                    onClick={() => handleRemoteCommand('TriggerMessage', { requestedMessage: 'BootNotification' })}
                    className="p-2 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] rounded-xl text-[#94a3b8] transition-colors"
                    title="Request Boot Notification"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>

                {/* Connectors Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(num => {
                    const conn = activeChargerConnectors.find(c => c.connectorNumber === num);
                    const status = conn?.status || 'Unavailable';
                    
                    let statusColor = 'text-[#94a3b8]';
                    let bgColor = 'bg-[#0f172a]';
                    
                    if (status === 'Available') { statusColor = 'text-green-400'; bgColor = 'bg-green-500/5'; }
                    if (status === 'Preparing') { statusColor = 'text-yellow-400'; bgColor = 'bg-yellow-500/5'; }
                    if (status === 'Charging') { statusColor = 'text-cyan-400'; bgColor = 'bg-cyan-500/5'; }
                    if (status === 'Faulted') { statusColor = 'text-red-400'; bgColor = 'bg-red-500/5'; }

                    return (
                      <div key={num} className={`p-4 rounded-xl border border-[#334155] ${bgColor}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold text-white">Connector {num}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-current/20 ${statusColor}`}>
                            {status}
                          </span>
                        </div>
                        {conn?.currentSessionId ? (
                          <div className="text-[10px] text-cyan-400 flex items-center gap-1">
                            <Activity size={10} /> Active Session Running
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#475569]">Idle</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Remote Commands */}
                <div className="mt-6 pt-6 border-t border-[#334155]">
                  <h3 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-4">Remote Commands</h3>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleRemoteCommand('Reset', { type: 'Soft' })} className="px-4 py-2 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-2">
                      <Power size={12} className="text-yellow-400" /> Soft Reset
                    </button>
                    <button onClick={() => handleRemoteCommand('Reset', { type: 'Hard' })} className="px-4 py-2 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-2">
                      <Power size={12} className="text-red-400" /> Hard Reset
                    </button>
                    <button onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 1 })} className="px-4 py-2 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-2">
                      <Unlock size={12} className="text-blue-400" /> Unlock Gun 1
                    </button>
                    <button onClick={() => handleRemoteCommand('UnlockConnector', { connectorId: 2 })} className="px-4 py-2 bg-[#0f172a] hover:bg-[#334155] border border-[#334155] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-2">
                      <Unlock size={12} className="text-blue-400" /> Unlock Gun 2
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Logs */}
              <div className="bg-[#0f172a] rounded-2xl border border-[#334155] overflow-hidden flex flex-col h-[400px]">
                <div className="bg-[#1e293b] px-4 py-3 border-b border-[#334155] flex justify-between items-center">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Terminal size={14} className="text-green-400" /> Live Diagnostics Terminal
                  </h3>
                  <button onClick={() => clearOcppLogs(activeCharger.chargePointId)} className="text-[10px] text-[#94a3b8] hover:text-white flex items-center gap-1">
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto font-mono text-[10px] space-y-2">
                  {ocppLogs?.map(log => {
                    const isOut = log.direction === 'OUT';
                    const isError = log.messageType === 'CallError';
                    const colorClass = isError ? 'text-red-400' : isOut ? 'text-blue-400' : 'text-green-400';
                    return (
                      <div key={log.id} className="border-b border-[#1e293b] pb-2 last:border-0">
                        <div className="flex gap-2 text-[#475569] mb-1">
                          <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                          <span className={`font-bold ${colorClass}`}>[{log.direction}]</span>
                          <span className="text-[#cbd5e1]">{log.messageType}</span>
                        </div>
                        <div className="pl-16 text-[#94a3b8] break-all">
                          {JSON.stringify(log.payload)}
                        </div>
                      </div>
                    );
                  })}
                  {(!ocppLogs || ocppLogs.length === 0) && (
                    <div className="text-center text-[#475569] py-8">Waiting for WebSocket packets...</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Station Modal */}
      {isAddStationOpen && (
        <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-black text-white mb-4">Add New Station</h2>
            <form onSubmit={handleAddStation} className="space-y-4">
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">STATION NAME</label>
                <input required value={newStation.name} onChange={e => setNewStation({...newStation, name: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white" placeholder="e.g. Accra Mall Fast Chargers" />
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">LOCATION</label>
                <input required value={newStation.location} onChange={e => setNewStation({...newStation, location: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white" placeholder="e.g. Accra Mall, Tetteh Quarshie" />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setIsAddStationOpen(false)} className="flex-1 py-3 bg-[#0f172a] text-white font-bold rounded-xl border border-[#334155]">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">Save Station</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Charger Modal */}
      {isAddChargerOpen && (
        <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-black text-white mb-4">Register New Charger</h2>
            <form onSubmit={handleAddCharger} className="space-y-4">
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">CHARGE POINT ID</label>
                <input required value={newCharger.charge_point_id} onChange={e => setNewCharger({...newCharger, charge_point_id: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm font-mono text-white" placeholder="e.g. SPERO-EV-002" />
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold">ASSIGN TO STATION</label>
                <select required value={newCharger.station_id} onChange={e => setNewCharger({...newCharger, station_id: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white">
                  <option value="">-- Select Station --</option>
                  {stations?.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-[#94a3b8] font-bold">VENDOR</label>
                  <input required value={newCharger.vendor} onChange={e => setNewCharger({...newCharger, vendor: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white" />
                </div>
                <div>
                  <label className="text-[10px] text-[#94a3b8] font-bold">MODEL</label>
                  <input required value={newCharger.model} onChange={e => setNewCharger({...newCharger, model: e.target.value})} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setIsAddChargerOpen(false)} className="flex-1 py-3 bg-[#0f172a] text-white font-bold rounded-xl border border-[#334155]">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
