'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessions } from '@/hooks/use-database';
import { History, BatteryCharging, Zap, Calendar, FileText } from 'lucide-react';

export default function DriverHistoryPage() {
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  
  const { data: allSessions } = useSessions();
  const driverSessions = allSessions?.filter(s => s.driverId === activeDriverId) || [];

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

  return (
    <div className="w-full text-[#f8fafc] space-y-6">
      
      <div className="mb-2 border-b border-[#334155] pb-4">
        <h1 className="text-2xl font-black text-white">Charging History</h1>
        <p className="text-xs text-[#94a3b8]">Review your past sessions and receipts</p>
      </div>

      {driverSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#94a3b8] bg-[#1e293b]/30 rounded-3xl border border-[#334155] border-dashed">
          <History size={48} className="mb-4 opacity-50" />
          <p className="text-sm font-bold">No charging history yet</p>
          <p className="text-xs mt-1">Your past sessions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {driverSessions.map((session) => (
            <div key={session.id} className="bg-[#1e293b] rounded-2xl p-5 border border-[#334155] hover:border-blue-500/50 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#94a3b8]">
                  <Calendar size={14} />
                  {new Date(session.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                  session.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                  session.status === 'active' ? 'bg-cyan-500/10 text-cyan-400' :
                  session.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                  'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {session.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-wider mb-1 flex items-center gap-1"><Zap size={10}/> Energy</p>
                  <p className="text-xl font-black text-white">{Number(session.unitsConsumed || 0).toFixed(2)} <span className="text-xs text-cyan-400 font-bold">kWh</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-wider mb-1">Total Cost</p>
                  <p className="text-xl font-black text-white">GHS {Number(session.totalAmount || 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-[#334155]">
                <div className="text-[10px] text-[#94a3b8] font-mono">
                  Receipt: {session.receiptNumber}
                </div>
                <button className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  <FileText size={12} /> View Receipt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
