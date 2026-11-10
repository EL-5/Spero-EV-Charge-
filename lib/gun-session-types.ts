import type { Gun, ReviewFlag } from '@/lib/gun-session';

export interface GunSessionSummary {
  id: string;
  receiptNumber: string;
  gun: Gun;
  status: 'active' | 'pending_payment' | 'completed' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | null;
  driverName: string;
  vehiclePlate: string;
  startTime: string;
  endTime: string | null;
  units: number | null;
  amount: number | null;
  flags: ReviewFlag[];
}

export interface GunStatus {
  gun: Gun;
  inUse: boolean;
  /** Where this gun last stopped. The next start reading should match it. */
  lastEndReading: number | null;
  session: GunSessionSummary | null;
}

export interface WorkspaceData {
  user: { id: string; name: string; role: string };
  shift: { id: string; startTime: string } | null;
  guns: Record<Gun, GunStatus>;
  today: {
    kwh: number;
    sessions: number;
    paid: number;
    perGun: Record<Gun, { kwh: number; sessions: number }>;
  };
  inProgress: GunSessionSummary[];
  done: GunSessionSummary[];
}

export interface DriverMatch {
  driverId: string;
  name: string;
  phone: string;
  walletBalance: number;
  isActive: boolean;
  vehicles: { id: string; plate: string; label: string; batteryKwh: number | null }[];
}

export interface GunSessionView extends GunSessionSummary {
  startReading: number;
  endReading: number | null;
  rate: number;
  paymentMethod: string | null;
  walletBalance: number | null;
  batteryKwh: number | null;
  attendantName: string;
  startGap: number | null;
  isMine: boolean;
  /** A void request for this session is waiting for a manager. */
  voidPending: boolean;
}

export interface GunTotals {
  period: 'today' | 'week' | 'month';
  perGun: Record<Gun, { kwh: number; sessions: number }>;
  total: { kwh: number; sessions: number; charging: number; done: number };
}
