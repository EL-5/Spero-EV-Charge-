'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDrivers, useWalletTransactions } from '@/hooks/use-database';
import { Wallet, ArrowDownLeft, ArrowUpRight, Plus, RefreshCw, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

export default function DriverWalletPage() {
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: drivers } = useDrivers();
  const { data: transactions } = useWalletTransactions(activeDriverId);

  const routerInstance = typeof window !== 'undefined' ? require('next/navigation').useRouter() : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        if (routerInstance) routerInstance.push('/driver-login');
      } else {
        setActiveDriverId(data.user.id);
      }
    });
  }, [routerInstance]);

  const currentDriver = drivers?.find(d => d.id === activeDriverId);

  const handleTopUpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('Enter a valid amount');

    setLoading(true);
    toast.loading('Simulating Mobile Money Prompt...', { id: 'topup' });
    
    // Simulate payment flow (in reality, this calls Hubtel/Paystack API)
    setTimeout(async () => {
      try {
        if (!currentDriver) throw new Error('Profile not loaded');
        const newBal = Number(currentDriver.walletBalance || 0) + amount;
        
        // 1. Update wallet balance
        await supabase.from('drivers').update({ wallet_balance: newBal }).eq('id', activeDriverId);
        
        // 2. Insert transaction record
        await supabase.from('wallet_transactions').insert([{
          driver_id: activeDriverId,
          type: 'top_up',
          amount: amount,
          balance_before: currentDriver.walletBalance || 0,
          balance_after: newBal,
          description: 'Mobile Money Top Up (Simulated)',
          created_by: activeDriverId
        }]);

        toast.success(`Successfully topped up GHS ${amount}`, { id: 'topup' });
        setTopUpAmount('');
      } catch (err: any) {
        toast.error(err.message, { id: 'topup' });
      } finally {
        setLoading(false);
      }
    }, 2000);
  };

  return (
    <div className="w-full text-[#f8fafc] space-y-6">
      
      <div className="mb-2 border-b border-[#334155] pb-4">
        <h1 className="text-2xl font-black text-white">Wallet</h1>
        <p className="text-xs text-[#94a3b8]">Manage your funds and top-ups</p>
      </div>

      {/* Balance Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-900 p-6 shadow-2xl border border-blue-500/30">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-5 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-cyan-400 opacity-10 blur-xl"></div>
        
        <div className="relative z-10 flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Available Balance</p>
              <h2 className="text-4xl font-black text-white">GHS {Number(currentDriver?.walletBalance || 0).toFixed(2)}</h2>
            </div>
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
              <Wallet size={24} className="text-white" />
            </div>
          </div>
          
          <div className="pt-4 flex gap-2">
            <div className="text-xs text-blue-200 font-medium">
              ID: {activeDriverId.substring(0,8).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Top Up Form */}
      <div className="bg-[#1e293b] rounded-2xl p-5 border border-[#334155]">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><CreditCard size={16} className="text-blue-400" /> Top Up via Mobile Money</h3>
        <form onSubmit={handleTopUpRequest} className="flex gap-3">
          <div className="relative flex-1">
            <span className="absolute left-4 top-3.5 text-[#94a3b8] font-bold text-sm">GHS</span>
            <input 
              type="number" 
              value={topUpAmount}
              onChange={e => setTopUpAmount(e.target.value)}
              className="w-full bg-[#0f172a] border border-[#334155] rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-blue-500 outline-none" 
              placeholder="0.00" 
              required 
            />
          </div>
          <button 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-6 rounded-xl transition-colors whitespace-nowrap flex items-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <><Plus size={16} /> Top Up</>}
          </button>
        </form>
      </div>

      {/* Transactions List */}
      <div>
        <h3 className="text-sm font-bold text-white mb-4">Recent Transactions</h3>
        {(!transactions || transactions.length === 0) ? (
          <div className="text-center py-8 text-[#94a3b8] text-xs bg-[#1e293b]/50 rounded-2xl border border-[#334155] border-dashed">
            No transactions found.
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 10).map((tx: any) => {
              const isCredit = tx.type === 'credit' || tx.type === 'top_up';
              return (
                <div key={tx.id} className="flex justify-between items-center p-4 bg-[#1e293b] rounded-2xl border border-[#334155]">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isCredit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{tx.description}</p>
                      <p className="text-[10px] text-[#94a3b8]">{new Date(tx.createdAt || tx.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className={`font-black text-sm ${isCredit ? 'text-green-400' : 'text-white'}`}>
                    {isCredit ? '+' : '-'} GHS {Number(tx.amount).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
