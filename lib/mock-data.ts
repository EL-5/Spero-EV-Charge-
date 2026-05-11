import type { Driver, Vehicle, Session, Payment, WalletTransaction, Shift, User, DashboardStats, AuditLog, CorporateAccount, PricingConfig } from './types';

export const mockCurrentUser: User = {
  id: 'u1',
  name: 'Kwame Mensah',
  email: 'kwame@spero.com',
  role: 'super_admin',
  phone: '+233 24 123 4567',
  isActive: true,
  createdAt: '2024-01-01',
  lastLogin: '2025-05-08T08:30:00',
};

export const mockUsers: User[] = [
  mockCurrentUser,
  { id: 'u2', name: 'Abena Asante', email: 'abena@spero.com', role: 'manager', phone: '+233 26 234 5678', isActive: true, createdAt: '2024-01-15', lastLogin: '2025-05-08T07:45:00' },
  { id: 'u3', name: 'Kofi Boateng', email: 'kofi@spero.com', role: 'accountant', phone: '+233 20 345 6789', isActive: true, createdAt: '2024-02-01', lastLogin: '2025-05-07T16:20:00' },
  { id: 'u4', name: 'Ama Owusu', email: 'ama@spero.com', role: 'attendant', phone: '+233 54 456 7890', isActive: true, createdAt: '2024-03-10', lastLogin: '2025-05-08T09:00:00' },
  { id: 'u5', name: 'Yaw Darko', email: 'yaw@spero.com', role: 'attendant', phone: '+233 55 567 8901', isActive: true, createdAt: '2024-04-01', lastLogin: '2025-05-07T18:30:00' },
  { id: 'u6', name: 'Efua Acheampong', email: 'efua@spero.com', role: 'attendant', phone: '+233 27 678 9012', isActive: false, createdAt: '2024-05-15', lastLogin: '2025-04-30T12:00:00' },
];

export const mockCorporateAccounts: CorporateAccount[] = [
  { id: 'ca1', companyName: 'GreenFleet Ghana Ltd', contactPerson: 'Michael Adu', phone: '+233 30 123 4567', email: 'fleet@greenfleet.com.gh', walletBalance: 2500.00, totalVehicles: 8, totalSessions: 145, createdAt: '2024-01-20' },
  { id: 'ca2', companyName: 'EcoRide Logistics', contactPerson: 'Felicia Nyarko', phone: '+233 24 987 6543', email: 'admin@ecoride.gh', walletBalance: 1200.50, totalVehicles: 5, totalSessions: 89, createdAt: '2024-03-05' },
  { id: 'ca3', companyName: 'Volta E-Transport', contactPerson: 'Samuel Tetteh', phone: '+233 26 111 2222', walletBalance: 4800.00, totalVehicles: 12, totalSessions: 203, createdAt: '2024-02-10' },
];

export const mockDrivers: Driver[] = [
  { id: 'd1', name: 'Ernest Osei', phone: '+233 24 111 2222', email: 'ernest@gmail.com', type: 'individual', walletBalance: 150.00, debtBalance: 0, totalSessions: 23, createdAt: '2024-02-15' },
  { id: 'd2', name: 'GreenFleet Ghana Ltd', phone: '+233 30 123 4567', type: 'corporate', walletBalance: 2500.00, debtBalance: 0, totalSessions: 145, createdAt: '2024-01-20', corporateAccount: 'ca1' },
  { id: 'd3', name: 'Akosua Frempong', phone: '+233 55 333 4444', type: 'individual', walletBalance: 0, debtBalance: 80.00, totalSessions: 12, createdAt: '2024-03-20' },
  { id: 'd4', name: 'Nii Okaifio', phone: '+233 20 555 6666', type: 'individual', walletBalance: 320.50, debtBalance: 0, totalSessions: 38, createdAt: '2024-01-05' },
  { id: 'd5', name: 'EcoRide Logistics', phone: '+233 24 987 6543', type: 'corporate', walletBalance: 1200.50, debtBalance: 0, totalSessions: 89, createdAt: '2024-03-05', corporateAccount: 'ca2' },
  { id: 'd6', name: 'Adjoa Mensah', phone: '+233 27 777 8888', email: 'adjoa@yahoo.com', type: 'individual', walletBalance: 45.00, debtBalance: 0, totalSessions: 7, createdAt: '2025-01-10' },
  { id: 'd7', name: 'Kofi Agyeman', phone: '+233 54 999 0000', type: 'individual', walletBalance: 0, debtBalance: 120.00, totalSessions: 15, createdAt: '2024-06-15' },
];

