'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { mockDrivers, mockWalletTransactions } from '@/lib/mock-data';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Search, Plus, Wallet, ArrowUpCircle, ArrowDownCircle, Gift } from 'lucide-react';

const txTypeColors: Record<string, string> = {
  credit: 'bg-green-100 text-green-700',
  debit: 'bg-red-100 text-red-700',
  top_up: 'bg-blue-100 text-blue-700',
  bonus: 'bg-purple-100 text-purple-700',
};

const txTypeIcons: Record<string, React.ReactNode> = {
  credit: <ArrowUpCircle size={14} />,
  debit: <ArrowDownCircle size={14} />,
  top_up: <Plus size={14} />,
  bonus: <Gift size={14} />,
};

export default function WalletsPage() {
  const [search, setSearch] = useState('');
  const [showTopUp, setShowTopUp] = useState(false);
  const [activeTab, setActiveTab] = useState<'balances' | 'transactions'>('balances');

  const driversWithWallets = mockDrivers.filter(d => d.walletBalance > 0 || d.totalSessions > 0);
  const totalWalletBalance = mockDrivers.reduce((sum, d) => sum + d.walletBalance, 0);

  const filteredTx = mockWalletTransactions.filter(t =>
    t.driverName.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <TopBar title="Wallets" subtitle="Driver wallet balances and transaction history" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#16a34a' }}>{formatCurrency(totalWalletBalance)}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Total Wallet Holdings</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#1d4ed8' }}>{mockDrivers.filter(d => d.walletBalance > 0).length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Wallets with Balance</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{mockWalletTransactions.filter(t => t.type === 'top_up').length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Top-ups</div>
          </div>
          <div className="stat-card">
            <div className="text-2xl font-bold" style={{ color: '#d97706' }}>{mockWalletTransactions.filter(t => t.type === 'bonus').length}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Bonus Credits</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--muted)' }}>
          {(['balances', 'transactions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize"
              style={{
                background: activeTab === tab ? 'var(--card)' : 'transparent',
                color: activeTab === tab ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'balances' && (
          <div className="stat-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Wallet Balances</h3>
              <button onClick={() => setShowTopUp(true)} className="btn btn-primary btn-sm gap-1">
                <Plus size={14} /> Top Up
              </button>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Type</th>
                    <th>Wallet Balance</th>
                    <th>Debt Balance</th>
                    <th>Net Position</th>
                    <th>Sessions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {driversWithWallets.map(d => (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ background: '#1d4ed8' }}>{d.name[0]}</div>
                          <div>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{d.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="badge bg-blue-100 text-blue-700 capitalize">{d.type}</span></td>
                      <td>
                        <span className={`font-bold ${d.walletBalance > 0 ? 'text-green-600' : ''}`}>
                          {formatCurrency(d.walletBalance)}
                        </span>
                      </td>
                      <td>
                        <span className={`font-bold ${d.debtBalance > 0 ? 'text-red-600' : ''}`}>
                          {d.debtBalance > 0 ? formatCurrency(d.debtBalance) : '—'}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const net = d.walletBalance - d.debtBalance;
                          return (
                            <span className={`font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(Math.abs(net))} {net < 0 ? 'owed' : 'credit'}
                            </span>
                          );
                        })()}
                      </td>
                      <td>{d.totalSessions}</td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn btn-secondary btn-sm">Top Up</button>
                          <button className="btn btn-secondary btn-sm">History</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="stat-card overflow-hidden">
            <div className="flex flex-col sm:flex-row gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Balance Before</th>
                    <th>Balance After</th>
                    <th>Description</th>
                    <th>Created By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map(tx => (
                    <tr key={tx.id}>
                      <td className="font-medium">{tx.driverName}</td>
                      <td>
                        <span className={`badge gap-1 ${txTypeColors[tx.type]}`}>
                          {txTypeIcons[tx.type]}
                          {tx.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`font-bold ${tx.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                          {tx.type === 'debit' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted-foreground)' }}>{formatCurrency(tx.balanceBefore)}</td>
                      <td className="font-medium">{formatCurrency(tx.balanceAfter)}</td>
                      <td className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{tx.description}</td>
                      <td style={{ color: 'var(--muted-foreground)' }} className="text-sm">{tx.createdBy}</td>
                      <td style={{ color: 'var(--muted-foreground)' }} className="text-xs">{formatDateTime(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top up modal */}
        {showTopUp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Wallet Top-Up</h2>
                <button onClick={() => setShowTopUp(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Select Driver *</label>
                  <select className="form-select">
                    <option value="">Choose driver...</option>
                    {mockDrivers.map(d => <option key={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Top-Up Type</label>
                  <select className="form-select">
                    <option value="top_up">Manual Top-Up</option>
                    <option value="bonus">Bonus Credit</option>
                    <option value="credit">Overpayment Credit</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Amount (GHS) *</label>
                  <input type="number" className="form-input" placeholder="0.00" min="1" />
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input className="form-input" placeholder="Reason for top-up..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowTopUp(false)} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={() => setShowTopUp(false)} className="btn btn-primary flex-1">Top Up Wallet</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
