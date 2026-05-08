'use client';
import { TopBar } from '@/components/layout/TopBar';
import { mockRevenueData, mockMonthlyRevenue, mockPaymentDistribution, mockSessions } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Zap, Users, CreditCard } from 'lucide-react';

const prepaidCount = mockSessions.filter(s => s.mode === 'prepaid').length;
const postpaidCount = mockSessions.filter(s => s.mode === 'postpaid').length;

const modeData = [
  { name: 'Prepaid', value: prepaidCount, color: '#7c3aed' },
  { name: 'Postpaid', value: postpaidCount, color: '#1d4ed8' },
];

const attendantPerf = [
  { name: 'Ama Owusu', sessions: 142, revenue: 7820, cash: 3200, hubtel: 2800, paystack: 1820 },
  { name: 'Yaw Darko', sessions: 98, revenue: 5430, cash: 2100, hubtel: 1890, paystack: 1440 },
  { name: 'Efua Acheampong', sessions: 72, revenue: 3960, cash: 1560, hubtel: 1400, paystack: 1000 },
];

const hourlyData = [
  { hour: '6am', sessions: 3 }, { hour: '7am', sessions: 8 }, { hour: '8am', sessions: 14 },
  { hour: '9am', sessions: 22 }, { hour: '10am', sessions: 28 }, { hour: '11am', sessions: 25 },
  { hour: '12pm', sessions: 19 }, { hour: '1pm', sessions: 16 }, { hour: '2pm', sessions: 21 },
  { hour: '3pm', sessions: 30 }, { hour: '4pm', sessions: 35 }, { hour: '5pm', sessions: 32 },
  { hour: '6pm', sessions: 24 }, { hour: '7pm', sessions: 18 }, { hour: '8pm', sessions: 10 },
];

export default function AnalyticsPage() {
  return (
    <div>
      <TopBar title="Analytics" subtitle="Operational and financial insights" />
      <div className="p-6 space-y-6">

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg. Session Revenue', value: 'GHS 47.50', icon: TrendingUp, color: '#1d4ed8', bg: '#eff6ff' },
            { label: 'Avg. kWh per Session', value: '9.1 kWh', icon: Zap, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Repeat Drivers', value: '78%', icon: Users, color: '#7c3aed', bg: '#f3f0ff' },
            { label: 'Digital Payment Rate', value: '63.4%', icon: CreditCard, color: '#0891b2', bg: '#e0f2fe' },
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
              <AreaChart data={mockMonthlyRevenue}>
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
                  <th>Hubtel</th>
                  <th>Paystack</th>
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
                    <td>{formatCurrency(a.hubtel)}</td>
                    <td>{formatCurrency(a.paystack)}</td>
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
            <BarChart data={mockPaymentDistribution} layout="vertical" barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: 'var(--foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={(v) => [`${v}%`, 'Share']} />
              {mockPaymentDistribution.map((entry, i) => (
                <Bar key={i} dataKey="value" fill={entry.color} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
