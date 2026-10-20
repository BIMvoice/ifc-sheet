/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Changing the project's revision records. The records are the only place a
 * code is kept: renaming one renames it on every sheet that lists it, because
 * the sheets name it by id (`revisions.ts`).
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useProjectStore } from './project-store';
import { cloudRevisionId } from './revisions';
import { freshProjectId } from './view-defaults';
import type { ProjectRevision } from './types';

/** The code after `code`: `A`→`B`, `Z`→`AA`, `01`→`02`; `A` when there is none. */
export function nextRevisionCode(code: string | undefined): string {
  if (!code) return 'A';
  const digits = /^(.*?)(\d+)$/.exec(code);
  if (digits) return `${digits[1]}${String(Number(digits[2]) + 1).padStart(digits[2].length, '0')}`;
  if (/^[A-Z]+$/.test(code)) {
    const out = [...code];
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] !== 'Z') { out[i] = String.fromCharCode(out[i].charCodeAt(0) + 1); return out.join(''); }
      out[i] = 'A';
    }
    return `A${out.join('')}`;
  }
  return `${code}2`;
}

/** A new revision after the last one, with the next code unless one is given. Returns its id. */
export function addRevision(fields: Partial<Omit<ProjectRevision, 'id'>> = {}, today = new Date().toISOString().slice(0, 10)): string {
  const records = useProjectStore.getState().revisions ?? [];
  const id = freshProjectId('revision');
  const record: ProjectRevision = { id, code: fields.code ?? nextRevisionCode(records.at(-1)?.code), date: fields.date ?? today, description: fields.description ?? '', by: fields.by ?? '' };
  useProjectStore.setState({ revisions: [...records, record], dirty: true });
  return id;
}

export function updateRevision(id: string, patch: Partial<Omit<ProjectRevision, 'id'>>): void {
  const records = useProjectStore.getState().revisions ?? [];
  if (!records.some((r) => r.id === id)) return;
  useProjectStore.setState({ revisions: records.map((r) => (r.id === id ? { ...r, ...patch } : r)), dirty: true });
}

/** How many clouds belong to revision `id`: what removing it takes with it, said before it is removed. */
export function revisionCloudCount(id: string): number {
  return useProjectStore.getState().drafts.filter((d) => cloudRevisionId(d) === id).length;
}

/**
 * Remove a revision, its clouds, and the choice of it on every sheet: one
 * store write and one undo step, so Undo brings the record and its clouds back
 * together. The card asks first.
 */
export function removeRevision(id: string): void {
  const s = useProjectStore.getState();
  if (!(s.revisions ?? []).some((r) => r.id === id)) return;
  runAsOneUndoStep(() => useProjectStore.setState({
    revisions: (s.revisions ?? []).filter((r) => r.id !== id),
    drafts: s.drafts.filter((d) => cloudRevisionId(d) !== id),
    sheets: s.sheets.map((sheet) => {
      if (!(sheet.revisionIds ?? []).includes(id)) return sheet;
      const { revisionIds: _all, ...rest } = sheet;
      const left = (sheet.revisionIds ?? []).filter((x) => x !== id);
      return left.length > 0 ? { ...rest, revisionIds: left } : rest;
    }),
    dirty: true,
  }));
}
