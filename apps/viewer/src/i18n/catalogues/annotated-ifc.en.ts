/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The annotated copy of the IFC (#82): the drawing set's annotations written into a copy of the model. Romanian: `annotated-ifc.ro.ts`. */
export const annotatedIfcEn = {
  'annotatedIfc.action': 'Export IFC with annotations',
  'annotatedIfc.hint': 'Writes a copy of the IFC as loaded with the annotations of the plans: one annotation per plan on its level, and an element\'s mark as the property set IfcSheet_Annotation where its Tag does not already say it. Sections and elevations are not written. The file you opened is not changed.',
  'annotatedIfc.kind.section': 'section',
  'annotatedIfc.kind.elevation': 'elevation',
  'annotatedIfc.kind.other': 'view',
  'annotatedIfc.msg.noModel': 'No IFC model is open to write a copy of.',
  'annotatedIfc.msg.nothing': 'Nothing to write: no plan has annotations on a level of the open model.',
  'annotatedIfc.msg.done': '{model}: {views} plans and {marks} marks written to {name}. The file you opened is not changed.',
  'annotatedIfc.msg.files': 'Annotated copies: {count} files in {name}.',
  'annotatedIfc.msg.viewLeftOut': 'Not written: {view} is a {kind}, and only plans are written.',
  'annotatedIfc.msg.noStorey': 'Not written: the level of {view} is not in the open model.',
  'annotatedIfc.msg.storeyFrame': 'Not written: the level of {view} in {model} is not placed flat, so its points have no plan to land on.',
  'annotatedIfc.msg.hatches': '{count} hatches were not written: a hatch is a fill, not a line.',
  'annotatedIfc.msg.marksMissing': '{count} marks were not written: the element is not in the open model.',
  'annotatedIfc.msg.failed': '{model} could not be written: {reason}',
} as const satisfies Record<string, TranslationValue>;
