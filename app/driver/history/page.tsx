'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessions } from '@/hooks/use-database';
import { History, BatteryCharging, Zap, Calendar, FileText, ChevronRight, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DriverHistoryPage() {
  const [activeDriverId, setActiveDriverId] = useState<string>('');
  
  const { data: allSessions } = useSessions();
  const driverSessions = allSessions?.filter(s => s.driverId === activeDriverId) || [];
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

  return (
    <div className="w-full animate-fade-in space-y-6">
      
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-black border border-slate-800 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl"></div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-cyan-400">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-1">History</h1>
            <p className="text-slate-400 text-xs">Past charges & receipts</p>
          </div>
        </div>
      </div>

      {driverSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-slate-900/30 backdrop-blur-md rounded-3xl border border-slate-800 border-dashed shadow-inner">
          <div className="p-6 bg-slate-900 rounded-full border border-slate-800 mb-6">
            <Activity size={48} className="opacity-30" />
          </div>
          <p className="text-lg font-black text-white mb-2">No Charging History</p>
          <p className="text-sm text-slate-400">Your past sessions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4 relative">
          
          {/* Vertical timeline line */}
          <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-cyan-500/50 via-slate-700 to-transparent"></div>

          {driverSessions.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((session, i) => (
            <div key={session.id} className="relative pl-14">
              
              {/* Timeline Dot */}
              <div className="absolute left-[1.35rem] top-8 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] border-2 border-slate-900"></div>

              <div className="bg-slate-900/60 backdrop-blur-md rounded-3xl p-6 border border-slate-800 hover:border-cyan-500/30 transition-all duration-300 group shadow-lg">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
                      <Calendar size={14} className="text-cyan-400" />
                      {new Date(session.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                    session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    session.status === 'active' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                    session.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {session.status === 'active' && (
                       <span className="relative flex h-2 w-2">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                       </span>
                    )}
                    {session.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 bg-black/40 p-4 rounded-2xl border border-slate-800/50">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Zap size={12} className="text-amber-400"/> Energy
                    </p>
                    <p className="text-2xl font-black text-white tracking-tight">
                      {Number(session.unitsConsumed || 0).toFixed(2)} <span className="text-xs text-amber-400 font-bold ml-0.5">kWh</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      Cost
                    </p>
                    <p className="text-2xl font-black text-cyan-400 tracking-tight">
                      <span className="text-xs text-cyan-500/70 mr-1">GHS</span>{Number(session.totalAmount || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                  <div className="text-[10px] text-slate-500 font-mono bg-black/50 px-2.5 py-1 rounded-md border border-slate-800">
                    {session.receiptNumber}
                  </div>
                  <button className="flex items-center gap-1 text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                    Receipt <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
