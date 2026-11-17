'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateDriver } from '@/app/actions/drivers';
import { addVehicle, updateVehicle } from '@/app/actions/vehicles';
import { listDriversForPicker } from '@/app/actions/gun-sessions';
import type { DriverMatch } from '@/lib/gun-session-types';

interface Car {
  id: string | null;
  brand: string;
  model: string;
  plate: string;
}

/**
 * Edit a driver's details and cars. Attendants can do this; every change is recorded in the
 * audit log with who made it (a changed phone number matters, because top-ups and MoMo numbers
 * follow it).
 */
export function DriverEditor({
  driver,
  onSaved,
  onCancel,
}: {
  driver: DriverMatch;
  onSaved: (updated: DriverMatch | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone);
  const [email, setEmail] = useState(driver.email);
  const [type, setType] = useState<'individual' | 'corporate'>(driver.type);
  const [cars, setCars] = useState<Car[]>(
    driver.vehicles.map((v) => ({ id: v.id, brand: v.brand, model: v.model, plate: v.plate }))
  );
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const setCar = (i: number, patch: Partial<Car>) => setCars((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const valid = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 7 && cars.every((c) => c.id === null ? true : c.plate.trim().length >= 3);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const d = await updateDriver(driver.driverId, { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, type });
      if (!d.success) throw new Error(d.error || 'Could not save the driver.');

      for (const [i, c] of cars.entries()) {
        const original = driver.vehicles.find((v) => v.id === c.id);
        if (c.id && original) {
          const changed = original.brand !== c.brand.trim() || original.model !== c.model.trim() || original.plate !== c.plate.trim().toUpperCase();
          if (!changed) continue;
          const v = await updateVehicle(c.id, { brand: c.brand.trim(), model: c.model.trim(), plate_number: c.plate.trim().toUpperCase(), driver_id: driver.driverId });
          if (!v.success) throw new Error(`Car ${i + 1}: ${v.error || 'could not be saved.'}`);
        } else if (c.plate.trim().length >= 3) {
          const v = await addVehicle({ brand: c.brand.trim(), model: c.model.trim(), plate_number: c.plate.trim().toUpperCase(), driver_id: driver.driverId });
          if (!v.success) throw new Error(`New car: ${v.error || 'could not be saved.'}`);
        }
      }

      // Every list that shows this driver should pick up the new details
      void qc.invalidateQueries({ queryKey: ['driver-list'] });
      void qc.invalidateQueries({ queryKey: ['driver-search'] });
      const list = await listDriversForPicker();
      onSaved(list.success ? (list.data.find((m) => m.driverId === driver.driverId) ?? null) : null);
      toast.success('Driver updated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-ground p-4">
      <div className="text-sm font-semibold">Edit driver</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className="att-input" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} aria-label="Full name" />
        <input className="att-input" inputMode="tel" placeholder="Phone *" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" />
        <input className="att-input" inputMode="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <select className="att-input" value={type} onChange={(e) => setType(e.target.value as 'individual' | 'corporate')} aria-label="Driver type">
          <option value="individual">Individual</option>
          <option value="corporate">Corporate</option>
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {cars.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-2xl bg-white p-3">
            <div className="text-xs font-bold uppercase text-ink-soft">{c.id ? `Car ${i + 1}` : 'New car'}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input className="att-input" placeholder="Brand" value={c.brand} onChange={(e) => setCar(i, { brand: e.target.value })} aria-label={`Car ${i + 1} brand`} />
              <input className="att-input" placeholder="Model" value={c.model} onChange={(e) => setCar(i, { model: e.target.value })} aria-label={`Car ${i + 1} model`} />
              <input className="att-input" placeholder="Plate *" autoCapitalize="characters" value={c.plate} onChange={(e) => setCar(i, { plate: e.target.value.toUpperCase() })} aria-label={`Car ${i + 1} plate`} />
            </div>
          </div>
        ))}
        <button type="button" className="att-btn att-btn-ghost self-start !min-h-[44px] !px-4 !text-sm" onClick={() => setCars((cs) => [...cs, { id: null, brand: '', model: '', plate: '' }])}>
          Add another car
        </button>
      </div>

      <div className="flex gap-3">
        <button type="button" className="att-btn att-btn-ghost flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="att-btn att-btn-primary flex-1" onClick={save} disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
