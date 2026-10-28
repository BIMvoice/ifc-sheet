/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A number field that lets the hand type. A controlled `type="number"` input
 * bound straight to the stored value snaps back whenever the typed text is not
 * a valid value yet (an emptied field, "0." on the way to "0.5", a lone "-"),
 * so a new value could not be typed over the old one. The text lives here; a
 * valid value is passed on at once, and leaving the field puts the stored
 * value back.
 */

import { useEffect, useState } from 'react';
import { WALL_FIELD } from './wall-type';

export function DraftNumber({ value, onValid, accept, min, step, label }: {
  value: number;
  onValid: (v: number) => void;
  /** Whether a typed number is a value the field takes (default: any finite number). */
  accept?: (v: number) => boolean;
  min?: number;
  step?: number;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const ok = (text: string): number | null => {
    const v = Number(text);
    return text.trim() !== '' && Number.isFinite(v) && (accept ? accept(v) : true) ? v : null;
  };
  // The stored value changed under the field (another control, an undo): show it, unless the text already means it.
  useEffect(() => setDraft((d) => (ok(d) === value ? d : String(value))), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className={WALL_FIELD} type="number" min={min} step={step} value={draft} aria-label={label}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = ok(e.target.value);
        if (v !== null) onValid(v);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}
