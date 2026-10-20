/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
export const revisionsEn = {
  'revision.title': 'Revisions',
  'revision.msg.none': 'There is no revision yet. Add one under Revisions first; a cloud belongs to a revision.',
  'revision.table.code': 'Rev.',
  'revision.table.date': 'Date',
  'revision.table.description': 'Description',
  'revision.table.by': 'By',
  'revision.table.earlier': { one: '{count} earlier revision not shown', other: '{count} earlier revisions not shown' },
  'revision.card.hint': 'The revisions of the set. A sheet lists the revisions its clouds belong to, and the ones you tick here; its title block reads the latest.',
  'revision.code': 'Revision code',
  'revision.date': 'Date',
  'revision.description': 'Description',
  'revision.by': 'By',
  'revision.onSheet': 'Listed on this sheet',
  'revision.byCloud': 'A cloud on this sheet belongs to it, so it stays listed.',
  'revision.add': 'Add a revision',
  'revision.remove': 'Remove this revision and its clouds',
  'revision.empty': 'No revisions yet.',
  'revision.done': 'Done',
  'revision.cloudFor': 'The cloud belongs to',
  'revision.tbDerived': 'The title block reads the latest revision of the sheet.',
  'issue.currentOnly': 'Show only the clouds of each sheet\'s current revision',
  'wall.draw.revcloud': 'Revision cloud',
  'wall.draw.revcloud.body': 'Click two opposite corners: a cloud is drawn round them for the revision chosen below.',
} as const satisfies Record<string, TranslationValue>;
