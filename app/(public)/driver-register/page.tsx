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
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-4 relative font-sans select-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
      
      {/* Registration Card */}
      <div className="w-full max-w-md bg-[#151E2E] border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40 relative z-10 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[95vh] scrollbar-thin">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-3 transition-transform duration-300">
            <Zap className="text-blue-500 fill-blue-500/10" size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white leading-none">Register EV Account</h1>
          <p className="text-[10px] text-slate-400 font-semibold tracking-wider mt-2 uppercase">Create Spero Driver Account</p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Personal Details */}
          <div className="space-y-3.5">
            <h2 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-1.5 flex items-center gap-1.5 pl-0.5"><User size={12} className="text-slate-500" /> Personal Details</h2>
            
            <div>
              <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">FULL NAME</label>
              <input 
                name="fullName" 
                value={formData.fullName} 
                onChange={handleChange} 
                className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-white outline-none transition-colors placeholder-slate-600" 
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
                className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-white outline-none transition-colors placeholder-slate-600" 
                placeholder="e.g. 054 123 4567" 
                required 
              />
            </div>
          </div>

          {/* Section 2: Vehicle details */}
          <div className="space-y-3.5 pt-1">
            <h2 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-1.5 flex items-center gap-1.5 pl-0.5"><Car size={12} className="text-slate-500" /> Vehicle Details</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">VEHICLE BRAND</label>
                <input 
                  name="brand" 
                  value={formData.brand} 
                  onChange={handleChange} 
                  className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-white outline-none transition-colors placeholder-slate-600" 
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
                  className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-white outline-none transition-colors placeholder-slate-600" 
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
                className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-white outline-none transition-colors placeholder-slate-600 uppercase" 
                placeholder="GR-1234-26" 
                required 
              />
            </div>
          </div>

          {/* Section 3: PIN credentials */}
          <div className="space-y-3.5 pt-1">
            <h2 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-1.5 flex items-center gap-1.5 pl-0.5"><ShieldCheck size={12} className="text-slate-500" /> Security PIN</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-bold mb-1.5 block">4-DIGIT PIN</label>
                <input 
                  name="pin" 
                  type="password" 
                  maxLength={4} 
                  value={formData.pin} 
                  onChange={handleChange} 
                  className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-center tracking-[0.2em] font-mono text-sm text-white outline-none transition-colors placeholder-slate-700" 
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
                  className="w-full bg-[#0D131F] border border-slate-800 focus:border-blue-500 rounded-xl p-3 text-center tracking-[0.2em] font-mono text-sm text-white outline-none transition-colors placeholder-slate-700" 
                  placeholder="••••" 
                  required 
                />
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 mt-6 transition-colors active:scale-[0.98] text-xs uppercase tracking-wider"
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
            <a href="/driver-login" className="text-blue-400 font-bold hover:underline hover:text-blue-300 transition-colors">
              Login here
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