export const mockVehicles: Vehicle[] = [
  { id: 'v1', brand: 'Tesla', model: 'Model 3', plateNumber: 'GR-1234-24', driverId: 'd1', driverName: 'Ernest Osei', totalSessions: 23, createdAt: '2024-02-15' },
  { id: 'v2', brand: 'Nissan', model: 'Leaf', plateNumber: 'GA-5678-23', driverId: 'd3', driverName: 'Akosua Frempong', totalSessions: 12, createdAt: '2024-03-20' },
  { id: 'v3', brand: 'BYD', model: 'Atto 3', plateNumber: 'AE-9012-24', driverId: 'd4', driverName: 'Nii Okaifio', totalSessions: 38, createdAt: '2024-01-05' },
  { id: 'v4', brand: 'Hyundai', model: 'Ioniq 5', plateNumber: 'GW-3456-24', driverId: 'd6', driverName: 'Adjoa Mensah', totalSessions: 7, createdAt: '2025-01-10' },
  { id: 'v5', brand: 'BYD', model: 'Han', plateNumber: 'GR-7890-23', corporateAccountId: 'ca1', totalSessions: 45, createdAt: '2024-01-20' },
  { id: 'v6', brand: 'Toyota', model: 'bZ4X', plateNumber: 'GA-2345-24', corporateAccountId: 'ca1', totalSessions: 32, createdAt: '2024-01-20' },
  { id: 'v7', brand: 'Kia', model: 'EV6', plateNumber: 'AE-6789-24', driverId: 'd7', driverName: 'Kofi Agyeman', totalSessions: 15, createdAt: '2024-06-15' },
];

export const mockSessions: Session[] = [
  {
    id: 's1', receiptNumber: 'RCP-0001', driverId: 'd1', driverName: 'Ernest Osei', vehicleId: 'v1', vehiclePlate: 'GR-1234-24',
    attendantId: 'u4', attendantName: 'Ama Owusu', shiftId: 'sh1', mode: 'postpaid', status: 'completed',
    unitType: 'kwh', rateAtTime: 5.50, startTime: '2025-05-08T09:00:00', endTime: '2025-05-08T10:30:00',
    unitsConsumed: 20.5, totalAmount: 112.75, walletDeduction: 0, paymentMethod: 'cash', createdAt: '2025-05-08T09:00:00',
  },
  {
    id: 's2', receiptNumber: 'RCP-0002', driverId: 'd4', driverName: 'Nii Okaifio', vehicleId: 'v3', vehiclePlate: 'AE-9012-24',
    attendantId: 'u4', attendantName: 'Ama Owusu', shiftId: 'sh1', mode: 'prepaid', status: 'active',
    unitType: 'kwh', rateAtTime: 5.50, startTime: '2025-05-08T11:00:00',
    prepaidAmount: 200.00, targetUnits: 36.36, createdAt: '2025-05-08T11:00:00',
  },
  {
    id: 's3', receiptNumber: 'RCP-0003', driverId: 'd2', driverName: 'GreenFleet Ghana Ltd', vehicleId: 'v5', vehiclePlate: 'GR-7890-23',
    attendantId: 'u5', attendantName: 'Yaw Darko', mode: 'postpaid', status: 'pending_payment',
    unitType: 'kwh', rateAtTime: 5.50, startTime: '2025-05-08T08:30:00', endTime: '2025-05-08T10:00:00',
    unitsConsumed: 25.0, totalAmount: 137.50, createdAt: '2025-05-08T08:30:00',
  },
  {
    id: 's4', receiptNumber: 'RCP-0004', driverId: 'd6', driverName: 'Adjoa Mensah', vehicleId: 'v4', vehiclePlate: 'GW-3456-24',
    attendantId: 'u4', attendantName: 'Ama Owusu', shiftId: 'sh1', mode: 'postpaid', status: 'completed',
    unitType: 'kwh', rateAtTime: 5.50, startTime: '2025-05-07T14:00:00', endTime: '2025-05-07T15:30:00',
    unitsConsumed: 15.2, totalAmount: 83.60, walletDeduction: 45.00, paymentMethod: 'wallet', createdAt: '2025-05-07T14:00:00',
  },
  {
    id: 's5', receiptNumber: 'RCP-0005', driverId: 'd3', driverName: 'Akosua Frempong', vehicleId: 'v2', vehiclePlate: 'GA-5678-23',
    attendantId: 'u5', attendantName: 'Yaw Darko', mode: 'postpaid', status: 'cancelled',
    unitType: 'kwh', rateAtTime: 5.50, startTime: '2025-05-07T10:00:00', cancelReason: 'Customer requested cancellation',
    createdAt: '2025-05-07T10:00:00',
  },
  {
    id: 's6', receiptNumber: 'RCP-0006', driverId: 'd4', driverName: 'Nii Okaifio', vehicleId: 'v3', vehiclePlate: 'AE-9012-24',
    attendantId: 'u4', attendantName: 'Ama Owusu', mode: 'postpaid', status: 'completed',
    unitType: 'kwh', rateAtTime: 5.20, startTime: '2025-05-06T09:00:00', endTime: '2025-05-06T11:00:00',
    unitsConsumed: 30.0, totalAmount: 156.00, walletDeduction: 0, paymentMethod: 'hubtel', createdAt: '2025-05-06T09:00:00',
  },
];

