'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { logAudit } from '@/lib/audit';
import { loadLimits } from '@/lib/limits-server';
import { energyCheck, machineTotalsAdd, moneyCheck, parseReading, roundKwh, roundMoney } from '@/lib/gun-session';
import type { DailyCloseView } from '@/lib/management-types';

// ─────────────────────────────────────────────────────────────────────────────
// Daily close. At the end of the day a manager enters what the outside world
// says (the MoMo statement total, the charging machine's own counters) and the
// system compares it with what it recorded. Anything that does not match needs
// a written explanation. Once saved, the day is locked in the database.
// The station runs on UTC+0, so a day is a UTC day.
// ─────────────────────────────────────────────────────────────────────────────

const MANAGERS = ['super_admin', 'manager'];
type Fail = { success: false; error: string };
const fail = (error: string): Fail => ({ success: false, error });

function authMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  return msg.startsWith('Unauthenticated') || msg.startsWith('Forbidden') ? msg : null;
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00.000Z`).getTime());
const todayUtc = () => new Date().toISOString().slice(0, 10);
const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00.000Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

interface DayFigures {
  openSessions: number;
  momoSystem: number;
  momoVoided: number;
  walletSystem: number;
  walletLedger: number;
  recorded: { A: number; B: number };
}

/** Everything the system itself knows about one day. */
async function figuresFor(date: string): Promise<DayFigures> {
  const start = `${date}T00:00:00.000Z`;
  const end = `${nextDay(date)}T00:00:00.000Z`;

  const [open, pays, sess, debits, reversals] = await Promise.all([
    supabaseAdmin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('recording_mode', 'manual_gun')
      .in('status', ['active', 'pending_payment'])
      .lt('start_time', end),
    supabaseAdmin.from('payments').select('amount, method, session_id').gte('created_at', start).lt('created_at', end),
    // Energy counts voided sessions too: the machine really delivered it.
    supabaseAdmin
      .from('sessions')
      .select('gun, units_consumed')
      .eq('recording_mode', 'manual_gun')
      .not('units_consumed', 'is', null)
      .gte('start_time', start)
      .lt('start_time', end),
    supabaseAdmin
      .from('wallet_transactions')
      .select('amount')
      .eq('type', 'debit')
      .not('session_id', 'is', null)
      .gte('created_at', start)
      .lt('created_at', end),
    supabaseAdmin
      .from('wallet_transactions')
      .select('amount')
      .eq('type', 'credit')
      .not('session_id', 'is', null)
      .like('description', 'Reversed:%')
      .gte('created_at', start)
      .lt('created_at', end),
  ]);

  const payments = (pays.data || []) as { amount: number | string; method: string; session_id: string | null }[];
  const momo = payments.filter((p) => p.method !== 'wallet' && p.method !== 'cash');
  const wallet = payments.filter((p) => p.method === 'wallet');

  // MoMo that was received but later voided: still on the provider statement, owed back to the driver.
  const momoIds = momo.map((p) => p.session_id).filter((x): x is string => !!x);
  let momoVoided = 0;
  if (momoIds.length) {
    const { data: voided } = await supabaseAdmin.from('sessions').select('id, total_amount').in('id', momoIds).eq('status', 'cancelled');
    momoVoided = (voided || []).reduce((s, r) => s + Number((r as { total_amount: number | string }).total_amount || 0), 0);
  }

  const sum = (rows: { amount: number | string }[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const recorded = { A: 0, B: 0 };
  for (const r of (sess.data || []) as { gun: string | null; units_consumed: number | string }[]) {
    if (r.gun === 'A') recorded.A += Number(r.units_consumed || 0);
    if (r.gun === 'B') recorded.B += Number(r.units_consumed || 0);
  }

  return {
    openSessions: open.count || 0,
    momoSystem: roundMoney(sum(momo)),
    momoVoided: roundMoney(momoVoided),
    walletSystem: roundMoney(sum(wallet)),
    walletLedger: roundMoney(sum((debits.data || []) as { amount: number }[]) - sum((reversals.data || []) as { amount: number }[])),
    recorded: { A: roundKwh(recorded.A), B: roundKwh(recorded.B) },
  };
}

interface CloseRow {
  close_date: string;
  momo_system: number | string; momo_statement: number | string;
  wallet_system: number | string; wallet_ledger: number | string;
  recorded_a: number | string; recorded_b: number | string;
  machine_a_start: number | string; machine_b_start: number | string; machine_total_start: number | string;
  machine_a_end: number | string; machine_b_end: number | string; machine_total_end: number | string;
  notes: Record<string, string> | null; closed_by: string; closed_at: string;
}

export type DailyCloseData = DailyCloseView & {
  momoVoided: number;
  /** The day that has to be closed before this one, when days were skipped. */
  mustCloseFirst: string | null;
  /** True when no day has ever been closed, so the opening counters must be typed in. */
  needsOpening: boolean;
};

export async function getDailyClose(date: string): Promise<{ success: true; data: DailyCloseData } | Fail> {
  try {
    await requireAuth(MANAGERS);
    if (!isDate(date)) return fail('Choose a valid date.');
    if (date > todayUtc()) return fail('That day has not happened yet.');

    const [limits, figures, existing, last] = await Promise.all([
      loadLimits(),
      figuresFor(date),
      supabaseAdmin.from('daily_closes').select('*').eq('close_date', date).maybeSingle(),
      supabaseAdmin.from('daily_closes').select('*').lt('close_date', date).order('close_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (existing.error && existing.error.code !== 'PGRST116') {
      console.error('[CLOSE] read error:', existing.error);
      return fail('Could not load the daily close. Has the latest database update (migration 11) been run?');
    }

    const row = existing.data as CloseRow | null;
    const prev = last.data as CloseRow | null;
    let closedByName: string | null = null;
    if (row) {
      const { data: p } = await supabaseAdmin.from('profiles').select('name').eq('id', row.closed_by).maybeSingle();
      closedByName = (p as { name?: string } | null)?.name || null;
    }

    const opening = row
      ? { A: Number(row.machine_a_start), B: Number(row.machine_b_start), total: Number(row.machine_total_start) }
      : prev
        ? { A: Number(prev.machine_a_end), B: Number(prev.machine_b_end), total: Number(prev.machine_total_end) }
        : null;

    const expectedNext = prev ? nextDay(prev.close_date) : null;

    return {
      success: true,
      data: {
        date,
        closed: !!row,
        closedBy: closedByName,
        closedAt: row?.closed_at ?? null,
        openSessions: figures.openSessions,
        momo: { system: figures.momoSystem, statement: row ? Number(row.momo_statement) : null },
        wallet: { system: figures.walletSystem, ledger: figures.walletLedger },
        recorded: row ? { A: Number(row.recorded_a), B: Number(row.recorded_b) } : figures.recorded,
        opening,
        closing: row ? { A: Number(row.machine_a_end), B: Number(row.machine_b_end), total: Number(row.machine_total_end) } : null,
        notes: row?.notes || {},
        energyGapPercent: limits.energyGapPercent,
        momoVoided: figures.momoVoided,
        mustCloseFirst: !row && expectedNext && date > expectedNext ? expectedNext : null,
        needsOpening: !row && !prev,
      },
    };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[CLOSE] getDailyClose error:', err);
    return fail('Could not load the daily close.');
  }
}

export interface CloseDayInput {
  date: string;
  momoStatement: string;
  machineAEnd: string;
  machineBEnd: string;
  machineTotalEnd: string;
  /** Only used for the very first close, when there is no previous day to start from. */
  openingA?: string;
  openingB?: string;
  openingTotal?: string;
  notes?: Partial<Record<'momo' | 'wallet' | 'energy_a' | 'energy_b' | 'energy_total', string>>;
}

export async function closeDay(input: CloseDayInput): Promise<{ success: true } | Fail> {
  try {
    const user = await requireAuth(MANAGERS);
    const view = await getDailyClose(input.date);
    if (!view.success) return view;
    const d = view.data;

    if (d.closed) return fail('This day is already closed.');
    if (d.mustCloseFirst) return fail(`Close ${d.mustCloseFirst} first. Days are closed in order.`);
    if (d.openSessions > 0) {
      return fail(`${d.openSessions} session${d.openSessions === 1 ? ' is' : 's are'} still charging or waiting for payment. Finish or void ${d.openSessions === 1 ? 'it' : 'them'} first.`);
    }

    const statement = Number(String(input.momoStatement).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(statement) || String(input.momoStatement).trim() === '') return fail('Enter the MoMo statement total for the day.');

    const aEnd = parseReading(input.machineAEnd);
    const bEnd = parseReading(input.machineBEnd);
    const totalEnd = parseReading(input.machineTotalEnd);
    if (aEnd === null || bEnd === null || totalEnd === null) return fail('Enter all three machine counters: Gun A, Gun B and the total.');
    if (!machineTotalsAdd(aEnd, bEnd, totalEnd)) return fail('Gun A plus Gun B does not equal the machine total. Check the three numbers you typed.');

    let opening = d.opening;
    if (!opening) {
      const oa = parseReading(input.openingA ?? '');
      const ob = parseReading(input.openingB ?? '');
      const ot = parseReading(input.openingTotal ?? '');
      if (oa === null || ob === null || ot === null) return fail('This is the first close, so enter where the three machine counters stood this morning.');
      if (!machineTotalsAdd(oa, ob, ot)) return fail('The opening Gun A plus Gun B does not equal the opening total.');
      opening = { A: oa, B: ob, total: ot };
    }
    if (aEnd < opening.A || bEnd < opening.B || totalEnd < opening.total) {
      return fail('A closing counter is lower than the opening one. Machine counters only go up.');
    }

    const limits = await loadLimits();
    const money = moneyCheck(d.momo.system, statement);
    const wallet = moneyCheck(d.wallet.system, d.wallet.ledger);
    const eA = energyCheck(d.recorded.A, aEnd - opening.A, limits);
    const eB = energyCheck(d.recorded.B, bEnd - opening.B, limits);
    const eT = energyCheck(d.recorded.A + d.recorded.B, totalEnd - opening.total, limits);

    const notes = input.notes || {};
    const needed: [string, boolean, string][] = [
      ['momo', money.flagged, 'the MoMo difference'],
      ['wallet', wallet.flagged, 'the wallet difference'],
      ['energy_a', eA.flagged, 'the Gun A energy gap'],
      ['energy_b', eB.flagged, 'the Gun B energy gap'],
      ['energy_total', eT.flagged, 'the total energy gap'],
    ];
    const saved: Record<string, string> = {};
    for (const [key, flagged, label] of needed) {
      const note = String((notes as Record<string, string | undefined>)[key] || '').trim();
      if (flagged) {
        if (note.length < 5) return fail(`Explain ${label} before closing the day.`);
        saved[key] = note;
      }
    }

    // The database refuses a second row for the same date, so two managers cannot both close it.
    const { error } = await supabaseAdmin.from('daily_closes').insert([
      {
        close_date: d.date,
        momo_system: d.momo.system,
        momo_statement: roundMoney(statement),
        wallet_system: d.wallet.system,
        wallet_ledger: d.wallet.ledger,
        recorded_a: d.recorded.A,
        recorded_b: d.recorded.B,
        machine_a_start: opening.A,
        machine_b_start: opening.B,
        machine_total_start: opening.total,
        machine_a_end: aEnd,
        machine_b_end: bEnd,
        machine_total_end: totalEnd,
        notes: saved,
        closed_by: user.id,
      },
    ]);
    if (error) {
      if ((error as { code?: string }).code === '23505') return fail('This day was just closed by someone else.');
      console.error('[CLOSE] insert error:', error);
      return fail('Could not close the day. Please try again.');
    }

    await logAudit({
      actor: user,
      action: 'day.close',
      resourceType: 'daily_close',
      resourceId: d.date,
      metadata: {
        momoDiff: money.diff,
        walletDiff: wallet.diff,
        energyDiff: { A: eA.diff, B: eB.diff, total: eT.diff },
        flagged: needed.filter((n) => n[1]).map((n) => n[0]),
      },
    });
    revalidatePath('/daily-close');
    return { success: true };
  } catch (err) {
    const m = authMessage(err);
    if (m) return fail(m);
    console.error('[CLOSE] closeDay error:', err);
    return fail('Could not close the day. Please try again.');
  }
}

/** Past closes, newest first, for the history list. */
export async function listDailyCloses(): Promise<
  { success: true; data: { date: string; momoDiff: number; walletDiff: number; energyDiff: number; flagged: boolean }[] } | Fail
> {
  try {
    await requireAuth(MANAGERS);
    const { data, error } = await supabaseAdmin.from('daily_closes').select('*').order('close_date', { ascending: false }).limit(60);
    if (error) return { success: true, data: [] };
    const limits = await loadLimits();
    return {
      success: true,
      data: ((data || []) as CloseRow[]).map((r) => {
        const momoDiff = roundMoney(Number(r.momo_statement) - Number(r.momo_system));
        const walletDiff = roundMoney(Number(r.wallet_ledger) - Number(r.wallet_system));
        const eT = energyCheck(Number(r.recorded_a) + Number(r.recorded_b), Number(r.machine_total_end) - Number(r.machine_total_start), limits);
        return {
          date: r.close_date,
          momoDiff,
          walletDiff,
          energyDiff: eT.diff,
          flagged: Math.abs(momoDiff) >= 0.01 || Math.abs(walletDiff) >= 0.01 || eT.flagged,
        };
      }),
    };
  } catch (err) {
    return fail(authMessage(err) || 'Could not load past closes.');
  }
}
