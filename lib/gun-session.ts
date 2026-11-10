/**
 * Pure rules for manually recorded charging sessions (Gun A / Gun B).
 *
 * Kept free of database and framework imports so the same rules can be unit
 * tested and reused by both server actions and screens.
 */

export type Gun = 'A' | 'B';
export const GUNS: Gun[] = ['A', 'B'];

/**
 * Does the station take cash?
 * The old attendant dashboard told attendants "CASH: do not start charging —
 * Mobile Money only". The redesign allows cash because shifts already count it.
 * Set this to false to go back to MoMo and wallet only: the cash option
 * disappears and the server refuses cash payments.
 */
export const ACCEPT_CASH = false;

export type PayChoice = 'cash' | 'momo' | 'wallet';
export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo';

/** Flags attached to a session so a manager reviews it. */
export type ReviewFlag =
  | 'start_gap' // start reading is higher than the gun's last end reading
  | 'exceeds_battery' // more energy than the car's battery can hold
  | 'impossible_power' // more energy than the machine can deliver in that time
  | 'long_session'; // ran for several hours

export const REVIEW_FLAG_LABEL: Record<ReviewFlag, string> = {
  start_gap: 'Energy went through this gun without being recorded',
  exceeds_battery: 'More energy than the battery can hold',
  impossible_power: 'More energy than the machine can deliver in that time',
  long_session: 'Session ran for a very long time',
};

/** Reading may differ from the last end reading by this much before it is flagged (kWh). */
export const GAP_TOLERANCE_KWH = 0.5;
/** Most one gun can deliver, in kW. Above this (with margin) the figures cannot both be right. */
export const MAX_GUN_KW = 60;
export const POWER_MARGIN = 1.15;
export const LONG_SESSION_HOURS = 4;
/** A battery cannot take more than its capacity; allow a little for rounding on the display. */
export const BATTERY_MARGIN = 1.05;

/** Parse what an attendant typed into a kWh reading. Returns null if it is not a usable number. */
export function parseReading(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[,\s]/g, '');
  if (cleaned === '' || !/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return n;
}

export function roundKwh(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Energy and bill from two readings. The rate was fixed when the session started. */
export function computeBill(startReading: number, endReading: number, ratePerKwh: number) {
  const units = roundKwh(endReading - startReading);
  const amount = roundMoney(units * ratePerKwh);
  return { units, amount };
}

/** How far the start reading is from where this gun last stopped. null when there is no earlier reading. */
export function computeStartGap(startReading: number, lastEndReading: number | null): number | null {
  if (lastEndReading === null) return null;
  return roundKwh(startReading - lastEndReading);
}

export function startReadingProblem(startReading: number, lastEndReading: number | null): string | null {
  if (lastEndReading !== null && startReading < lastEndReading - 0.0005) {
    return `Gun readings only go up. This gun last ended at ${lastEndReading.toFixed(1)} kWh, so ${startReading.toFixed(1)} cannot be right. Check the display.`;
  }
  return null;
}

export function endReadingProblem(startReading: number, endReading: number): string | null {
  if (endReading <= startReading) {
    return `The end reading must be higher than the start reading (${startReading.toFixed(1)} kWh). If no energy was delivered, void the session instead.`;
  }
  return null;
}

/** Limits a super admin can change (Settings → Limits). */
export interface StationLimits {
  /** Daily energy gap, as a percentage of recorded kWh, allowed without a note. */
  energyGapPercent: number;
  longSessionHours: number;
  maxGunKw: number;
}
export const DEFAULT_LIMITS: StationLimits = {
  energyGapPercent: 2,
  longSessionHours: LONG_SESSION_HOURS,
  maxGunKw: MAX_GUN_KW,
};

export function evaluateFlags(
  args: {
    startGap: number | null;
    units?: number;
    batteryKwh?: number | null;
    startedAt?: Date;
    endedAt?: Date;
  },
  limits: StationLimits = DEFAULT_LIMITS
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (args.startGap !== null && Math.abs(args.startGap) > GAP_TOLERANCE_KWH) flags.push('start_gap');

  if (args.units !== undefined) {
    if (args.batteryKwh && args.batteryKwh > 0 && args.units > args.batteryKwh * BATTERY_MARGIN) {
      flags.push('exceeds_battery');
    }
    if (args.startedAt && args.endedAt) {
      const hours = Math.max((args.endedAt.getTime() - args.startedAt.getTime()) / 3_600_000, 1 / 3600);
      if (args.units / hours > limits.maxGunKw * POWER_MARGIN) flags.push('impossible_power');
      if (hours > limits.longSessionHours) flags.push('long_session');
    }
  }
  return flags;
}

/** Map the attendant's choice onto the payment method stored in the database. */
export function dbPaymentMethod(choice: PayChoice, network?: MomoNetwork): string {
  if (choice === 'cash') return 'cash';
  if (choice === 'wallet') return 'wallet';
  return network ?? 'mtn';
}

/** MoMo transaction IDs are compared in a normalised form so "mp26 11" and "MP2611" count as the same. */
export function normaliseMomoReference(ref: string): string {
  return ref.replace(/\s+/g, '').toUpperCase();
}

/** Total of a cash count entered by denomination. */
export const DENOMINATIONS = [200, 100, 50, 20, 10, 5] as const;
export function sumCashCount(counts: Record<string, number>, coins: number): number {
  const notes = DENOMINATIONS.reduce((sum, d) => sum + d * Math.max(0, Math.floor(counts[String(d)] || 0)), 0);
  return roundMoney(notes + Math.max(0, coins || 0));
}

// ── Daily close ──────────────────────────────────────────────────────────────

export interface EnergyCheck {
  recorded: number;
  machine: number;
  /** machine − recorded: positive means the machine delivered more than was recorded */
  diff: number;
  percent: number;
  flagged: boolean;
}

/** Compare the kWh attendants recorded with what the machine's own counter moved by. */
export function energyCheck(recorded: number, machineDelta: number, limits: StationLimits = DEFAULT_LIMITS): EnergyCheck {
  const diff = roundKwh(machineDelta - recorded);
  const percent = recorded > 0 ? Math.round((diff / recorded) * 1000) / 10 : diff === 0 ? 0 : 100;
  const flagged = Math.abs(diff) > GAP_TOLERANCE_KWH && Math.abs(percent) > limits.energyGapPercent;
  return { recorded: roundKwh(recorded), machine: roundKwh(machineDelta), diff, percent, flagged };
}

export interface MoneyCheck {
  system: number;
  other: number;
  /** other − system */
  diff: number;
  flagged: boolean;
}

export function moneyCheck(system: number, other: number): MoneyCheck {
  const diff = roundMoney(other - system);
  return { system: roundMoney(system), other: roundMoney(other), diff, flagged: Math.abs(diff) >= 0.01 };
}

/** The machine's A and B counters should add up to its total counter. */
export function machineTotalsAdd(a: number, b: number, total: number): boolean {
  return Math.abs(roundKwh(a + b) - roundKwh(total)) <= GAP_TOLERANCE_KWH;
}
