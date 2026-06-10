'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Driver, Session, User, Vehicle, DashboardStats } from '@/lib/types';
import { useEffect } from 'react';

// --- Realtime Helper ---
function useRealtimeSync(table: string, queryKeys: any[][]) {
  const queryClient = useQueryClient();
  
  // Serialize queryKeys to stabilize the effect dependency
  const keysString = JSON.stringify(queryKeys);

  useEffect(() => {
    const channelId = `realtime:${table}:${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          console.log(`[REALTIME] Update for ${table}:`, payload);
          const parsedKeys = JSON.parse(keysString);
          parsedKeys.forEach((key: any) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, keysString, queryClient]);
}

// --- Dashboard Stats ---
export function useDashboardStats(options: { attendantId?: string } = {}) {
  useRealtimeSync('sessions', [['dashboard-stats', options.attendantId]]);
  useRealtimeSync('payments', [['dashboard-stats', options.attendantId]]);
  useRealtimeSync('shifts', [['dashboard-stats', options.attendantId]]);
  useRealtimeSync('drivers', [['dashboard-stats', options.attendantId]]);
  
  return useQuery({
    queryKey: ['dashboard-stats', options.attendantId],
    queryFn: async () => {
      // Start of today (00:00:00)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayISO = startOfToday.toISOString();

      let sessionQuery = supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', todayISO);
      let activeQuery = supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'active');
      let revenueQuery = supabase.from('payments').select('amount').gte('created_at', todayISO);
      let unitsQuery = supabase.from('sessions').select('units_consumed').eq('status', 'completed').gte('created_at', todayISO);

      if (options.attendantId) {
        sessionQuery = sessionQuery.eq('attendant_id', options.attendantId);
        activeQuery = activeQuery.eq('attendant_id', options.attendantId);
        revenueQuery = revenueQuery.eq('attendant_id', options.attendantId);
        unitsQuery = unitsQuery.eq('attendant_id', options.attendantId);
      }

      const { count: sessionCount } = await sessionQuery;
      const { count: activeCount } = await activeQuery;
      const { count: driverCount } = await supabase.from('drivers').select('*', { count: 'exact', head: true });
      const { count: vehicleCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true });
      
      const { data: revenueData } = await revenueQuery;
      const { data: unitsData } = await unitsQuery;
      
      const totalRevenue = revenueData?.reduce((acc, p) => acc + (p.amount || 0), 0) || 0;
      const totalUnits = unitsData?.reduce((acc, s) => acc + (Number(s.units_consumed) || 0), 0) || 0;

      return {
        revenueToday: totalRevenue,
        totalSessions: sessionCount || 0,
        activeSessions: activeCount || 0,
        pendingPayments: activeCount || 0,
        totalDrivers: driverCount || 0,
        totalVehicles: vehicleCount || 0,
        unitsSoldToday: totalUnits,
      } as Partial<DashboardStats> & { unitsSoldToday: number };
    },
  });
}

// --- Drivers ---
export function useDrivers() {
  useRealtimeSync('drivers', [['drivers']]);
  useRealtimeSync('sessions', [['drivers']]); // Refresh when a session starts

  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, sessions(count)')
        .order('name');
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        type: d.type,
        walletBalance: d.wallet_balance,
        debtBalance: d.debt_balance,
        totalSessions: (d as any).sessions?.[0]?.count || 0,
        createdAt: d.created_at,
      })) as Driver[];
    },
  });
}

// --- Sessions ---
export function useSessions(options: { limit?: number; attendantId?: string } = {}) {
  const limit = options.limit || 10;
  useRealtimeSync('sessions', [['sessions', limit, options.attendantId]]);
  
  return useQuery({
    queryKey: ['sessions', limit, options.attendantId],
    queryFn: async () => {
      let query = supabase
        .from('sessions')
        .select(`
          *,
          profiles:attendant_id (name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (options.attendantId) {
        query = query.eq('attendant_id', options.attendantId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(s => ({
        id: s.id,
        receiptNumber: s.receipt_number,
        driverId: s.driver_id,
        driverName: s.driver_name || 'Unknown',
        vehicleId: s.vehicle_id,
        vehiclePlate: s.vehicle_plate || 'Unknown',
        vehicleDetails: s.vehicle_details || '—',
        attendantId: s.attendant_id,
        attendantName: (s as any).profiles?.name || 'Unknown',
        mode: s.mode,
        status: s.status,
        unitType: s.unit_type,
        rateAtTime: s.rate_at_time,
        startTime: s.start_time,
        endTime: s.end_time,
        unitsConsumed: s.units_consumed,
        prepaidAmount: s.prepaid_amount,
        targetUnits: s.target_units,
        totalAmount: s.total_amount,
        paymentMethod: s.payment_method,
        paymentStatus: s.payment_status || 'unpaid',
        createdAt: s.created_at,
      })) as any[];
    },
  });
}

// --- Vehicles ---
export function useVehicles() {
  useRealtimeSync('vehicles', [['vehicles']]);
  useRealtimeSync('sessions', [['vehicles']]); // Refresh when a session starts

  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, sessions(count)')
        .order('plate_number');
      if (error) throw error;
      return (data || []).map(v => ({
        id: v.id,
        brand: v.brand,
        model: v.model,
        plateNumber: v.plate_number,
        driverId: v.driver_id,
        batteryCapacity: Number(v.battery_capacity || 40.0),
        totalSessions: (v as any).sessions?.[0]?.count || 0,
        createdAt: v.created_at,
      })) as any[];
    },
  });
}

