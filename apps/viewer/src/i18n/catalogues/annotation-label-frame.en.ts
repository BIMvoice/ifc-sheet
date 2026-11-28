/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The circle and the hexagon a label may be framed in, and a door's and a window's own frame (#924), in the label type's fields of the Standards dialog. */
export const annotationLabelFrameEn = {
  'label.frame.circle': 'Circle',
  'label.frame.hexagon': 'Hexagon',
  'label.classFrame.IfcDoor': 'Frame on doors',
  'label.classFrame.IfcWindow': 'Frame on windows',
  'label.classFrame.same': 'As the frame',
  'label.classFrame.hint': 'The frame of this type\'s labels on a door or a window, where it differs from the frame above: a circle for doors and a hexagon for windows, for example.',
} as const satisfies Record<string, TranslationValue>;
