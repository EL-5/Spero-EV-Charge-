'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { listDriversForPicker, searchDrivers, startGunSession } from '@/app/actions/gun-sessions';
import { GUNS, type Gun } from '@/lib/gun-session';
import type { DriverMatch, WorkspaceData } from '@/lib/gun-session-types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  workspace: WorkspaceData;
  onStarted: (sessionId: string) => void;
}

export default function StartSessionPanel({ workspace, onStarted }: Props) {
  const firstFree = GUNS.find((g) => !workspace.guns[g].inUse) ?? null;
  const [pickedGun, setGun] = useState<Gun | null>(null);
  // Derived, not synced: if the chosen gun is taken on another tablet, fall back to a free one.
  const gun: Gun | null = pickedGun && !workspace.guns[pickedGun].inUse ? pickedGun : firstFree;
  const [guest, setGuest] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [driver, setDriver] = useState<DriverMatch | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search waits for a short pause in typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: matches = [], isFetching: searching } = useQuery<DriverMatch[]>({
    queryKey: ['driver-search', debounced],
    queryFn: async () => {
      const res = await searchDrivers(debounced);
      return res.success ? res.data : [];
    },
    enabled: !guest && !driver && debounced.length >= 2,
    staleTime: 30_000,
    refetchInterval: false,
  });

  // Everyone registered, for the drop-down
  const { data: allDrivers = [], isLoading: loadingList } = useQuery<DriverMatch[]>({
    queryKey: ['driver-list'],
    queryFn: async () => {
      const res = await listDriversForPicker();
      return res.success ? res.data : [];
    },
    enabled: !guest && !driver,
    staleTime: 60_000,
    refetchInterval: false,
  });

  const pickDriver = (m: DriverMatch) => {
    setDriver(m);
    setVehicleId(m.vehicles.length === 1 ? m.vehicles[0].id : '');
  };

  const whoOk = guest ? guestPlate.trim().length >= 3 : !!driver && !!vehicleId;
  const needsShift = !workspace.shift && workspace.user.role === 'attendant';
  const canSubmit = !!gun && whoOk && !needsShift && !submitting;

  const hint = useMemo(() => {
    if (needsShift) return 'Start your shift first.';
    if (!gun) return 'Both guns are in use. Finish a session to free a gun.';
    if (!whoOk) return guest ? 'Enter the car number plate.' : 'Choose the driver and the car.';
    return 'Plug in the gun, then start. You log the kWh after charging.';
  }, [needsShift, gun, whoOk, guest]);

  const submit = async () => {
    if (!canSubmit || !gun) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set('gun', gun);
    fd.set('isGuest', String(guest));
    if (guest) {
      fd.set('guestName', guestName);
      fd.set('guestPlate', guestPlate);
    } else {
      fd.set('driverId', driver!.driverId);
      fd.set('vehicleId', vehicleId);
    }
    const res = await startGunSession(fd);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Session started on Gun ${gun}`);
    onStarted(res.sessionId);
  };

  return (
    <section aria-label="Start a session" className="att-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="att-display text-2xl font-bold">Start a session</h2>
        {gun && <span className="att-chip att-chip-mute">Gun {gun} free</span>}
      </div>

      {needsShift && (
        <div className="rounded-2xl bg-[#fde7cc] p-4 text-sm font-medium text-[#7a3b00]">
          You have no open shift.{' '}
          <Link href="/attend/shift" className="font-bold underline">
            Start your shift
          </Link>{' '}
          before recording a session.
        </div>
      )}

      {/* Gun */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Which gun?</div>
        <div className="grid grid-cols-2 gap-3">
          {GUNS.map((g) => {
            const st = workspace.guns[g];
            const selected = gun === g;
            return (
              <button
                key={g}
                type="button"
                disabled={st.inUse}
                onClick={() => setGun(g)}
                aria-pressed={selected}
                className={`flex min-h-[84px] flex-col items-center justify-center gap-0.5 rounded-[22px] border text-center transition ${
                  st.inUse
                    ? 'cursor-not-allowed border-line bg-[#e8ecf2] text-ink-soft'
                    : selected
                      ? 'border-navy bg-navy text-brand-green'
                      : 'border-line bg-white text-navy hover:border-navy'
                }`}
              >
                <span className="att-display text-2xl font-bold">Gun {g}</span>
                <span className={`text-[13px] ${selected && !st.inUse ? 'text-[#d3dcec]' : ''}`}>
                  {st.inUse ? 'In use' : 'Free'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Who */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Who is charging?</div>
        <div className="grid grid-cols-2 rounded-[18px] bg-[#e8ecf2] p-1">
          {[
            { id: false, label: 'Registered' },
            { id: true, label: 'Guest' },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setGuest(opt.id);
                setDriver(null);
                setVehicleId('');
              }}
              className={`min-h-[48px] rounded-2xl text-[15px] transition ${
                guest === opt.id ? 'bg-white font-semibold text-navy shadow-sm' : 'font-medium text-ink-soft'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {guest ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              className="att-input"
              placeholder="Car number plate"
              value={guestPlate}
              onChange={(e) => setGuestPlate(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              aria-label="Car number plate"
            />
            <input
              className="att-input"
              placeholder="Name (optional)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              aria-label="Guest name"
            />
          </div>
        ) : driver ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-ground p-4">
            <div className="flex items-center gap-3">
              <div className="att-display flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#e3f1cc] text-base font-bold text-[#2f5a05]">
                {driver.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{driver.name}</div>
                <div className="text-xs text-ink-soft">{driver.phone}</div>
              </div>
              <span className="att-chip att-chip-ok">Wallet {formatCurrency(driver.walletBalance).replace('GHS ', '')}</span>
              <button
                type="button"
                onClick={() => {
                  setDriver(null);
                  setVehicleId('');
                }}
                className="min-h-[44px] px-2 text-sm font-semibold underline"
              >
                Change
              </button>
            </div>
            {driver.vehicles.length === 0 ? (
              <div className="text-sm font-medium text-[#9b1c13]">This driver has no car registered. Add one on the Drivers page first.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {driver.vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleId(v.id)}
                    aria-pressed={vehicleId === v.id}
                    className={`min-h-[48px] rounded-2xl border px-4 text-left text-sm transition ${
                      vehicleId === v.id ? 'border-navy bg-[#e3f1cc] font-semibold' : 'border-line bg-white'
                    }`}
                  >
                    {v.plate} <span className="text-ink-soft">· {v.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <select
              className="att-input"
              aria-label="Choose a registered driver"
              value=""
              disabled={loadingList}
              onChange={(e) => {
                const m = allDrivers.find((d) => d.driverId === e.target.value);
                if (m) pickDriver(m);
              }}
            >
              <option value="">{loadingList ? 'Loading drivers…' : allDrivers.length ? 'Choose a registered driver…' : 'No registered drivers yet'}</option>
              {allDrivers.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.name} · {d.phone}
                  {d.vehicles.length ? ` · ${d.vehicles.map((v) => v.plate).join(', ')}` : ' · no car'}
                </option>
              ))}
            </select>
            <div className="text-center text-xs text-ink-soft">or search</div>
            <input
              className="att-input"
              type="search"
              inputMode="search"
              placeholder="Search by name, phone or plate"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search drivers"
            />
            {query.trim().length >= 2 && (
              <div className="overflow-hidden rounded-[20px] border border-line bg-white">
                {searching && <div className="p-4 text-sm text-ink-soft">Searching…</div>}
                {!searching && matches.length === 0 && (
                  <div className="p-4 text-sm text-ink-soft">No driver found. Use Guest, or register the driver first.</div>
                )}
                {matches.map((m) => (
                  <button
                    key={m.driverId}
                    type="button"
                    onClick={() => pickDriver(m)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-line px-4 py-2 text-left last:border-b-0 hover:bg-ground"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{m.name}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {m.phone} · {m.vehicles.map((v) => v.plate).join(', ') || 'no car'}
                      </span>
                    </span>
                    {!m.isActive && <span className="att-chip att-chip-bad">Deactivated</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={submit} disabled={!canSubmit} className="att-btn att-btn-primary !min-h-[62px] text-lg">
          {submitting ? 'Starting…' : gun ? `Start session on Gun ${gun}` : 'No gun free'}
        </button>
        <div className="text-center text-sm text-ink-soft">{hint}</div>
      </div>
    </section>
  );
}
