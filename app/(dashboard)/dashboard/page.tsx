'use client';
import { TopBar } from '@/components/layout/TopBar';
import { mockDashboardStats, mockRevenueData, mockMonthlyRevenue, mockPaymentDistribution, mockSessions } from '@/lib/mock-data';
import { formatCurrency, getStatusColor, getStatusLabel, formatDateTime } from '@/lib/utils';
import {
  TrendingUp, Zap, Clock, CreditCard, Wallet, AlertTriangle,
  DollarSign, Activity, Users, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import Link from 'next/link';

const stats = mockDashboardStats;

const statCards = [
  { label: 'Revenue Today', value: formatCurrency(stats.revenueToday), icon: DollarSign, color: '#1d4ed8', bg: '#eff6ff', trend: '+12%' },
  { label: 'Revenue This Month', value: formatCurrency(stats.revenueThisMonth), icon: TrendingUp, color: '#16a34a', bg: '#dcfce7', trend: '+8%' },
  { label: 'Total Sessions', value: stats.totalSessions.toString(), icon: Zap, color: '#7c3aed', bg: '#f3f0ff', trend: '+5%' },
  { label: 'Active Sessions', value: stats.activeSessions.toString(), icon: Activity, color: '#d97706', bg: '#fef3c7', trend: null },
  { label: 'Pending Payments', value: formatCurrency(stats.pendingPayments), icon: Clock, color: '#dc2626', bg: '#fee2e2', trend: null },
  { label: 'Total kWh Sold', value: `${stats.totalKwhSold.toLocaleString()} kWh`, icon: Zap, color: '#0891b2', bg: '#e0f2fe', trend: '+3%' },
  { label: 'Wallet Balances', value: formatCurrency(stats.walletBalancesHeld), icon: Wallet, color: '#7c3aed', bg: '#f3f0ff', trend: null },
  { label: 'Outstanding Debts', value: formatCurrency(stats.outstandingDebts), icon: AlertTriangle, color: '#dc2626', bg: '#fee2e2', trend: null },
  { label: 'Cash Revenue', value: formatCurrency(stats.cashRevenue), icon: DollarSign, color: '#16a34a', bg: '#dcfce7', trend: null },
  { label: 'Hubtel Revenue', value: formatCurrency(stats.hubtelRevenue), icon: CreditCard, color: '#0891b2', bg: '#e0f2fe', trend: null },
  { label: 'Paystack Revenue', value: formatCurrency(stats.paystackRevenue), icon: CreditCard, color: '#7c3aed', bg: '#f3f0ff', trend: null },
  { label: 'Active Shifts', value: stats.activeShifts.toString(), icon: Users, color: '#d97706', bg: '#fef3c7', trend: null },
];

export default function DashboardPage() {
  return (
    <div>
      <TopBar title="Dashboard" subtitle="Overview of your charging operations" />
      <div className="p-6 space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="stat-card">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: card.bg }}
                  >
                    <Icon size={18} style={{ color: card.color }} />
                  </div>
                  {card.trend && (
                    <span className="text-xs font-medium" style={{ color: '#16a34a' }}>
                      <ArrowUpRight size={12} className="inline" />{card.trend}
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
                  {card.value}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{card.label}</div>
              </div>
            );
          })}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue chart */}
          <div className="stat-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Weekly Revenue</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>This Week</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mockRevenueData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `₵${v}`} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(v) => [`GHS ${Number(v ?? 0).toLocaleString()}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Payment distribution */}
          <div className="stat-card">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Payment Methods</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={mockPaymentDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {mockPaymentDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v ?? 0}%`, 'Share']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {mockPaymentDistribution.map(item => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                    <span style={{ color: 'var(--muted-foreground)' }}>{item.name}</span>
                  </div>
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly revenue */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Monthly Revenue Trend</h3>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Last 5 months</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={mockMonthlyRevenue} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(v) => [`GHS ${Number(v ?? 0).toLocaleString()}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent sessions */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recent Sessions</h3>
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
                  <th>Units</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {mockSessions.slice(0, 5).map(s => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.receiptNumber}</td>
                    <td className="font-medium">{s.driverName}</td>
                    <td className="font-mono text-xs">{s.vehiclePlate}</td>
                    <td>
                      <span className={`badge ${s.mode === 'prepaid' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {s.mode}
                      </span>
                    </td>
                    <td>{s.unitsConsumed ? `${s.unitsConsumed} kWh` : s.targetUnits ? `~${s.targetUnits?.toFixed(1)} kWh` : '—'}</td>
                    <td className="font-medium">{s.totalAmount ? formatCurrency(s.totalAmount) : s.prepaidAmount ? formatCurrency(s.prepaidAmount) : '—'}</td>
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
