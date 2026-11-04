/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A DXF drawing laid under a plan view as linework (#547): the panel in the underlay menu and the DXFALIGN command. */
export const dxfViewEn = {
  'dxfView.cmd': 'DXFALIGN',
  'dxfView.prompt.from1': 'Click a first point on the DXF:',
  'dxfView.prompt.from2': 'Click a second point on the DXF:',
  'dxfView.prompt.to1': 'Click where the first point belongs, on the model:',
  'dxfView.prompt.to2': 'Click where the second point belongs, on the model:',
  'dxfView.msg.none': 'This view has no DXF underlay. Add a DXF first.',
  'dxfView.msg.locked': 'The DXF is locked. Unlock it to align it.',
  'dxfView.msg.bad': 'The DXF could not be aligned: each pair of points must be two different points.',
  'dxfView.msg.aligned': 'The DXF is aligned: the two points are on the two points of the model.',
  'dxfView.heading': 'DXF drawing',
  'dxfView.hint': 'Lay a DXF floor plan or survey under this plan as lines. Align it by two points, switch its layers on or off, and choose the sheets that print it.',
  'dxfView.add': 'Add a DXF',
  'dxfView.importing': 'Reading the DXF...',
  'dxfView.failed': 'The DXF could not be added: {reason}',
  'dxfView.remove': 'Remove',
  'dxfView.align': 'Align by two points',
  'dxfView.layers': 'Layers',
  'dxfView.opacity': 'Opacity',
  'dxfView.lock': 'Lock position',
  'dxfView.printsHeading': 'DXF prints on sheet',
  'dxfView.noSheets': 'This drawing is not on a sheet yet.',
} as const satisfies Record<string, TranslationValue>;
