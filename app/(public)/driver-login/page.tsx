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
    <div className="min-h-screen bg-black text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      
      {/* High-fidelity background glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-cyan-500/[0.04] rounded-full blur-[140px] mix-blend-screen"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/[0.04] rounded-full blur-[140px] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-transparent to-black"></div>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] shadow-cyan-500/[0.02] relative z-10 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Glowing border top bar */}
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600"></div>

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(34,211,238,0.25)] border border-cyan-400/20 active:scale-95 transition-transform duration-300">
            <Zap className="text-white fill-white/15" size={26} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white leading-none">Spero EV Portal</h1>
          <p className="text-[11px] text-slate-400 font-medium tracking-wide mt-2 uppercase">Driver Authorization</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase mb-2 block flex items-center gap-1.5 pl-0.5">
              <Phone size={12} className="text-cyan-400" /> Phone Number
            </label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3.5 text-sm font-semibold text-white outline-none transition-all placeholder-slate-600" 
              placeholder="e.g. 054 123 4567" 
              required 
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-extrabold tracking-wider uppercase mb-2 block flex items-center gap-1.5 pl-0.5">
              <KeyRound size={12} className="text-cyan-400" /> Security PIN
            </label>
            <input 
              type="password" 
              maxLength={4} 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3.5 text-center tracking-[0.4em] font-mono text-xl text-white outline-none transition-all placeholder-slate-700" 
              placeholder="••••" 
              required 
            />
          </div>

          <button 
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 mt-8 transition-all shadow-lg shadow-cyan-500/10 active:scale-95 text-xs uppercase tracking-wider"
          >
            {loading ? 'Authorizing Access...' : (
              <>
                Login to Wallet <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Register Redirect */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-slate-500">
            Don't have an EV wallet?{' '}
            <a href="/driver-register" className="text-cyan-400 font-black hover:underline hover:text-cyan-300 transition-colors">
              Register here
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
