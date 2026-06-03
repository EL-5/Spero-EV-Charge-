'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency, getStatusColor, getStatusLabel, formatDateTime } from '@/lib/utils';
import {
  TrendingUp, Zap, Clock, CreditCard, Wallet, AlertTriangle,
  DollarSign, Activity, Users, ArrowUpRight, ArrowDownRight, BarChart3, Smartphone
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useDashboardStats, useSessions, useShifts, usePayments, useDrivers, useStations, useStationGridMetrics } from '@/hooks/use-database';

// --- Smart Meter Grid Load Monitor Component ---
function GridLoadMonitor() {
  const { data: stations } = useStations();
  const [selectedStationId, setSelectedStationId] = useState<string>('all');
  const { data: gridMetrics } = useStationGridMetrics(selectedStationId);

  const activeMetrics = gridMetrics || [];
  const latestMetric = activeMetrics[activeMetrics.length - 1];

  const currentKw = latestMetric?.activePowerKw || 0;
  const CAPACITY_LIMIT_KW = 100.0;
  const utilizationPct = Math.min(100, (currentKw / CAPACITY_LIMIT_KW) * 100);
  const isOverloaded = utilizationPct >= 85;

  return (
    <div className="stat-card space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            <Activity size={18} className="text-blue-600 animate-pulse" /> Live Grid Load Monitor
          </h3>
          <p className="text-xs text-slate-500">Real-time station transformer and 3-phase consumption analytics</p>
        </div>

        <select
          value={selectedStationId}
          onChange={(e) => setSelectedStationId(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
        >
          <option value="all">All Stations (Combined)</option>
          {stations?.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
      </div>

      {latestMetric ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
            <div className="text-sm font-semibold text-slate-500 mb-2">Grid Utilization</div>
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="72" cy="72" r="60" stroke="#f1f5f9" strokeWidth="12" fill="transparent" />
                <circle
                  cx="72"
                  cy="72"
                  r="60"
                  stroke={isOverloaded ? '#dc2626' : '#2563eb'}
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray={376.99}
                  strokeDashoffset={376.99 - (376.99 * utilizationPct) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-900">{utilizationPct.toFixed(0)}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">of {CAPACITY_LIMIT_KW}kW</span>
              </div>
            </div>

            {isOverloaded && (
              <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full animate-bounce">
                <AlertTriangle size={12} /> CRITICAL GRID LOAD
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Power</span>
                <div className="text-lg font-black text-slate-800 mt-0.5">{currentKw.toFixed(2)} kW</div>
              </div>
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Avg Voltage</span>
                <div className="text-lg font-black text-slate-800 mt-0.5">
                  {(latestMetric.voltageV.reduce((a: number, b: number) => a + b, 0) / 3).toFixed(1)} V
                </div>
              </div>
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Current</span>
                <div className="text-lg font-black text-slate-800 mt-0.5">
                  {latestMetric.currentA.reduce((a: number, b: number) => a + b, 0).toFixed(1)} A
                </div>
              </div>
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Energy</span>
                <div className="text-lg font-black text-slate-800 mt-0.5">{latestMetric.totalEnergyKwh.toFixed(1)} kWh</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">3-Phase Balance Metrics</div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="border-r border-slate-200/60">
                  <div className="text-[10px] font-extrabold text-blue-600">PHASE L1</div>
                  <div className="text-xs font-black text-slate-850 mt-1">{latestMetric.voltageV[0]}V / {latestMetric.currentA[0]}A</div>
                </div>
                <div className="border-r border-slate-200/60">
                  <div className="text-[10px] font-extrabold text-indigo-600">PHASE L2</div>
                  <div className="text-xs font-black text-slate-850 mt-1">{latestMetric.voltageV[1]}V / {latestMetric.currentA[1]}A</div>
                </div>
                <div>
                  <div className="text-[10px] font-extrabold text-purple-600">PHASE L3</div>
                  <div className="text-xs font-black text-slate-850 mt-1">{latestMetric.voltageV[2]}V / {latestMetric.currentA[2]}A</div>
                </div>
              </div>
            </div>

            <div className="h-[120px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeMetrics}>
                  <defs>
                    <linearGradient id="gridPowerGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    formatter={(value) => [`${value} kW`, 'Grid Load']}
                    labelFormatter={(label) => new Date(activeMetrics[label]?.recordedAt).toLocaleTimeString()}
                  />
                  <Area type="monotone" dataKey="activePowerKw" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#gridPowerGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-slate-500">
          <Activity size={24} className="mx-auto mb-2 text-slate-400 animate-pulse" />
          <div className="text-sm font-semibold">No grid telemetry data available</div>
          <div className="text-xs text-slate-400 mt-1">Start the Smart Meter Poller script to begin streaming telemetry.</div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAttendant = user?.role === 'attendant';
  const isManager = user?.role === 'manager';
  const isFinance = user?.role === 'finance';
  const isAccountant = user?.role === 'accountant';
  const isSuperAdmin = user?.role === 'super_admin';
  const { data: liveStats, isLoading } = useDashboardStats(isAttendant ? { attendantId: user?.id } : {});
  const { data: liveSessions } = useSessions({ limit: 10, attendantId: isAttendant ? user?.id : undefined });
  const { data: shifts } = useShifts();
  const { data: payments } = usePayments(isAttendant ? { attendantId: user?.id } : {});
  const { data: drivers } = useDrivers();
  
  const activeShift = shifts?.find((s: any) => s.status === 'active' && s.attendantId === user?.id);
  const recentSessions = liveSessions || [];

  // Filter sessions for attendants if needed (optional)
  const displaySessions = user?.role === 'attendant' 
    ? recentSessions.filter((s: any) => s.attendantId === user?.id)
    : recentSessions;

  const stats = liveStats || {
    revenueToday: 0, totalSessions: 0, activeSessions: 0, pendingPayments: 0,
    totalDrivers: 0, totalVehicles: 0, unitsSoldToday: 0,
  };
  
  const allPayments = payments || [];
  const byCash = allPayments.filter((p: any) => p.method === 'cash').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const byMoMo = allPayments.filter((p: any) => ['mtn', 'telecel', 'airteltigo'].includes(p.method)).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const byWallet = allPayments.filter((p: any) => p.method === 'wallet').reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const totalRevenue = allPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  if (isAttendant) {
    return (
      <div>
        <TopBar title="Attendant Dashboard" subtitle={`Welcome back, ${user?.name}`} />
        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/sessions" className="stat-card hover:border-blue-400 transition-colors flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Zap size={24} />
              </div>
              <div>
                <div className="font-bold text-lg">Start New Session</div>
                <div className="text-sm text-slate-500">Record a charging event</div>
              </div>
            </Link>
            <Link href="/shifts" className="stat-card hover:border-orange-400 transition-colors flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <Clock size={24} />
              </div>
              <div>
                <div className="font-bold text-lg">{activeShift ? 'Manage Active Shift' : 'Start New Shift'}</div>
                <div className="text-sm text-slate-500">{activeShift ? 'View status and collections' : 'Begin your daily work'}</div>
              </div>
            </Link>
            <Link href="/drivers" className="stat-card hover:border-purple-400 transition-colors flex items-center gap-4 group">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Users size={24} />
              </div>
              <div>
                <div className="font-bold text-lg">Lookup Driver</div>
                <div className="text-sm text-slate-500">Check balance and history</div>
              </div>
            </Link>
          </div>

          {/* Revenue Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={16} className="text-blue-600" />
                <div className="text-xl font-bold text-blue-600">{formatCurrency(totalRevenue)}</div>
              </div>
              <div className="text-sm text-slate-500">Total Revenue</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={16} className="text-emerald-600" />
                <div className="text-xl font-bold text-emerald-600">{formatCurrency(byCash)}</div>
              </div>
              <div className="text-sm text-slate-500">Cash Collections</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone size={16} className="text-orange-500" />
                <div className="text-xl font-bold text-orange-500">{formatCurrency(byMoMo)}</div>
              </div>
              <div className="text-sm text-slate-500">Mobile Money</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={16} className="text-purple-600" />
                <div className="text-xl font-bold text-purple-600">{formatCurrency(byWallet)}</div>
              </div>
              <div className="text-sm text-slate-500">Digital / Wallet</div>
            </div>
          </div>

          {/* Operational Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="text-sm text-slate-500 mb-1">Shift Status</div>
              <div className={`text-xl font-bold ${activeShift ? 'text-green-600' : 'text-slate-400'}`}>
                {activeShift ? 'Active' : 'No Active Shift'}
              </div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-slate-500 mb-1">Total Sessions</div>
              <div className="text-xl font-bold">{stats.totalSessions}</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-slate-500 mb-1">Shift Duration</div>
              <div className="text-xl font-bold">{activeShift ? 'Running...' : '—'}</div>
            </div>
            <div className="stat-card">
              <div className="text-sm text-slate-500 mb-1">Pending Payments</div>
              <div className="text-xl font-bold text-red-600">{displaySessions.filter((s: any) => s.status === 'active').length}</div>
            </div>
          </div>

          {/* Recent sessions */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Your Recent Sessions</h3>
              <Link href="/sessions" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Driver</th>
                    <th>Vehicle</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySessions.slice(0, 5).map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs">{s.receiptNumber}</td>
                      <td className="font-medium">{s.driverName || s.driverId || '—'}</td>
                      <td className="font-mono text-xs">{s.vehiclePlate || s.vehicleId || '—'}</td>
                      <td>
                        <span className={`badge ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {s.mode}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusColor(s.status)}`}>{getStatusLabel(s.status)}</span>
                      </td>
                      <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">{formatDateTime(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isManager) {
    const attendantPerformance = (() => {
      const map: Record<string, number> = {};
      allPayments.forEach(p => {
        const name = p.attendantName || 'Unknown';
        map[name] = (map[name] || 0) + (p.amount || 0);
      });
      return Object.entries(map).map(([name, revenue]) => ({ name, revenue }));
    })();

    return (
      <div>
        <TopBar title="Operations Control" subtitle="Real-time monitoring and staff oversight" />
        <div className="p-6 space-y-6">
          {/* Core Operational Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="stat-card border-l-4 border-blue-600">
              <div className="text-sm text-slate-500 mb-1">Active Charging</div>
              <div className="text-2xl font-bold">{stats.activeSessions} Units</div>
            </div>
            <div className="stat-card border-l-4 border-orange-500">
              <div className="text-sm text-slate-500 mb-1">Active Shifts</div>
              <div className="text-2xl font-bold">{shifts?.filter((s:any) => s.status === 'active').length || 0} Staff</div>
            </div>
            <div className="stat-card border-l-4 border-emerald-600">
              <div className="text-sm text-slate-500 mb-1">Daily Total</div>
              <div className="text-2xl font-bold">{stats.totalSessions} Sessions</div>
            </div>
            <div className="stat-card border-l-4 border-purple-600">
              <div className="text-sm text-slate-500 mb-1">Drivers Handled</div>
              <div className="text-2xl font-bold">{stats.totalDrivers}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Live Grid Load Monitor */}
            <GridLoadMonitor />

            {/* Attendant Performance */}
            <div className="stat-card">
              <h3 className="font-semibold mb-4">Attendant Performance (Revenue)</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendantPerformance} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{fontSize: 12}} />
                    <Tooltip cursor={{fill: 'transparent'}} formatter={(v) => formatCurrency(v as number)} />
                    <Bar dataKey="revenue" fill="#1d4ed8" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Live Activity Feed - Full Width for better visibility */}
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Global Activity Feed</h3>
                <Activity size={16} className="text-blue-600 animate-pulse" />
              </div>
              <div className="space-y-3">
                {recentSessions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-sm">
                        <Zap size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{s.driverName || 'Unknown Driver'}</div>
                        <div className="text-xs text-slate-500">{s.vehiclePlate} • {s.mode.toUpperCase()} • {s.attendantName || 'Auto'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-700">{formatCurrency(s.totalAmount || 0)}</div>
                        <div className="text-[10px] text-slate-400">{formatDateTime(s.createdAt)}</div>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${getStatusColor(s.status)}`}>
                        {getStatusLabel(s.status)}
                      </div>
                    </div>
                  </div>
                ))}
                {recentSessions.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-sm">No activity recorded today.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFinance) {
    const revenueByChannel = [
      { name: 'Cash', value: byCash, color: '#16a34a' },
      { name: 'Mobile Money', value: byMoMo, color: '#eab308' },
      { name: 'Wallet', value: byWallet, color: '#7c3aed' },
    ];

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const last5 = Array.from({length: 5}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (4-i), 1);
      return { month: months[d.getMonth()], monthIdx: d.getMonth(), year: d.getFullYear(), rev: 0 };
    });
    
    allPayments.forEach(p => {
      const d = new Date(p.createdAt);
      const match = last5.find(m => m.monthIdx === d.getMonth() && m.year === d.getFullYear());
      if (match) match.rev += (p.amount || 0);
    });

    return (
      <div>
        <TopBar title="Financial Strategy Dashboard" subtitle="Monitoring liquidity, trends and digital adoption" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card" style={{ borderLeft: '4px solid #1d4ed8' }}>
              <div className="text-sm text-slate-500 mb-1">Monthly Revenue (May)</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</div>
              <div className="text-xs text-blue-600 mt-1 flex items-center gap-1"><TrendingUp size={12}/> +12% vs April</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #7c3aed' }}>
              <div className="text-sm text-slate-500 mb-1">Total Liquidity</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalRevenue + (drivers?.reduce((sum:any, d:any) => sum + d.walletBalance, 0) || 0))}</div>
              <div className="text-xs text-slate-400 mt-1">Cash + Wallet Assets</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #eab308' }}>
              <div className="text-sm text-slate-500 mb-1">Digital Adoption</div>
              <div className="text-2xl font-bold text-slate-900">{totalRevenue > 0 ? ((byMoMo + byWallet) / totalRevenue * 100).toFixed(1) : 0}%</div>
              <div className="text-xs text-orange-600 mt-1 flex items-center gap-1"><Smartphone size={12}/> Growing share</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
              <div className="text-sm text-slate-500 mb-1">Station Profitability</div>
              <div className="text-2xl font-bold text-green-600">High</div>
              <div className="text-xs text-slate-400 mt-1">Based on session volume</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="stat-card lg:col-span-2">
              <h3 className="font-semibold mb-4">Monthly Revenue Trend</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={last5}>
                    <defs>
                      <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <Tooltip cursor={{stroke: '#1d4ed8', strokeWidth: 1}} formatter={(v) => formatCurrency(v as number)} />
                    <Area type="monotone" dataKey="rev" stroke="#1d4ed8" fillOpacity={1} fill="url(#finGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="stat-card lg:col-span-1">
              <h3 className="font-semibold mb-4">Collection Channels</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenueByChannel} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {revenueByChannel.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAccountant) {
    const netRevenue = totalRevenue * 0.985; // Example 1.5% processing fee estimation
    const totalReceivables = drivers?.reduce((sum:any, d:any) => sum + d.debtBalance, 0) || 0;
    
    return (
      <div>
        <TopBar title="Reconciliation & Audit Control Centre" subtitle="In-depth ledger auditing and debt management" />
        <div className="p-6 space-y-6">
          {/* Accountant High-Depth Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
              <div className="text-sm text-slate-500 mb-1">Net Revenue (Est.)</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(netRevenue)}</div>
              <div className="text-xs text-slate-400 mt-1">Post 1.5% tx fees</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
              <div className="text-sm text-slate-500 mb-1">Active Receivables</div>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(totalReceivables)}</div>
              <div className="text-xs text-red-500 mt-1 flex items-center gap-1 font-medium"><AlertTriangle size={12}/> Needs recovery</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #7c3aed' }}>
              <div className="text-sm text-slate-500 mb-1">Unreconciled Cash</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(byCash)}</div>
              <div className="text-xs text-slate-400 mt-1">Awaiting bank deposit</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #1d4ed8' }}>
              <div className="text-sm text-slate-500 mb-1">Audit Score</div>
              <div className="text-2xl font-bold text-blue-600">98%</div>
              <div className="text-xs text-green-600 mt-1">High data integrity</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Debt vs Collection Chart */}
            <div className="stat-card lg:col-span-1">
              <h3 className="font-semibold mb-4">Debt Recovery Pipeline</h3>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Revenue', value: totalRevenue, fill: '#16a34a' },
                    { name: 'Debt', value: totalReceivables, fill: '#dc2626' }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => formatCurrency(v as number)} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-center">Comparison of received revenue vs outstanding arrears</p>
            </div>

            {/* Right: Detailed Ledger Feed */}
            <div className="stat-card lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">High-Value Transaction Audit</h3>
                <div className="flex gap-2">
                  <Link href="/payments" className="text-xs text-blue-600 font-medium">View Full Ledger</Link>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Entity</th>
                      <th>Method</th>
                      <th>Gross Amount</th>
                      <th>Net (Est)</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPayments.slice(0, 7).map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs font-bold text-blue-600">{p.receiptNumber || '—'}</td>
                        <td className="font-medium text-sm">{p.driverName || 'Walk-in'}</td>
                        <td>
                          <span className={`badge ${p.method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {p.method.toUpperCase()}
                          </span>
                        </td>
                        <td className="font-bold">{formatCurrency(p.amount)}</td>
                        <td className="text-slate-400 text-xs">{formatCurrency(p.amount * 0.985)}</td>
                        <td className="text-[10px] text-slate-400">{formatDateTime(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Super Admin / Manager View (Existing)
  const statCards = [
    { label: 'Revenue Today', value: formatCurrency(stats.revenueToday || 0), icon: DollarSign, color: '#1d4ed8', bg: '#eff6ff', trend: null },
    { label: 'Total Sessions', value: (stats.totalSessions || 0).toString(), icon: Zap, color: '#7c3aed', bg: '#f3f0ff', trend: null },
    { label: 'Active Sessions', value: (stats.activeSessions || 0).toString(), icon: Activity, color: '#d97706', bg: '#fef3c7', trend: null },
    { label: 'Pending Payments', value: (stats.pendingPayments || 0).toString(), icon: Clock, color: '#dc2626', bg: '#fee2e2', trend: null },
    { label: 'kWh Sold Today', value: (stats.unitsSoldToday || 0).toFixed(1), icon: Activity, color: '#10b981', bg: '#ecfdf5', trend: null },
    { label: 'Total Drivers', value: (stats.totalDrivers || 0).toString(), icon: Users, color: '#059669', bg: '#ecfdf5', trend: null },
    { label: 'Total Vehicles', value: (stats.totalVehicles || 0).toString(), icon: Zap, color: '#2563eb', bg: '#eff6ff', trend: null },
  ];

  return (
    <div>
      <TopBar title="Admin Dashboard" subtitle="Overview of your charging operations" />
      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: card.bg }}>
                    <Icon size={18} style={{ color: card.color }} />
                  </div>
                </div>
                <div className="text-lg font-bold leading-tight" style={{ color: 'var(--foreground)' }}>{card.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{card.label}</div>
              </div>
            );
          })}
        </div>

        {/* Charts & Table (Existing) */}
        <div className="grid grid-cols-1 gap-6">
          {/* Live Grid Load Monitor */}
          <GridLoadMonitor />

          <div className="stat-card">
            <h3 className="font-semibold mb-4">Recent Global Sessions</h3>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th><th>Driver</th><th>Mode</th><th>Status</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.slice(0, 5).map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs text-blue-600 font-bold">{s.receiptNumber}</td>
                      <td className="font-medium text-slate-700">{s.driverName || s.driverId || '—'}</td>
                      <td className="capitalize text-slate-500">{s.mode}</td>
                      <td><span className={`badge ${getStatusColor(s.status)}`}>{getStatusLabel(s.status)}</span></td>
                      <td className="text-[10px] text-slate-400 font-medium">{formatDateTime(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="stat-card">
            <h3 className="font-semibold mb-4">Session Distribution</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Active', count: recentSessions.filter(s => s.status === 'active').length },
                  { name: 'Pending', count: recentSessions.filter(s => s.status === 'active' || s.status === 'pending_payment').length },
                  { name: 'Completed', count: recentSessions.filter(s => s.status === 'completed').length },
                  { name: 'Cancelled', count: recentSessions.filter(s => s.status === 'cancelled').length },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12 }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
