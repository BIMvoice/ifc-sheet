/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the bar that floats over a selected annotation in a drawing (`drafting/SelectionBar.tsx`), the
 * section-depth label, the snap toggle's name and the toast for an IFCX overlay file. All four are on IfcSheet's
 * face. The rest of `standards.*` (the drafting standards dialog) and `drafting.props.*` are not reached from
 * the face and stay English. Term choices: `../ro-glossary.md`.
 */
export const selectionBarRo = {
  'standards.open': 'Standarde de desen',
  'standards.el.style': 'Stil',
  'standards.el.height': 'Înălțime (mm)',
  'standards.el.editText': 'Editează textul',
  'standards.el.resetTag': 'Revino la valoarea din model',
  'standards.el.tagOverridden': 'Text scris peste valoarea din model',
  'standards.el.reset': 'Revino la stil',
  'standards.text.bold': 'Aldin',
  'standards.text.italic': 'Cursiv',
  'standards.dim.placement.above': 'Deasupra',
  'standards.dim.placement.centered': 'În linie',
  'standards.dim.placement.below': 'Dedesubt',
  'standards.dim.arrow': 'Capete',
  'standards.dim.arrow.tick': 'Liniuță',
  'standards.dim.arrow.arrow': 'Săgeată',
  'standards.dim.arrow.dot': 'Punct',
  'standards.dim.arrow.none': 'Niciunul',
  'drafting.snap': 'Fixare',
  'drafting.sectionDepth': '{depth} m',
  'viewerShell.file.ifcxOverlayRequiresIfcx': 'Fișierele de suprapunere IFCX nu pot fi adăugate la modele IFC4. Încărcați fișierele IFCX separat.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
