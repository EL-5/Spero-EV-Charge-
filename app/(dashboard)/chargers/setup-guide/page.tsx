'use client';

import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { 
  BookOpen, HelpCircle, ArrowRight, Radio, Link as LinkIcon, 
  ShieldCheck, CheckCircle2, AlertTriangle, Key, Terminal, Cpu, Zap, Copy, Wifi
} from 'lucide-react';
import { toast } from 'sonner';

export default function OcppSetupGuidePage() {
  // Calculator state
  const [serverIp, setServerIp] = useState('192.168.1.100');
  const [port, setPort] = useState('8080');
  const [chargePointId, setChargePointId] = useState('SPERO-EV-001');
  const [secProfile, setSecProfile] = useState('1');
  const [password, setPassword] = useState('SPERO-SEC-7X9Y2Z');

  // Copy helper
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const wsUrl = `ws://${serverIp}:${port}/ocpp/${chargePointId}`;

  // Tab state for dictionary
  const [dictTab, setDictTab] = useState<'all' | 'lifecycle' | 'charging' | 'commands'>('all');

  const messages = [
    {
      name: 'BootNotification',
      type: 'lifecycle',
      desc: 'Sent by the charger immediately upon boot. Declares hardware properties (Vendor, Model, Serial Number) and requests validation.',
      direction: 'IN (Charger → Server)',
      tip: 'The Server responds with status "Accepted" to authorize connectivity, or "Rejected" if the ChargePointId is not pre-registered in the panel.'
    },
    {
      name: 'Heartbeat',
      type: 'lifecycle',
      desc: 'Sent periodically (e.g., every 60s) by the charger to indicate it is still online and functional.',
      direction: 'IN (Charger → Server)',
      tip: 'Maintains the keep-alive. If a heartbeat is missed by more than 2x the interval, the server flags the node OFFLINE on the dashboard.'
    },
    {
      name: 'StatusNotification',
      type: 'lifecycle',
      desc: 'Notifies the server of state changes in the charger or specific guns (e.g., transitioning from Available to Charging).',
      direction: 'IN (Charger → Server)',
      tip: 'Critical states include: Available, Preparing (plugged in), Charging, Finishing, Faulted, SuspendedEV.'
    },
    {
      name: 'Authorize',
      type: 'charging',
      desc: 'Triggered when a driver swipes an RFID card or plugs in, requesting authorization of their wallet token.',
      direction: 'IN (Charger → Server)',
      tip: 'Server queries the database and verifies if the driver balance is sufficient. Responds with status "Accepted" or "Blocked".'
    },
    {
      name: 'StartTransaction',
      type: 'charging',
      desc: 'Sent by the charger to report that charging has officially started. Allocates a unique transaction index.',
      direction: 'IN (Charger → Server)',
      tip: 'Contains the initial meter value (kWh), connector index, and the authorizing ID token.'
    },
    {
      name: 'MeterValues',
      type: 'charging',
      desc: 'Sends periodic telemetry updates during an active charge session (state of charge %, active kW power delivery, temperature).',
      direction: 'IN (Charger → Server)',
      tip: 'These values drive the glowing dials and live charging telemetry on the diagnostics dashboard.'
    },
    {
      name: 'StopTransaction',
      type: 'charging',
      desc: 'Reports that charging has terminated and the gun has been unplugged.',
      direction: 'IN (Charger → Server)',
      tip: 'Transmits final energy delivered (kWh), termination reason (e.g., Local/Remote Stop, EV Disconnect), and settles session costs.'
    },
    {
      name: 'Reset',
      type: 'commands',
      desc: 'Sent by the server to trigger a remote software restart (Soft Reset) or deep power cycle (Hard Reset) on the hardware.',
      direction: 'OUT (Server → Charger)',
      tip: 'Used by operators to clear faults or reload configurations without visiting the physical station.'
    },
    {
      name: 'UnlockConnector',
      type: 'commands',
      desc: 'Sent by the server to command the gun\'s electronic solenoid latch to release the plugged cable.',
      direction: 'OUT (Server → Charger)',
      tip: 'Crucial for releasing cables stuck in a charger after a faulted session or emergency shutoff.'
    }
  ];

  const filteredMessages = messages.filter(m => {
    if (dictTab === 'all') return true;
    return m.type === dictTab;
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 dark:bg-slate-950 transition-colors duration-300">
      <TopBar 
        title="OCPP Integration & Setup Guide" 
        subtitle="Step-by-step procedures, live connection strings, and protocol diagnostic learning." 
      />

      <div className="flex-1 p-6 space-y-6 max-w-[1400px] w-full mx-auto">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-cyan-900/40 dark:to-indigo-950/40 text-white rounded-3xl p-6 shadow-sm border border-transparent dark:border-slate-800/80 flex flex-col md:flex-row items-center gap-6">
          <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md shrink-0">
            <BookOpen size={40} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-wide">SCMS Network Integration Protocol</h3>
            <p className="text-xs text-blue-100 dark:text-slate-350 mt-1 max-w-2xl leading-relaxed">
              This guide provides operational directives for field technicians and station operators on how to integrate physical EV chargers with the Spero ERP Gateway using standard Open Charge Point Protocol (OCPP 1.6-J).
            </p>
          </div>
        </div>

        {/* Dynamic Calculator & Step-by-Step */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Steps (7 Columns) */}
          <div className="xl:col-span-7 space-y-6">
            
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-6">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-blue-500" /> Physical Setup Directives
              </h3>

              <div className="space-y-6 relative border-l-2 border-slate-100 dark:border-slate-800 ml-3 pl-6">
                
                {/* Step 1 */}
                <div className="relative">
                  <div className="absolute -left-[33px] top-0 w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center border-4 border-white dark:border-slate-900">
                    1
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Pre-Register Charger in SCMS Panel</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Before turning on the physical charger, navigate to the <span className="font-semibold text-blue-600 dark:text-cyan-400">Chargers Dashboard</span>, click <strong>"Add Charger"</strong>, and enter the unique <code>Charge Point ID</code>, assigned hub station, vendor, model, and ocpp settings.
                  </p>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-xl text-[10px] text-slate-400 dark:text-slate-500 mt-2.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 block mb-0.5">Why?</span>
                    The server implements strict whitelist security. Any charger attempting a connection using a Charge Point ID not registered in the panel will have its connection handshake immediately rejected by the Gateway.
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <div className="absolute -left-[33px] top-0 w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center border-4 border-white dark:border-slate-900">
                    2
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Access Physical Charger Admin Console</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Connect your laptop to the physical charger. Chargers usually broadcast a local configuration Wi-Fi hotspot upon power-up, or provide an ethernet administrative service port. Access the configuration page via browser (typically at <code>http://192.168.1.1</code> or similar).
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <div className="absolute -left-[33px] top-0 w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center border-4 border-white dark:border-slate-900">
                    3
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Configure Central System URL (OCPP Endpoint)</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    In the charger's network settings, locate the **OCPP Server Address** or **Central System URL** field. Input the server WebSocket address.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                    Use the <strong className="text-slate-800 dark:text-slate-200">WebSocket Endpoint Generator</strong> on the right to compile the exact URL to paste into your hardware!
                  </p>
                </div>

                {/* Step 4 */}
                <div className="relative">
                  <div className="absolute -left-[33px] top-0 w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center border-4 border-white dark:border-slate-900">
                    4
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Configure Security Profile & Handshake Credentials</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Set the hardware security profile to match the SCMS dashboard configurations:
                  </p>
                  <ul className="list-disc text-[11px] text-slate-500 dark:text-slate-400 mt-2 pl-4 space-y-1.5 leading-relaxed">
                    <li><strong>Security Profile 0 (Unsecured)</strong>: Connects via standard <code>ws://</code> protocol. No client authentication key needed. Recommended only for secure local area networks.</li>
                    <li><strong>Security Profile 1 (Basic Authentication)</strong>: Connects via <code>ws://</code> (or <code>wss://</code>). In the charger's HTTP Basic Auth fields, configure the username as your <code>ChargePointId</code>, and the password matching the registered <code>Basic Auth Password</code>.</li>
                  </ul>
                </div>

                {/* Step 5 */}
                <div className="relative">
                  <div className="absolute -left-[33px] top-0 w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-[10px] font-bold text-white flex items-center justify-center border-4 border-white dark:border-slate-900">
                    5
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Observe Operations Terminal for Verification</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Save hardware settings and reboot the charger. On the SCMS dashboard, select the registered charger and look at the **Live OCPP Stream**. You should immediately see incoming telemetry logs representing the handshakes.
                  </p>
                </div>

              </div>

            </div>

          </div>

          {/* Right Column: Calculator & URL Compiler (5 Columns) */}
          <div className="xl:col-span-5 space-y-6">
            
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-6">
              
              <div>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 leading-none">
                  <LinkIcon size={18} className="text-blue-500" /> WebSocket Endpoint Generator
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">Input your network settings to compile the copyable configuration string.</p>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">ERP Gateway Host IP</label>
                    <input 
                      type="text" 
                      value={serverIp}
                      onChange={e => setServerIp(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Gateway Port</label>
                    <input 
                      type="text" 
                      value={port}
                      onChange={e => setPort(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all"
                      placeholder="8080"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Registered Charge Point ID</label>
                    <input 
                      type="text" 
                      value={chargePointId}
                      onChange={e => setChargePointId(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all uppercase"
                      placeholder="SPERO-EV-001"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Security Profile</label>
                    <select
                      value={secProfile}
                      onChange={e => setSecProfile(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                      <option value="0">Profile 0 (Unsecured WS)</option>
                      <option value="1">Profile 1 (Basic Authentication)</option>
                    </select>
                  </div>
                </div>

                {secProfile === '1' && (
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase mb-1.5 block">Basic Auth Password</label>
                    <input 
                      type="text" 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-white outline-none transition-all"
                    />
                  </div>
                )}

                {/* Compiled string card */}
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 font-mono text-[10px] text-slate-350 space-y-3 shadow-inner">
                  <div>
                    <span className="text-slate-500 block mb-1">// Copy & paste this target address in charger's console:</span>
                    <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-slate-850 select-all">
                      <span className="text-cyan-400 tracking-tight break-all">{wsUrl}</span>
                      <button 
                        type="button" 
                        onClick={() => copyText(wsUrl)}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0 ml-2"
                        title="Copy string"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>

                  {secProfile === '1' && (
                    <div className="border-t border-slate-800/80 pt-2.5">
                      <span className="text-slate-500 block mb-1">// Basic authorization credentials:</span>
                      <div className="p-2.5 rounded bg-black/20 border border-slate-900 text-slate-400 space-y-1.5">
                        <div>Username: <span className="text-white select-all">{chargePointId}</span></div>
                        <div>Password: <span className="text-white select-all">{password}</span></div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* General diagnostics tips card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-3xl shadow-sm space-y-4">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle size={14} className="text-amber-500" /> Operational Diagnostics Checklist
              </h4>
              <div className="space-y-3 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5"></div>
                  <span><strong>LED status indicator</strong>: Yellow blinking lights usually indicate WS handshake attempt; static green indicates fully functional connection.</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5"></div>
                  <span><strong>Ping responses</strong>: If the charger connects but fails to send MeterValues, check if OCPP WebSocket keep-alive frames are disabled or set beyond 90s.</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5"></div>
                  <span><strong>Firewall rules</strong>: Ensure the Gateway host's firewall permits incoming TCP traffic on the designated port (e.g. 8080).</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Dictionary Section */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Terminal size={18} className="text-blue-500" /> OCPP Message Dictionary
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Learn to decode standard payloads passing through the OCPP stream terminal.</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-x-auto max-w-full">
              {(['all', 'lifecycle', 'charging', 'commands'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDictTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all uppercase ${
                    dictTab === tab 
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-slate-800/80' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Messages */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
            {filteredMessages.map(msg => (
              <div 
                key={msg.name}
                className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-900/60 rounded-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 font-mono tracking-tight">{msg.name}</span>
                    <span className="text-[8px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-cyan-400 px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest">
                      {msg.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium mb-3.5">{msg.desc}</p>
                </div>
                
                <div className="pt-3.5 border-t border-slate-150 dark:border-slate-900 text-[10px] space-y-2.5">
                  <div>
                    <span className="text-slate-400 block uppercase tracking-wider font-bold">Direction</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-350">{msg.direction}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase tracking-wider font-bold">Diagnostics Tip</span>
                    <span className="text-slate-600 dark:text-slate-400 leading-normal">{msg.tip}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}
