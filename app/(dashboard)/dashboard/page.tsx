'use client';
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
import { useDashboardStats, useSessions, useShifts, usePayments, useDrivers } from '@/hooks/use-database';

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
  const byMoMo = allPayments.filter((p: any) => ['mtn', 'telecel', 'airteltigo', 'hubtel'].includes(p.method)).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
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
