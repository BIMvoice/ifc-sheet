/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The toast `ExportChangesButton` shows once the modified-IFC export has produced files: which kind of
 * success it was, in the active language, with the empty-property-set note (#5201) when part of the edits
 * could not be written.
 */

import { resolve } from '@/i18n/registry';

type Say = typeof resolve;

export interface ExportedFile { base: string; ext: string; }

export interface ExportOutcome {
  files: readonly ExportedFile[];
  /** Models left out, with the reason the exporter gave for the first. */
  skipped: readonly { reason: string }[];
  /** Changes written, over all files. */
  exportedChanges: number;
  /** Empty property sets IFCX cannot represent, over all files. */
  unrepresented: number;
}

/** The toast level and text for a finished export (at least one file was produced). */
export function exportOutcomeToast(o: ExportOutcome, t: Say = resolve): { level: 'info' | 'success'; message: string } {
  const note = o.unrepresented > 0 ? ` — ${t('exportToast.emptyPsets', { count: o.unrepresented })}` : '';
  const one = o.files.length === 1;
  if (o.skipped.length > 0) {
    return {
      level: 'info',
      message: t('exportToast.modifiedSkipped', { exported: o.files.length, total: o.files.length + o.skipped.length, count: o.skipped.length, reason: o.skipped[0].reason, note }),
    };
  }
  const message = one
    ? t('exportToast.modifiedFile', { name: `${o.files[0].base}.${o.files[0].ext}`, count: o.exportedChanges, note })
    : t('exportToast.modifiedModels', { models: o.files.length, count: o.exportedChanges, note });
  return { level: o.unrepresented > 0 ? 'info' : 'success', message };
}
