import type { Gun, ReviewFlag } from '@/lib/gun-session';

export interface GunSessionSummary {
  id: string;
  attendantId: string;
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
  session: GunSessionSummary | null;
  /** Set when the session on this gun belongs to someone else, or is old enough to be forgotten. */
  usedBy: { name: string; since: string; stale: boolean; mine: boolean } | null;
}

/** A price an attendant can choose when starting a session (Settings → Pricing). */
export interface PricingTier {
  id: string;
  unitType: 'kwh' | 'time';
  rate: number;
  unitQuantity: number;
  /** Price for one unit, e.g. GHS 5.50 per kWh */
  perUnit: number;
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
  /** Finished charges still waiting for payment (all days, this attendant). */
  pending: GunSessionSummary[];
  done: GunSessionSummary[];
  rates: PricingTier[];
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
  mode: 'postpaid' | 'prepaid';
  /** 'kwh' normally; 'time' for time-based prices */
  unitType: string;
  prepaidAmount: number;
  rate: number;
  paymentMethod: string | null;
  /** What the driver actually handed over (can be more than the amount due) */
  amountPaid: number | null;
  /** Registered drivers can leave extra money as wallet credit; guests cannot. */
  isGuest: boolean;
  walletBalance: number | null;
  batteryKwh: number | null;
  attendantName: string;
  isMine: boolean;
  /** A void request for this session is waiting for a manager. */
  voidPending: boolean;
  /** A photo of the MoMo confirmation has been saved. */
  hasPaymentProof: boolean;
}

export interface GunTotals {
  period: 'today' | 'week' | 'month';
  perGun: Record<Gun, { kwh: number; sessions: number }>;
  total: { kwh: number; sessions: number; charging: number; done: number };
}
