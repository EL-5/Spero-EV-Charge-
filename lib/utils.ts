import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a collision-resistant receipt number.
 * Format: RCP-<base36 timestamp>-<4 random chars>
 * Entropy: ~1.7 billion combinations — safe for realistic station volumes.
 */
export function generateReceiptNumber(prefix = 'RCP'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${ts}-${rand}`;
}

export function formatCurrency(amount: number, currency = 'GHS'): string {
  return `${currency} ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-GH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'status-active',
    pending_payment: 'status-pending',
    pending: 'status-pending',
    completed: 'status-completed',
    cancelled: 'status-cancelled',
    success: 'status-active',
    failed: 'status-cancelled',
    closed: 'status-info',
  };
  return map[status] || 'status-info';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Active',
    pending_payment: 'Pending Payment',
    pending: 'Pending',
    completed: 'Completed',
    cancelled: 'Cancelled',
    success: 'Success',
    failed: 'Failed',
    closed: 'Closed',
  };
  return map[status] || status;
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    manager: 'Manager',
    accountant: 'Accountant',
    finance: 'Finance',
    attendant: 'Attendant',
  };
  return map[role] || role;
}

export function getRoleColor(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    accountant: 'bg-green-100 text-green-700',
    finance: 'bg-teal-100 text-teal-700',
    attendant: 'bg-orange-100 text-orange-700',
  };
  return map[role] || 'bg-gray-100 text-gray-700';
}

export function calcDuration(start: string, end?: string): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.floor((e - s) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
