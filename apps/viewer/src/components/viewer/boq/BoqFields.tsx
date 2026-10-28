/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The inputs of the bill of quantities' editor (#75): a value kept as typed until the field is left (or Enter), so a half-typed factor is never saved. */

import { useEffect, useState } from 'react';
import { WALL_FIELD, WALL_LABEL } from '../wall/wall-type';

interface TextProps { label: string; value: string; onCommit: (v: string) => void; list?: string; placeholder?: string; className?: string }

export function TextField({ label, value, onCommit, list, placeholder, className = '' }: TextProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <label className={`${WALL_LABEL} ${className}`}>
      {label}
      <input
        className={WALL_FIELD} value={draft} list={list} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}

interface NumberProps { label: string; value: number | undefined; fallback?: number; onCommit: (v: number | undefined) => void; className?: string }

/** A decimal number (a comma is a point); empty is no value (`fallback` is the default shown). Text that is not a number goes back to what it was; a number out of range is kept, and the table refuses it in words. */
export function NumberField({ label, value, fallback, onCommit, className = '' }: NumberProps) {
  const text = (v: number | undefined) => (v === undefined ? '' : String(v));
  const [draft, setDraft] = useState(text(value));
  useEffect(() => setDraft(text(value)), [value]);
  const commit = () => {
    const raw = draft.trim().replace(',', '.');
    const n = raw === '' ? undefined : Number(raw);
    if (n !== undefined && !Number.isFinite(n)) { setDraft(text(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <label className={`${WALL_LABEL} ${className}`}>
      {label}
      <input
        className={WALL_FIELD} inputMode="decimal" value={draft} placeholder={fallback === undefined ? '' : String(fallback)} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}
