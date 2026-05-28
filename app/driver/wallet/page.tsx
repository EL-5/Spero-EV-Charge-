'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useDrivers, useWalletTransactions } from '@/hooks/use-database';
import { Wallet, ArrowDownLeft, ArrowUpRight, Plus, RefreshCw, CreditCard, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function DriverWalletPage() {
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  const [topUpAmount, setTopUpAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: drivers } = useDrivers();
  const { data: transactions } = useWalletTransactions(activeDriverId);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
         router.push('/driver-login');
      } else {
        setActiveDriverId(data.user.id);
      }
    });
  }, [router]);

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
    <div className="w-full animate-fade-in space-y-6">
      
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-black border border-slate-800 p-6 shadow-2xl">
        <div className="absolute bottom-0 right-0 -mr-16 -mb-16 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-500 mb-1">Wallet</h1>
          <p className="text-slate-400 text-xs">Manage funds & top-ups</p>
        </div>
      </div>

      {/* Balance Card - Premium Glass Credit Card Look */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-900 to-slate-900 p-8 shadow-[0_20px_50px_rgba(37,99,235,0.2)] border border-blue-500/30">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-[0.03] blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-cyan-400 opacity-10 blur-2xl"></div>
        
        {/* Visa/Mastercard style circuit background */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 100 L50 100 L100 50 L200 50" stroke="white" strokeWidth="4" fill="none"/>
            <path d="M0 150 L80 150 L130 100 L200 100" stroke="white" strokeWidth="2" fill="none"/>
          </svg>
        </div>

        <div className="relative z-10 flex flex-col space-y-8">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-300/80 text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={12}/> Secure Balance
              </p>
              <h2 className="text-5xl font-black text-white tracking-tight">
                <span className="text-blue-300/50 text-3xl mr-1">GHS</span>
                {Number(currentDriver?.walletBalance || 0).toFixed(2)}
              </h2>
            </div>
            <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md shadow-inner border border-white/10">
              <Wallet size={28} className="text-white drop-shadow-md" />
            </div>
          </div>
          
          <div className="pt-2 flex justify-between items-end">
            <div>
              <div className="text-[10px] text-blue-300/60 uppercase tracking-widest font-bold mb-1">Driver ID</div>
              <div className="text-sm font-mono text-blue-100 font-bold tracking-widest">
                {activeDriverId ? activeDriverId.substring(0,12).match(/.{1,4}/g)?.join(' ') : 'XXXX XXXX XXXX'}
              </div>
            </div>
            <div className="text-[10px] text-blue-300/60 font-bold uppercase tracking-widest">
              Spero<span className="text-white">EV</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Up Form */}
      <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl p-6 border border-slate-800 shadow-xl">
        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-5 flex items-center gap-2">
          <CreditCard size={16} className="text-blue-400" /> Mobile Money Top Up
        </h3>
        <form onSubmit={handleTopUpRequest} className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs uppercase tracking-widest">GHS</span>
            <input 
              type="number" 
              value={topUpAmount}
              onChange={e => setTopUpAmount(e.target.value)}
              className="w-full bg-black/50 border border-slate-700 rounded-2xl pl-16 pr-4 py-4 text-lg font-bold text-white focus:border-blue-500 outline-none transition-all shadow-inner" 
              placeholder="0.00" 
              required 
            />
          </div>
          <button 
            disabled={loading}
            className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 disabled:opacity-50 disabled:grayscale text-white font-black uppercase tracking-widest text-xs px-8 py-4 rounded-2xl transition-all shadow-[0_10px_20px_rgba(37,99,235,0.2)] flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <><Plus size={16} /> Top Up</>}
          </button>
        </form>
      </div>

      {/* Transactions List */}
      <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl p-6 border border-slate-800">
        <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6">Recent Transactions</h3>
        {(!transactions || transactions.length === 0) ? (
          <div className="text-center py-12 text-slate-500 text-xs bg-black/20 rounded-2xl border border-slate-800 border-dashed flex flex-col items-center gap-3">
            <RefreshCw size={24} className="opacity-20" />
            No transactions found yet.
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 10).map((tx: any) => {
              const isCredit = tx.type === 'credit' || tx.type === 'top_up';
              return (
                <div key={tx.id} className="group flex justify-between items-center p-4 bg-black/30 hover:bg-slate-800/80 transition-all rounded-2xl border border-slate-800 hover:border-slate-700">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${isCredit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {isCredit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-blue-100 transition-colors">{tx.description}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(tx.createdAt || tx.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                  </div>
                  <div className={`font-black text-base tracking-tight ${isCredit ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {isCredit ? '+' : '-'} <span className="text-xs">GHS</span> {Number(tx.amount).toFixed(2)}
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
