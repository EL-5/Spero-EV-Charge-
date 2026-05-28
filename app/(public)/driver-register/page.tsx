'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerDriver } from '@/app/actions/driver-auth';
import { supabase } from '@/lib/supabase';
import { Zap, ShieldCheck, Car, User, Phone, KeyRound } from 'lucide-react';
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
    toast.loading('Creating your account...', { id: 'register' });

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
      router.push('/driver-portal');
      
    } catch (err: any) {
      toast.error(err.message, { id: 'register' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
            <Zap className="text-blue-400" size={32} />
          </div>
          <h1 className="text-2xl font-black text-white">Create Account</h1>
          <p className="text-xs text-[#94a3b8] mt-1 text-center">Fast Registration. Secure Charging.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div className="space-y-4">
            <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-[#334155] pb-1 flex items-center gap-2"><User size={12}/> Personal Details</h2>
            
            <div>
              <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">FULL NAME</label>
              <input name="fullName" value={formData.fullName} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" placeholder="Kwame Osei" required />
            </div>

            <div>
              <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">PHONE NUMBER (Used for Login)</label>
              <input name="phone" type="tel" value={formData.phone} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" placeholder="054 123 4567" required />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-[#334155] pb-1 flex items-center gap-2"><Car size={12}/> Vehicle Details</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">BRAND</label>
                <input name="brand" value={formData.brand} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" placeholder="e.g. Nissan" required />
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">MODEL</label>
                <input name="model" value={formData.model} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" placeholder="e.g. Leaf" required />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">LICENSE PLATE</label>
              <input name="plate" value={formData.plate} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none" placeholder="GR-1234-24" required />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest border-b border-[#334155] pb-1 flex items-center gap-2"><ShieldCheck size={12}/> Security PIN</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">4-DIGIT PIN</label>
                <input name="pin" type="password" maxLength={4} value={formData.pin} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-center tracking-widest font-mono text-xl text-white focus:border-blue-500 outline-none" placeholder="••••" required />
              </div>
              <div>
                <label className="text-[10px] text-[#94a3b8] font-bold mb-1 block">CONFIRM PIN</label>
                <input name="confirmPin" type="password" maxLength={4} value={formData.confirmPin} onChange={handleChange} className="w-full bg-[#0f172a] border border-[#334155] rounded-xl p-3 text-center tracking-widest font-mono text-xl text-white focus:border-blue-500 outline-none" placeholder="••••" required />
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 mt-6 transition-colors shadow-lg shadow-blue-900/20"
          >
            {loading ? 'Processing...' : 'Create Account & Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-[#94a3b8]">
            Already have an account? <a href="/driver-login" className="text-blue-400 font-bold hover:underline">Login here</a>
          </p>
        </div>

      </div>
    </div>
  );
}
