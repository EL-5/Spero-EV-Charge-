export type UserRole = 'super_admin' | 'manager' | 'accountant' | 'finance' | 'attendant';

export type SessionStatus = 'active' | 'pending_payment' | 'completed' | 'cancelled';
export type ChargingMode = 'prepaid' | 'postpaid';
export type UnitType = 'kwh' | 'minutes' | 'hours';
export type PaymentMethod = 'cash' | 'wallet' | 'mtn' | 'telecel' | 'airteltigo';
export type DriverType = 'individual' | 'corporate';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: DriverType;
  walletBalance: number;
  debtBalance: number;
  totalSessions: number;
  createdAt: string;
  corporateAccount?: string;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  plateNumber: string;
  driverId?: string;
  driverName?: string;
  corporateAccountId?: string;
  totalSessions: number;
  createdAt: string;
}

export interface Session {
  id: string;
  receiptNumber: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  attendantId: string;
  attendantName: string;
  shiftId?: string;
  mode: ChargingMode;
  status: SessionStatus;
  unitType: UnitType;
  rateAtTime: number;
  startTime: string;
  endTime?: string;
  unitsConsumed?: number;
  prepaidAmount?: number;
  targetUnits?: number;
  totalAmount?: number;
  walletDeduction?: number;
  paymentMethod?: PaymentMethod;
  paymentId?: string;
  notes?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  sessionId: string;
  receiptNumber: string;
  driverId: string;
  driverName: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  status: 'success' | 'failed' | 'pending';
  attendantId: string;
  attendantName: string;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  driverId: string;
  driverName: string;
  type: 'credit' | 'debit' | 'top_up' | 'bonus';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  sessionId?: string;
  createdBy: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  attendantId: string;
  attendantName: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'closed';
  cashCollected: number;
  hubtelCollected: number;
  paystackCollected: number;
  walletDeductions: number;
  totalSessions: number;
  outstandingDebts: number;
  notes?: string;
}

export interface PricingConfig {
  id: string;
  unitType: UnitType;
  unitQuantity: number;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
  createdBy: string;
  isActive: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export interface DashboardStats {
  revenueToday: number;
  revenueThisMonth: number;
  totalSessions: number;
  activeSessions: number;
  pendingPayments: number;
  totalKwhSold: number;
  walletBalancesHeld: number;
  outstandingDebts: number;
  cashRevenue: number;
  momoRevenue: number;
  walletRevenue: number;
  activeShifts: number;
  totalDrivers: number;
  totalVehicles: number;
}

export interface CorporateAccount {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  walletBalance: number;
  totalVehicles: number;
  totalSessions: number;
  createdAt: string;
}