// --- Wallet Transactions ---
export function useWalletTransactions(driverId?: string) {
  useRealtimeSync('wallet_transactions', [['wallet-transactions', driverId]]);

  return useQuery({
    queryKey: ['wallet-transactions', driverId],
    queryFn: async () => {
      let query = supabase
        .from('wallet_transactions')
        .select(`
          *,
          drivers:driver_id (name),
          profiles:created_by (name)
        `)
        .order('created_at', { ascending: false });

      if (driverId) {
        query = query.eq('driver_id', driverId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(t => ({
        id: t.id,
        driverId: t.driver_id,
        driverName: (t as any).drivers?.name || 'Unknown',
        type: t.type,
        amount: t.amount,
        balanceBefore: t.balance_before,
        balanceAfter: t.balance_after,
        description: t.description,
        createdBy: (t as any).profiles?.name || 'System',
        createdAt: t.created_at,
      }));
    },
  });
}

// --- Shifts ---
export function useShifts(options: { attendantId?: string } = {}) {
  useRealtimeSync('shifts', [['shifts', options.attendantId]]);
  useRealtimeSync('payments', [['shifts', options.attendantId]]); // Shifts track payments too
  
  return useQuery({
    queryKey: ['shifts', options.attendantId],
    queryFn: async () => {
      let query = supabase
        .from('shifts')
        .select(`
          *,
          profiles:attendant_id (name)
        `)
        .order('start_time', { ascending: false });
      
      if (options.attendantId) {
        query = query.eq('attendant_id', options.attendantId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(s => ({
        id: s.id,
        attendantId: s.attendant_id,
        attendantName: (s as any).profiles?.name || 'Unknown',
        startTime: s.start_time,
        endTime: s.end_time,
        status: s.status,
        cashCollected: s.cash_collected,
        hubtelCollected: (s.hubtel_collected || 0) + (s.paystack_collected || 0), // Merge legacy digital payment columns for MoMo reporting
        walletDeductions: s.wallet_deductions,
        totalSessions: s.total_sessions,
        outstandingDebts: s.outstanding_debts,
        notes: s.notes,
      }));
    },
  });
}

// --- Payments ---
export function usePayments(options: { attendantId?: string } = {}) {
  useRealtimeSync('payments', [['payments', options.attendantId]]);
  
  return useQuery({
    queryKey: ['payments', options.attendantId],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          *,
          profiles:attendant_id (name),
          drivers:driver_id (name),
          sessions:session_id (units_consumed, rate_at_time, unit_type)
        `)
        .order('created_at', { ascending: false });

      if (options.attendantId) {
        query = query.eq('attendant_id', options.attendantId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(p => ({
        id: p.id,
        sessionId: p.session_id,
        receiptNumber: p.receipt_number,
        driverId: p.driver_id,
        driverName: (p as any).drivers?.name || 'Unknown',
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        status: p.status,
        attendantId: p.attendant_id,
        attendantName: (p as any).profiles?.name || 'Unknown',
        unitsConsumed: (p as any).sessions?.units_consumed,
        rateAtTime: (p as any).sessions?.rate_at_time,
        unitType: (p as any).sessions?.unit_type,
        createdAt: p.created_at,
      }));
    },
  });
}

// --- Profiles/Users ---
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Map snake_case from DB to camelCase for UI
      return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: p.role,
        isActive: p.is_active,
        createdAt: p.created_at,
        lastLogin: p.last_login,
      })) as User[];
    },
  });
}
// --- Pricing ---
export function usePricing() {
  useRealtimeSync('pricing', [['pricing']]);

  return useQuery({
    queryKey: ['pricing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricing')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      return (data || []).map(p => ({
        id: p.id,
        unitType: p.unit_type,
        unitQuantity: Number(p.unit_quantity || 1),
        rate: Number(p.rate),
        description: p.description,
      }));
    },
  });
}

// --- Settings ---
export function useSettings() {
  useRealtimeSync('settings', [['settings']]);

  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
}

// --- Notifications ---
export function useNotifications(userId?: string) {
  useRealtimeSync('notifications', [['notifications', userId]]);

  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return (data || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.is_read,
        createdAt: n.created_at,
      }));
    },
    enabled: !!userId,
  });
}

// --- Chargers ---
export function useChargers() {
  useRealtimeSync('chargers', [['chargers']]);
  useRealtimeSync('connectors', [['chargers']]); // Refresh if connectors update

  return useQuery({
    queryKey: ['chargers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chargers')
        .select('*')
        .order('charge_point_id');
      if (error) throw error;
      return (data || []).map(c => ({
        id: c.id,
        chargePointId: c.charge_point_id,
        name: c.name,
        vendor: c.vendor,
        model: c.model,
        serialNumber: c.serial_number,
        location: c.location,
        status: c.status,
        lastHeartbeat: c.last_heartbeat,
        createdAt: c.created_at,
        stationId: c.station_id,
      }));
    },
  });
}

// --- Connectors ---
export function useConnectors() {
  useRealtimeSync('connectors', [['connectors']]);
  useRealtimeSync('sessions', [['connectors']]); // Refresh if session links change

  return useQuery({
    queryKey: ['connectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connectors')
        .select('*')
        .order('connector_number');
      if (error) throw error;
      return (data || []).map(c => ({
        id: c.id,
        chargerId: c.charger_id,
        connectorNumber: c.connector_number,
        status: c.status,
        powerType: c.power_type,
        maxPower: Number(c.max_power || 22.0),
        currentSessionId: c.current_session_id,
        lastStatusNotification: c.last_status_notification,
      }));
    },
  });
}

// --- OCPP Logs ---
export function useOcppLogs(chargePointId?: string) {
  useRealtimeSync('ocpp_logs', [['ocpp_logs', chargePointId]]);

  return useQuery({
    queryKey: ['ocpp_logs', chargePointId],
    queryFn: async () => {
      const url = chargePointId 
        ? `/api/ocpp/logs?chargePointId=${encodeURIComponent(chargePointId)}` 
        : '/api/ocpp/logs';
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch OCPP logs');
      
      const data = await res.json();
      return (data || []).map((l: any) => ({
        id: l.id,
        chargePointId: l.charge_point_id,
        direction: l.direction,
        messageType: l.message_type,
        payload: l.payload,
        createdAt: l.created_at,
      }));
    },
  });
}
export function useStations() {
  useRealtimeSync('stations', [['stations']]);
  return useQuery({
    queryKey: ['stations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });
}

// --- Smart Meter Grid Metrics ---
export function useStationGridMetrics(stationId?: string) {
  useRealtimeSync('station_grid_metrics', [['station_grid_metrics', stationId]]);

  return useQuery({
    queryKey: ['station_grid_metrics', stationId],
    queryFn: async () => {
      let query = supabase
        .from('station_grid_metrics')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (stationId && stationId !== 'all') {
        query = query.eq('station_id', stationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Return sorted from oldest to newest for charts
      return (data || []).reverse().map(m => ({
        id: m.id,
        stationId: m.station_id,
        activePowerKw: Number(m.active_power_kw || 0),
        voltageV: m.voltage_v || [230, 230, 230],
        currentA: m.current_a || [0, 0, 0],
        totalEnergyKwh: Number(m.total_energy_kwh || 0),
        recordedAt: m.recorded_at,
      }));
    },
  });
}
