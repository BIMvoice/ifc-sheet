/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What changed since the last issue (#331): the sheets going out now against
 * the previous issue's record. A sheet is changed when its content
 * fingerprint differs (`project/sheet-fingerprint.ts`: the sheet, the views
 * and drafts on it, its revisions), added when the previous issue did not
 * hold it, removed when this one does not. Pure.
 *
 * A previous record whose sheets do not all carry a fingerprint cannot be
 * compared, and says so (`unknown`): an empty comparison would claim that
 * nothing changed.
 *
 * A sheet is also changed when the MODEL it shows changed since that issue (#335): What changed's answer for the
 * model as issued against the model now arrives as `model` (`model-state.ts`), and each changed sheet says why
 * (`reasons`: edited, model, or both). A previous issue that did not record the model gives `model: 'unknown'`:
 * the model's part of the list is then missing, and the panel says so rather than that nothing changed.
 */

import type { ModelImpact } from './model-state';
import type { ChangeReason, ChangedSheet, IssueChangeRecord, IssuedSheet, ProjectIssue } from './types';

export type ChangeStatus = 'first' | 'unknown' | 'compared';

export interface IssueChanges {
  /** `first`: nothing was issued before. `unknown`: the previous issue has no fingerprints. */
  status: ChangeStatus;
  /** The issue compared against; null for a first issue. */
  against: { id: string; name: string } | null;
  added: ChangedSheet[];
  removed: ChangedSheet[];
  changed: ChangedSheet[];
  /** What the model contributed: `compared`, or why it could not (`unknown`: not recorded; `noModel`: none loaded), `pending` while it is read; `none`: nothing to compare. */
  model: ModelImpact['status'];
  /** The changed sheets whose revision is still the one the previous issue carried. */
  unbumped: { sheetId: string; number: string; title: string }[];
}

/** One sheet going out. */
export type OutgoingSheet = Pick<IssuedSheet, 'number' | 'title' | 'revision' | 'fingerprint'> & { sheetId: string };

const FINGERPRINT = /^[0-9a-f]{14}$/;
const named = (r: { number: string; title: string }): ChangedSheet => ({ number: r.number, title: r.title });
const none = { added: [], removed: [], changed: [], unbumped: [] };

export function issueChanges(outgoing: readonly OutgoingSheet[], previous: Pick<ProjectIssue, 'id' | 'name' | 'sheets'> | undefined, model: ModelImpact = { status: 'none' }): IssueChanges {
  if (!previous) return { status: 'first', against: null, model: 'none', ...none };
  const against = { id: previous.id, name: previous.name };
  if (previous.sheets.some((r) => !FINGERPRINT.test(r.fingerprint ?? ''))) return { status: 'unknown', against, model: model.status, ...none };
  const matched = new Set<IssuedSheet>();
  const out: IssueChanges = { status: 'compared', against, model: model.status, added: [], removed: [], changed: [], unbumped: [] };
  for (const sheet of outgoing) {
    // By id when the record kept it, else by number.
    const was = previous.sheets.find((r) => !matched.has(r) && (r.sheetId ? r.sheetId === sheet.sheetId : r.number === sheet.number));
    if (!was) { out.added.push(named(sheet)); continue; }
    matched.add(was);
    const reasons: ChangeReason[] = [
      ...(was.fingerprint === sheet.fingerprint ? [] : ['edited' as const]),
      ...(model.status === 'compared' && model.sheetIds.has(sheet.sheetId) ? ['model' as const] : []),
    ];
    if (reasons.length === 0) continue;
    out.changed.push({ ...named(sheet), reasons });
    if (was.revision === sheet.revision) out.unbumped.push({ sheetId: sheet.sheetId, ...named(sheet) });
  }
  out.removed = previous.sheets.filter((r) => !matched.has(r)).map(named);
  return out;
}

/** What the issue record keeps of a comparison; nothing when there was none. */
export function changeRecord(changes: IssueChanges): IssueChangeRecord | undefined {
  return changes.status === 'compared' && changes.against ? { against: changes.against, added: changes.added, removed: changes.removed, changed: changes.changed } : undefined;
}
