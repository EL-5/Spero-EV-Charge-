'use client';
import { TopBar } from '@/components/layout/TopBar';
import { formatCurrency } from '@/lib/utils';
import { useSessions, usePayments, useDrivers } from '@/hooks/use-database';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Zap, Users, CreditCard } from 'lucide-react';

export default function AnalyticsPage() {
  const { data: recentSessions } = useSessions({ limit: 200 });
  const { data: allPayments } = usePayments();
  const { data: drivers } = useDrivers();
  
  const sessions = recentSessions || [];
  const payments = allPayments || [];
  
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const totalRevenue = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const avgRev = completedSessions.length > 0 ? totalRevenue / completedSessions.length : 0;
  const totalKwh = completedSessions.reduce((acc, s) => acc + (s.unitsConsumed || 0), 0);
  const avgKwh = completedSessions.length > 0 ? totalKwh / completedSessions.length : 0;
  
  const digitalPaymentsCount = payments.filter(p => p.method !== 'cash').length;
  const digitalRate = payments.length > 0 ? (digitalPaymentsCount / payments.length) * 100 : 0;
  
  const prepaidCount = completedSessions.filter((s: any) => s.mode === 'prepaid').length;
  const postpaidCount = completedSessions.filter((s: any) => s.mode === 'postpaid').length;

  const modeData = [
    { name: 'Prepaid', value: prepaidCount, color: '#7c3aed' },
    { name: 'Postpaid', value: postpaidCount, color: '#1d4ed8' },
  ];

  // Revenue Trend (Last 5 months)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const last5 = Array.from({length: 5}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (4-i), 1);
    return { month: months[d.getMonth()], monthIdx: d.getMonth(), year: d.getFullYear(), revenue: 0 };
  });
  
  payments.forEach(p => {
    const d = new Date(p.createdAt);
    const match = last5.find(m => m.monthIdx === d.getMonth() && m.year === d.getFullYear());
    if (match) match.revenue += (p.amount || 0);
  });
  const revenueData = last5;

  // Payment Method Distribution
  const payMethods = ['cash', 'mtn', 'telecel', 'airteltigo', 'wallet'];
  const methodLabels: Record<string, string> = { cash: 'Cash', mtn: 'MTN', telecel: 'Telecel', airteltigo: 'AirtelTigo', wallet: 'Wallet' };
  const methodColors: Record<string, string> = { cash: '#16a34a', mtn: '#eab308', telecel: '#dc2626', airteltigo: '#2563eb', wallet: '#d97706' };
  
  const paymentDistribution = payMethods.map(m => {
    const count = payments.filter(p => p.method === m).length;
    const value = payments.length > 0 ? (count / payments.length) * 100 : 0;
    return { name: methodLabels[m], value: Math.round(value), color: methodColors[m] };
  }).filter(p => p.value > 0);

  // Attendant Performance
  const attMap: Record<string, any> = {};
  payments.forEach(p => {
    const name = p.attendantName || 'Unknown';
    if (!attMap[name]) attMap[name] = { name, sessions: 0, revenue: 0, cash: 0, momo: 0, wallet: 0 };
    attMap[name].sessions++;
    attMap[name].revenue += (p.amount || 0);
    if (p.method === 'cash') attMap[name].cash += (p.amount || 0);
    else if (p.method === 'wallet') attMap[name].wallet += (p.amount || 0);
    else attMap[name].momo += (p.amount || 0);
  });
  const attendantPerf = Object.values(attMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Peak Hours
  const hours = Array.from({length: 15}, (_, i) => {
    const h = i + 6; // 6am to 8pm
    const label = h > 12 ? `${h-12}pm` : h === 12 ? '12pm' : `${h}am`;
    return { hour: label, h, sessions: 0 };
  });
  completedSessions.forEach(s => {
    const h = new Date(s.createdAt).getHours();
    const match = hours.find(hr => hr.h === h);
    if (match) match.sessions++;
  });
  const hourlyData = hours;

  return (
    <div>
      <TopBar title="Analytics" subtitle="Operational and financial insights" />
      <div className="p-6 space-y-6">

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg. Session Revenue', value: formatCurrency(avgRev), icon: TrendingUp, color: '#1d4ed8', bg: '#eff6ff' },
            { label: 'Avg. kWh per Session', value: `${avgKwh.toFixed(1)} kWh`, icon: Zap, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Total Drivers', value: drivers?.length || 0, icon: Users, color: '#7c3aed', bg: '#f3f0ff' },
            { label: 'Digital Payment Rate', value: `${digitalRate.toFixed(1)}%`, icon: CreditCard, color: '#0891b2', bg: '#e0f2fe' },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="stat-card">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: card.bg }}>
                  <Icon size={18} style={{ color: card.color }} />
                </div>
                <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
                <div className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{card.label}</div>
              </div>
            );
          })}
        </div>

        {/* Revenue + Mode distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="stat-card lg:col-span-2">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Monthly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `₵${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => [`GHS ${Number(v).toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2.5} fill="url(#areaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="stat-card">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Charging Mode Split</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={modeData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={4}>
                  {modeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {modeData.map(item => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                    <span style={{ color: 'var(--muted-foreground)' }}>{item.name}</span>
                  </div>
                  <span className="font-medium">{item.value} sessions</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Peak hours */}
        <div className="stat-card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Peak Charging Hours</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Bar dataKey="sessions" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Attendant performance */}
        <div className="stat-card overflow-hidden">
          <h3 className="font-semibold mb-4 px-0" style={{ color: 'var(--foreground)' }}>Attendant Performance</h3>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Attendant</th>
                  <th>Sessions</th>
                  <th>Total Revenue</th>
                  <th>Cash</th>
                  <th>Mobile Money</th>
                  <th>Wallet</th>
                  <th>Avg per Session</th>
                </tr>
              </thead>
              <tbody>
                {attendantPerf.map(a => (
                  <tr key={a.name}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: '#1d4ed8' }}>{a.name[0]}</div>
                        <span className="font-medium">{a.name}</span>
                      </div>
                    </td>
                    <td>{a.sessions}</td>
                    <td className="font-bold">{formatCurrency(a.revenue)}</td>
                    <td>{formatCurrency(a.cash)}</td>
                    <td>{formatCurrency(a.momo)}</td>
                    <td>{formatCurrency(a.wallet)}</td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{formatCurrency(a.revenue / a.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment distribution chart */}
        <div className="stat-card">
          <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Payment Method Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={paymentDistribution} layout="vertical" barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: 'var(--foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => [`${v}%`, 'Share']} />
              {paymentDistribution.map((entry, i) => (
                <Bar key={i} dataKey="value" fill={entry.color} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
