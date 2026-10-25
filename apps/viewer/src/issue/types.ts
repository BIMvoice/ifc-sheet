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
}

/** A sheet named in a change list. */
export interface ChangedSheet {
  number: string;
  title: string;
}

/** What `ProjectIssue.changes` keeps (`issue/changes.ts`). */
export interface IssueChangeRecord {
  /** The issue compared against. */
  against: { id: string; name: string };
  added: ChangedSheet[];
  removed: ChangedSheet[];
  changed: ChangedSheet[];
}
