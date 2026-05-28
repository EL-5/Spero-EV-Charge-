'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, KeyRound, Phone } from 'lucide-react';
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
    toast.loading('Authenticating...', { id: 'login' });

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

      toast.success('Login successful!', { id: 'login' });
      router.push('/driver-portal');
      
    } catch (err: any) {
      toast.error(err.message, { id: 'login' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1e293b] border border-[#334155] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
            <Zap className="text-blue-400" size={32} />
          </div>
          <h1 className="text-2xl font-black text-white">Driver Login</h1>
          <p className="text-xs text-[#94a3b8] mt-1 text-center">Enter your phone number and PIN to access your wallet.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className="text-[10px] text-[#94a3b8] font-bold mb-1 flex items-center gap-1"><Phone size={12}/> PHONE NUMBER</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" 
              placeholder="054 123 4567" 
              required 
            />
          </div>

          <div>
            <label className="text-[10px] text-[#94a3b8] font-bold mb-1 flex items-center gap-1"><KeyRound size={12}/> 4-DIGIT PIN</label>
            <input 
              type="password" 
              maxLength={4} 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
              className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-center tracking-widest font-mono text-xl text-white focus:border-blue-500 outline-none" 
              placeholder="••••" 
              required 
            />
          </div>

          <button 
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 mt-6 transition-colors shadow-lg shadow-blue-900/20"
          >
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#334155] text-center">
          <p className="text-xs text-[#94a3b8]">
            Don't have an account? <a href="/driver-register" className="text-blue-400 font-bold hover:underline">Register here</a>
          </p>
        </div>

      </div>
    </div>
  );
}
