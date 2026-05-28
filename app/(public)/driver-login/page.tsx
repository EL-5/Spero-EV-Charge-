'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, KeyRound, Phone, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function DriverLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || pin.length !== 4) {
      return toast.error('Please enter your phone number and 4-digit PIN');
    }

    setLoading(true);
    const authToast = toast.loading('Connecting to Spero network...', { id: 'login' });

    try {
      // Map phone to the internal dummy email structure used during registration
      const email = `${phone.replace(/\D/g, '')}@driver.spero.local`;
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pin
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Incorrect Phone Number or PIN');
        }
        throw new Error(error.message);
      }

      toast.success('Access authorized! Welcome back.', { id: 'login' });
      
      // Corrected redirect to the standalone decoupled driver dashboard path!
      router.push('/driver/dashboard');
      
    } catch (err: any) {
      toast.error(err.message, { id: 'login' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-4 relative font-sans select-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
      
      {/* Login Card */}
      <div className="w-full max-w-sm bg-[#151E2E] border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300">
            <Zap className="text-blue-500 fill-blue-500/10" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white leading-none">Spero EV Portal</h1>
          <p className="text-[11px] text-slate-400 font-semibold tracking-wider mt-2 uppercase">Driver Authorization</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-2 block flex items-center gap-1.5 pl-0.5">
              <Phone size={13} className="text-slate-500" /> Phone Number
            </label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-sm font-medium text-white outline-none transition-colors placeholder-slate-600" 
              placeholder="e.g. 054 123 4567" 
              required 
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-2 block flex items-center gap-1.5 pl-0.5">
              <KeyRound size={13} className="text-slate-500" /> Security PIN
            </label>
            <input 
              type="password" 
              maxLength={4} 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-center tracking-[0.3em] font-mono text-lg text-white outline-none transition-colors placeholder-slate-700" 
              placeholder="••••" 
              required 
            />
          </div>

          <button 
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 mt-8 transition-colors active:scale-[0.98] text-xs uppercase tracking-wider"
          >
            {loading ? 'Authorizing Access...' : (
              <>
                Login to Wallet <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Register Redirect */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-xs text-slate-500">
            Don't have an EV wallet?{' '}
            <a href="/driver-register" className="text-blue-400 font-bold hover:underline hover:text-blue-300 transition-colors">
              Register here
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