export const mockPayments: Payment[] = [
  { id: 'p1', sessionId: 's1', receiptNumber: 'RCP-0001', driverId: 'd1', driverName: 'Ernest Osei', amount: 112.75, method: 'cash', status: 'success', attendantId: 'u4', attendantName: 'Ama Owusu', createdAt: '2025-05-08T10:35:00' },
  { id: 'p2', sessionId: 's4', receiptNumber: 'RCP-0004', driverId: 'd6', driverName: 'Adjoa Mensah', amount: 83.60, method: 'wallet', status: 'success', attendantId: 'u4', attendantName: 'Ama Owusu', createdAt: '2025-05-07T15:35:00' },
  { id: 'p3', sessionId: 's6', receiptNumber: 'RCP-0006', driverId: 'd4', driverName: 'Nii Okaifio', amount: 156.00, method: 'hubtel', reference: 'HBT-20250506-9876', status: 'success', attendantId: 'u4', attendantName: 'Ama Owusu', createdAt: '2025-05-06T11:05:00' },
  { id: 'p4', sessionId: 's2', receiptNumber: 'RCP-0002', driverId: 'd4', driverName: 'Nii Okaifio', amount: 200.00, method: 'paystack', reference: 'PSK-20250508-1234', status: 'success', attendantId: 'u4', attendantName: 'Ama Owusu', createdAt: '2025-05-08T11:05:00' },
];

export const mockWalletTransactions: WalletTransaction[] = [
  { id: 'wt1', driverId: 'd1', driverName: 'Ernest Osei', type: 'top_up', amount: 300.00, balanceBefore: 0, balanceAfter: 300.00, description: 'Wallet top-up', createdBy: 'Kofi Boateng', createdAt: '2025-04-01T10:00:00' },
  { id: 'wt2', driverId: 'd1', driverName: 'Ernest Osei', type: 'debit', amount: 150.00, balanceBefore: 300.00, balanceAfter: 150.00, description: 'Session deduction RCP-0001', sessionId: 's1', createdBy: 'System', createdAt: '2025-05-08T10:35:00' },
  { id: 'wt3', driverId: 'd6', driverName: 'Adjoa Mensah', type: 'credit', amount: 45.00, balanceBefore: 0, balanceAfter: 45.00, description: 'Overpayment credit RCP-0003', createdBy: 'System', createdAt: '2025-04-15T14:00:00' },
  { id: 'wt4', driverId: 'd6', driverName: 'Adjoa Mensah', type: 'debit', amount: 45.00, balanceBefore: 45.00, balanceAfter: 0, description: 'Session deduction RCP-0004', sessionId: 's4', createdBy: 'System', createdAt: '2025-05-07T15:35:00' },
  { id: 'wt5', driverId: 'd4', driverName: 'Nii Okaifio', type: 'top_up', amount: 500.00, balanceBefore: 0, balanceAfter: 500.00, description: 'Wallet top-up', createdBy: 'Kofi Boateng', createdAt: '2025-03-10T09:00:00' },
  { id: 'wt6', driverId: 'd4', driverName: 'Nii Okaifio', type: 'bonus', amount: 50.00, balanceBefore: 320.50, balanceAfter: 370.50, description: 'Loyalty bonus', createdBy: 'Kwame Mensah', createdAt: '2025-05-01T12:00:00' },
];

