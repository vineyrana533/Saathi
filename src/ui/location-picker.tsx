'use client';

import { useState } from 'react';
import { nearest, roundCoord } from '@/modules/geo/distance';
import { Field, Select } from './primitives';

export interface LocalityChoice {
  id: string;
  name: string;
  group: string;
  lat: number;
  lng: number;
}

/** Further than this from every listed area means the phone is somewhere we do not serve. */
const MAX_KM = 30;

/**
 * Area picker for jobs and worker home bases. People pick a locality, or press "Use my current
 * location": the browser asks permission, we pick the nearest locality and send the point (rounded,
 * 3 decimals for jobs, 2 for homes) in hidden fields. Changing the list by hand drops the point.
 */
export function LocationPicker({
  id,
  name,
  latName,
  lngName,
  label,
  help,
  options,
  defaultValue,
  precision = 3,
  labels,
}: {
  id: string;
  name: string;
  latName: string;
  lngName: string;
  label: string;
  help?: string;
  options: LocalityChoice[];
  defaultValue?: string | null;
  precision?: 2 | 3;
  labels: { useMine: string; locating: string; using: string; denied: string; outside: string };
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]?.id ?? '');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState('');

  const groups: [string, LocalityChoice[]][] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last[0] === o.group) last[1].push(o);
    else groups.push([o.group, [o]]);
  }

  function useMine() {
    if (!('geolocation' in navigator)) {
      setStatus(labels.denied);
      return;
    }
    setStatus(labels.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const near = nearest(here, options);
        if (!near || near.km > MAX_KM) {
          setPoint(null);
          setStatus(labels.outside);
          return;
        }
        setPoint({ lat: roundCoord(here.lat, precision), lng: roundCoord(here.lng, precision) });
        setValue(near.item.id);
        setStatus(labels.using.replace('{area}', near.item.name));
      },
      () => setStatus(labels.denied),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  return (
    <Field id={id} label={label} help={help}>
      <Select
        id={id}
        name={name}
        value={value}
        required
        onChange={(e) => {
          setValue(e.target.value);
          setPoint(null);
          setStatus('');
        }}
      >
        {groups.map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <input type="hidden" name={latName} value={point ? String(point.lat) : ''} />
      <input type="hidden" name={lngName} value={point ? String(point.lng) : ''} />
      <div className="flex flex-wrap items-center gap-x-4">
        <button type="button" onClick={useMine} className="link min-h-11 text-small font-semibold">
          {labels.useMine}
        </button>
        <p className="text-small text-ink-2" aria-live="polite">
          {status}
        </p>
      </div>
    </Field>
  );
}
