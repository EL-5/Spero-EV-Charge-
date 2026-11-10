'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDriversForPicker, searchDrivers } from '@/app/actions/gun-sessions';
import type { DriverMatch } from '@/lib/gun-session-types';
import { formatCurrency } from '@/lib/utils';

/** State for "who is charging": a registered driver and car, or a guest plate. */
export function useWho() {
  const [guest, setGuest] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [driver, setDriver] = useState<DriverMatch | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');

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

  /** Adds the chosen driver or guest to the form being sent to the server. */
  const appendTo = (fd: FormData) => {
    fd.set('isGuest', String(guest));
    if (guest) {
      fd.set('guestName', guestName);
      fd.set('guestPlate', guestPlate);
    } else if (driver) {
      fd.set('driverId', driver.driverId);
      fd.set('vehicleId', vehicleId);
    }
  };

  return {
    guest, setGuest, query, setQuery, driver, setDriver, vehicleId, setVehicleId, guestName, setGuestName,
    guestPlate, setGuestPlate, matches, searching, allDrivers, loadingList, pickDriver, whoOk, appendTo,
  };
}

export type Who = ReturnType<typeof useWho>;

export function WhoPicker({ who }: { who: Who }) {
  const {
    guest, setGuest, query, setQuery, driver, setDriver, vehicleId, setVehicleId, guestName, setGuestName,
    guestPlate, setGuestPlate, matches, searching, allDrivers, loadingList, pickDriver,
  } = who;
  return (
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
  );
}
