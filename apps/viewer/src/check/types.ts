/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing from a drawing set, as data: where, what, and the command that fixes it when one does. */

import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';

export type FindingKind =
  | 'untaggedOpenings' | 'unlabelledRooms' | 'planNotDrawn'
  | 'planNoDimensions' | 'viewNoLevelMarks'
  | 'viewOffSheet' | 'emptySheet' | 'titleBlockEmpty' | 'duplicateNumber'
  | 'sectionMarkOffSheet' | 'detailOffSheet' | 'danglingAnnotation';

/** The one-action commands a finding can be fixed with. */
export type FixCommand = 'TAGALL' | 'DIMALL' | 'LEVELALL';

export interface Finding {
  kind: FindingKind;
  /** The sheet the finding belongs to: the sheet that holds the view, or the sheet itself. */
  sheetId?: string;
  viewId?: string;
  /** The model element(s) concerned, GlobalIds. */
  guids?: string[];
  /** The annotation concerned. */
  draftId?: string;
  /** Catalogue key of the message (`check.<kind>`), with its parameters. */
  key: `check.${FindingKind}`;
  params: Record<string, string | number>;
  /** The command that fixes it in one action, run on `viewId`. */
  fix?: FixCommand;
}

/** An element a plan shows: its GlobalId and IFC class. */
export interface PlanElement { guid: string; className: string }

/** Everything the checks read; the app fills it from its stores (`collect.ts`). */
export interface CheckInput {
  views: readonly { id: string; name: string; kind: string; detail?: unknown; interior?: unknown }[];
  sheets: readonly ProjectSheet[];
  /** The project's title block and name: what a sheet prints where it does not say otherwise (`titleBlockOf`). */
  titleBlock?: Record<string, string>;
  projectName: string;
  drafts: readonly DraftEntity[];
  /** The doors, windows and rooms a plan shows; null when the plan has not been drawn (it is open in no tab yet). */
  planElements(viewId: string): PlanElement[] | null;
  elementExists(guid: string): boolean;
}
