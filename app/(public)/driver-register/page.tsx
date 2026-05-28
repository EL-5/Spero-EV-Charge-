'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerDriver } from '@/app/actions/driver-auth';
import { supabase } from '@/lib/supabase';
import { Zap, ShieldCheck, Car, User, Phone, KeyRound, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function DriverRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    brand: '',
    model: '',
    plate: '',
    pin: '',
    confirmPin: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.pin.length !== 4 || isNaN(Number(formData.pin))) {
      return toast.error('PIN must be exactly 4 digits');
    }

    if (formData.pin !== formData.confirmPin) {
      return toast.error('PINs do not match');
    }

    if (!formData.fullName || !formData.phone || !formData.brand || !formData.model || !formData.plate) {
      return toast.error('Please fill in all fields');
    }

    setLoading(true);
    const registerToast = toast.loading('Registering secure EV account...', { id: 'register' });

    try {
      // 1. Call server action to securely register user and insert DB records
      const res = await registerDriver(formData);
      if (!res.success) throw new Error(res.error);

      // 2. Automatically log them in on the client side
      const email = `${formData.phone.replace(/\D/g, '')}@driver.spero.local`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: formData.pin
      });

      if (signInError) throw new Error(signInError.message);

      toast.success('Registration successful! Welcome to Spero EV.', { id: 'register' });
      
      // Corrected redirect path to decoupled standalone driver app dashboard!
      router.push('/driver/dashboard');
      
    } catch (err: any) {
      toast.error(err.message, { id: 'register' });
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

      {/* Registration Card */}
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] shadow-cyan-500/[0.02] relative z-10 animate-in fade-in zoom-in-95 duration-300 overflow-y-auto max-h-[95vh] scrollbar-thin">
        
        {/* Glowing border top bar */}
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600"></div>

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_30px_rgba(34,211,238,0.25)] border border-cyan-400/20 active:scale-95 transition-transform duration-300">
            <Zap className="text-white fill-white/15" size={26} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white leading-none">Register EV Account</h1>
          <p className="text-[10px] text-slate-400 font-medium tracking-widest mt-2 uppercase">Create Spero Driver Account</p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Personal Details */}
          <div className="space-y-3.5">
            <h2 className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-1.5 pl-0.5"><User size={12}/> Personal Details</h2>
            
            <div>
              <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">FULL NAME</label>
              <input 
                name="fullName" 
                value={formData.fullName} 
                onChange={handleChange} 
                className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-xs font-semibold text-white outline-none transition-all placeholder-slate-600" 
                placeholder="Kwame Osei" 
                required 
              />
            </div>

            <div>
              <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">PHONE NUMBER (Used for Login)</label>
              <input 
                name="phone" 
                type="tel" 
                value={formData.phone} 
                onChange={handleChange} 
                className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-xs font-semibold text-white outline-none transition-all placeholder-slate-600" 
                placeholder="e.g. 054 123 4567" 
                required 
              />
            </div>
          </div>

          {/* Section 2: Vehicle details */}
          <div className="space-y-3.5 pt-1">
            <h2 className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-1.5 pl-0.5"><Car size={12}/> Vehicle Details</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">VEHICLE BRAND</label>
                <input 
                  name="brand" 
                  value={formData.brand} 
                  onChange={handleChange} 
                  className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-xs font-semibold text-white outline-none transition-all placeholder-slate-600" 
                  placeholder="e.g. Nissan" 
                  required 
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">VEHICLE MODEL</label>
                <input 
                  name="model" 
                  value={formData.model} 
                  onChange={handleChange} 
                  className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-xs font-semibold text-white outline-none transition-all placeholder-slate-600" 
                  placeholder="e.g. Leaf" 
                  required 
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">LICENSE PLATE</label>
              <input 
                name="plate" 
                value={formData.plate} 
                onChange={handleChange} 
                className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-xs font-semibold text-white outline-none transition-all placeholder-slate-600 uppercase" 
                placeholder="GR-1234-26" 
                required 
              />
            </div>
          </div>

          {/* Section 3: PIN credentials */}
          <div className="space-y-3.5 pt-1">
            <h2 className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-1 flex items-center gap-1.5 pl-0.5"><ShieldCheck size={12}/> Security PIN</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">4-DIGIT PIN</label>
                <input 
                  name="pin" 
                  type="password" 
                  maxLength={4} 
                  value={formData.pin} 
                  onChange={handleChange} 
                  className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-center tracking-[0.3em] font-mono text-base text-white outline-none transition-all placeholder-slate-700" 
                  placeholder="••••" 
                  required 
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">CONFIRM PIN</label>
                <input 
                  name="confirmPin" 
                  type="password" 
                  maxLength={4} 
                  value={formData.confirmPin} 
                  onChange={handleChange} 
                  className="w-full bg-slate-950/60 border border-white/5 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-500/20 rounded-2xl p-3 text-center tracking-[0.3em] font-mono text-base text-white outline-none transition-all placeholder-slate-700" 
                  placeholder="••••" 
                  required 
                />
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 mt-6 transition-all shadow-lg shadow-cyan-500/10 active:scale-95 text-xs uppercase tracking-wider"
          >
            {loading ? 'Generating Account...' : (
              <>
                Register & Login <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Login Redirect */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            Already have an EV account?{' '}
            <a href="/driver-login" className="text-cyan-400 font-black hover:underline hover:text-cyan-300 transition-colors">
              Login here
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