export const mockShifts: Shift[] = [
  { id: 'sh1', attendantId: 'u4', attendantName: 'Ama Owusu', startTime: '2025-05-08T08:00:00', status: 'active', cashCollected: 112.75, hubtelCollected: 0, paystackCollected: 200.00, walletDeductions: 83.60, totalSessions: 3, outstandingDebts: 137.50 },
  { id: 'sh2', attendantId: 'u5', attendantName: 'Yaw Darko', startTime: '2025-05-07T08:00:00', endTime: '2025-05-07T20:00:00', status: 'closed', cashCollected: 256.00, hubtelCollected: 156.00, paystackCollected: 0, walletDeductions: 0, totalSessions: 5, outstandingDebts: 0 },
  { id: 'sh3', attendantId: 'u4', attendantName: 'Ama Owusu', startTime: '2025-05-07T08:00:00', endTime: '2025-05-07T20:00:00', status: 'closed', cashCollected: 189.50, hubtelCollected: 83.60, paystackCollected: 100.00, walletDeductions: 45.00, totalSessions: 6, outstandingDebts: 80.00 },
];

export const mockPricingHistory: PricingConfig[] = [
  { id: 'pr1', unitType: 'kwh', unitQuantity: 1, pricePerUnit: 5.50, currency: 'GHS', effectiveFrom: '2025-01-01', createdBy: 'Kwame Mensah', isActive: true },
  { id: 'pr2', unitType: 'kwh', unitQuantity: 1, pricePerUnit: 5.20, currency: 'GHS', effectiveFrom: '2024-06-01', createdBy: 'Kwame Mensah', isActive: false },
  { id: 'pr3', unitType: 'minutes', unitQuantity: 1, pricePerUnit: 1.20, currency: 'GHS', effectiveFrom: '2025-01-01', createdBy: 'Kwame Mensah', isActive: true },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'al1', userId: 'u4', userName: 'Ama Owusu', action: 'CREATE', resource: 'Session', resourceId: 's1', details: 'Created charging session for Ernest Osei', createdAt: '2025-05-08T09:00:00' },
  { id: 'al2', userId: 'u4', userName: 'Ama Owusu', action: 'UPDATE', resource: 'Session', resourceId: 's1', details: 'Completed session - 20.5 kWh recorded', createdAt: '2025-05-08T10:30:00' },
  { id: 'al3', userId: 'u4', userName: 'Ama Owusu', action: 'CREATE', resource: 'Payment', resourceId: 'p1', details: 'Cash payment GHS 112.75 received', createdAt: '2025-05-08T10:35:00' },
  { id: 'al4', userId: 'u1', userName: 'Kwame Mensah', action: 'UPDATE', resource: 'PricingConfig', resourceId: 'pr1', details: 'Updated kWh rate to GHS 5.50', createdAt: '2025-01-01T08:00:00' },
  { id: 'al5', userId: 'u5', userName: 'Yaw Darko', action: 'CANCEL', resource: 'Session', resourceId: 's5', details: 'Session cancelled: Customer requested cancellation', createdAt: '2025-05-07T10:15:00' },
  { id: 'al6', userId: 'u3', userName: 'Kofi Boateng', action: 'CREATE', resource: 'WalletTransaction', resourceId: 'wt1', details: 'Wallet top-up GHS 300 for Ernest Osei', createdAt: '2025-04-01T10:00:00' },
];

export const mockDashboardStats: DashboardStats = {
  revenueToday: 496.35,
  revenueThisMonth: 14823.50,
  totalSessions: 312,
  activeSessions: 2,
  pendingPayments: 137.50,
  totalKwhSold: 2847.5,
  walletBalancesHeld: 4215.50,
  outstandingDebts: 200.00,
  cashRevenue: 5432.75,
  hubtelRevenue: 4890.25,
  paystackRevenue: 4500.50,
  activeShifts: 1,
  totalDrivers: 45,
  totalVehicles: 42,
};

export const mockRevenueData = [
  { day: 'Mon', revenue: 1850, sessions: 42 },
  { day: 'Tue', revenue: 2100, sessions: 48 },
  { day: 'Wed', revenue: 1650, sessions: 38 },
  { day: 'Thu', revenue: 2450, sessions: 55 },
  { day: 'Fri', revenue: 2800, sessions: 63 },
  { day: 'Sat', revenue: 3100, sessions: 71 },
  { day: 'Sun', revenue: 1200, sessions: 28 },
];

export const mockMonthlyRevenue = [
  { month: 'Jan', revenue: 12500, sessions: 285 },
  { month: 'Feb', revenue: 11800, sessions: 270 },
  { month: 'Mar', revenue: 13200, sessions: 302 },
  { month: 'Apr', revenue: 14100, sessions: 320 },
  { month: 'May', revenue: 14823, sessions: 312 },
];

export const mockPaymentDistribution = [
  { name: 'Cash', value: 36.6, color: '#1d4ed8' },
  { name: 'Hubtel', value: 33.0, color: '#3b82f6' },
  { name: 'Paystack', value: 30.4, color: '#93c5fd' },
];
