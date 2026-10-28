/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { removeProjectItem, renameProjectItem } from '@/project/project-store';
import type { ViewportState as ViewportStateValue } from '@/project/viewport-state';
import { ViewportState } from '../ViewportState';
import { WALL_PILL } from '../wall-type';

/** The small pill button of a section's add row. */
export const action = WALL_PILL;
/** A schedule's CSV and XLSX in the list: small, quiet, shown on every row. */
export const EXPORT_BUTTON = 'rounded px-1.5 py-1 text-2xs font-medium uppercase tracking-wider text-sky-200 hover:bg-sky-400/20 hover:text-white disabled:opacity-50';

export function Group({ title, children, add }: { title: string; children: ReactNode; add?: ReactNode }) {
  return (
    <section className="border-t border-sky-300/10 px-4 py-3">
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{title}</h3>
      <ul className="m-0 list-none p-0">{children}</ul>
      {add ? <div className="mt-2 flex flex-wrap gap-1.5">{add}</div> : null}
    </section>
  );
}

/** A collapsed-by-default section with a title: the drawer's way to hold a form. */
export function Collapsible({ title, children, onToggle }: { title: string; children: ReactNode; onToggle?: (open: boolean) => void }) {
  return (
    <details className="border-t border-sky-300/10 px-4 py-3" onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}>
      <summary className="cursor-pointer text-2xs font-medium uppercase tracking-widest text-cyan-400">{title}</summary>
      {children}
    </details>
  );
}

export function Row({ id, label, sub, state, onOpen, extra }: { id: string; label: string; sub?: string; state?: ViewportStateValue; onOpen: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <li className="group flex items-center gap-1 rounded-md hover:bg-sky-400/10">
      {editing ? (
        <input
          // A rename is what the double-click asked for: the field takes the keys at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          defaultValue={label}
          aria-label={t('wall.project.rename')}
          className="m-0.5 min-w-0 flex-1 rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-sm text-white"
          onBlur={(e) => {
            renameProjectItem(id, e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button type="button" onClick={onOpen} onDoubleClick={() => setEditing(true)} title={t('wall.project.renameHint')} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-sky-50">
          {sub ? <span className="mr-2 font-semibold text-white">{sub}</span> : null}
          {label}
        </button>
      )}
      {state ? <ViewportState state={state} compact /> : null}
      {extra}
      <button type="button" aria-label={t('wall.remove', { name: label })} onClick={() => removeProjectItem(id)} className="mr-1 rounded p-1 text-sky-200 opacity-0 hover:bg-sky-400/20 group-hover:opacity-100 focus-visible:opacity-100">
        <X className="size-3.5" />
      </button>
    </li>
  );
}
