/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What an issue records with the project (`ProjectDocument.issues`): the sets sent out, sheet by sheet. */


/** One sheet as it stood when a set was issued. */
export interface IssuedSheet {
  /** The sheet's id, so a later issue follows it through a renumbering. Absent in records from before it was kept. */
  sheetId?: string;
  number: string;
  title: string;
  /** The scales of its viewports, as drawn on the list: `1:50`, or `1:50, 1:100`; empty when it holds none. */
  scale: string;
  /** The paper as named on the list (`paperLabel`): `A1`, `A3×3`, `500×700`. */
  paper: string;
  orientation: 'landscape' | 'portrait';
  revision: string;
  /** What the sheet held (`project/sheet-fingerprint.ts`): equal fingerprints mean an unchanged sheet. */
  fingerprint: string;
}

/** A set of sheets sent out together, recorded with the project so a later issue can say what changed. */
export interface ProjectIssue {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  createdAt: number;
  sheets: IssuedSheet[];
  /** What differed from the issue before it, as it was when this one went out. Absent for a first issue and when that issue could not be compared. */
  changes?: IssueChangeRecord;
  /** The model as issued (`issue/model-state.ts`). Absent when no model was loaded, and in records from before it was kept: model changes since such an issue cannot be listed. */
  model?: IssuedModel;
}

/**
 * A reference to the model as an issue went out: a fingerprint of its model state (`ModelSnapshot.rows`) and its
 * size. The state itself is `ProjectDocument.modelState.issued`, kept for the last issue only and not copied
 * into the record.
 */
export interface IssuedModel {
  /** 14 hex digits: equal to the state's, or the state is not the one issued. */
  hash: string;
  /** Elements in the state. */
  count: number;
  /** When the state was taken. */
  takenAt: number;
}

/** Why a sheet is listed as changed: its project data was `edited`, or the `model` it shows changed (What changed). */
export type ChangeReason = 'edited' | 'model';

/** A sheet named in a change list. */
export interface ChangedSheet {
  number: string;
  title: string;
  /** For a changed sheet: why. Absent in records from before the model was compared; those were edits. */
  reasons?: ChangeReason[];
}

/** What `ProjectIssue.changes` keeps (`issue/changes.ts`). */
export interface IssueChangeRecord {
  /** The issue compared against. */
  against: { id: string; name: string };
  added: ChangedSheet[];
  removed: ChangedSheet[];
  changed: ChangedSheet[];
}
