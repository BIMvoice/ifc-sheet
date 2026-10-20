/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What an issue records with the project (`ProjectDocument.issues`): the sets sent out, sheet by sheet. */


/** One sheet as it stood when a set was issued. */
export interface IssuedSheet {
  number: string;
  title: string;
  /** The scales of its viewports, as drawn on the list: `1:50`, or `1:50, 1:100`; empty when it holds none. */
  scale: string;
  /** The paper as named on the list (`paperLabel`): `A1`, `A3×3`, `500×700`. */
  paper: string;
  orientation: 'landscape' | 'portrait';
  revision: string;
  /** What the sheet held (`issue/fingerprint.ts`): equal fingerprints mean an unchanged sheet. */
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
}
