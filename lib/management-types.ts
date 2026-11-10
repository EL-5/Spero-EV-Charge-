import type { Gun, ReviewFlag } from '@/lib/gun-session';

export interface VoidItem {
  requestId: string;
  sessionId: string;
  receiptNumber: string;
  gun: Gun | null;
  driverName: string;
  amount: number;
  paymentStatus: string | null;
  paymentMethod: string | null;
  units: number | null;
  reason: string;
  detail: string | null;
  requestedBy: string;
  requestedAt: string;
}

export interface ReadingItem {
  sessionId: string;
  receiptNumber: string;
  gun: Gun;
  driverName: string;
  vehiclePlate: string;
  attendantName: string;
  startReading: number;
  endReading: number | null;
  units: number | null;
  amount: number | null;
  flags: ReviewFlag[];
  startGap: number | null;
  endedAt: string | null;
}

export interface TopUpItem {
  id: string;
  driverName: string;
  driverPhone: string;
  amount: number;
  method: string;
  reference: string | null;
  requestedAt: string;
}

export interface ApprovalQueue {
  voids: VoidItem[];
  readings: ReadingItem[];
  topups: TopUpItem[];
}

export interface SessionRecord {
  id: string;
  receiptNumber: string;
  gun: Gun | null;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  driverName: string;
  vehiclePlate: string;
  attendantName: string;
  startTime: string;
  endTime: string | null;
  units: number | null;
  amount: number | null;
  flags: ReviewFlag[];
  reviewed: boolean;
  recordedByHand: boolean;
}

export interface SessionEvidence extends SessionRecord {
  startReading: number | null;
  endReading: number | null;
  rate: number | null;
  startGap: number | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  /** Photo of the MoMo confirmation, kept for MoMo payments. */
  paymentProofUrl: string | null;
  reference: string | null;
  reviewDecision: string | null;
  reviewNote: string | null;
  voidReason: string | null;
  refundDue: number | null;
  voidPending: boolean;
}

export interface DailyCloseView {
  date: string;
  closed: boolean;
  closedBy: string | null;
  closedAt: string | null;
  openSessions: number;
  momo: { system: number; statement: number | null };
  wallet: { system: number; ledger: number };
  recorded: { A: number; B: number };
  /** Where the machine counters stood at the start of this day, when known. */
  opening: { A: number; B: number; total: number } | null;
  /** What was entered when the day was closed. */
  closing: { A: number; B: number; total: number } | null;
  notes: Record<string, string>;
  energyGapPercent: number;
}

export interface AuditRow {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}
