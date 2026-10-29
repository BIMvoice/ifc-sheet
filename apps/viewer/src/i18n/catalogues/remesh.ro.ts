/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `remesh` (#526). Term choices: `../ro-glossary.md`. */
export const remeshRo = {
  'remesh.failed': 'Forma 3D a elementului editat nu a putut fi reconstruită: {message}. Modificarea este păstrată.',
  'remesh.refused.alignment': 'Modelul elementului editat este aliniat la sistemul de coordonate al altui model, iar forma reconstruită nu a putut fi aliniată la fel. Modificarea este păstrată.',
  'remesh.refused.colourMerged': 'Elementul editat împarte o singură plasă cu alte elemente, deci forma lui 3D nu poate fi reconstruită separat. Modificarea este păstrată.',
  'remesh.refused.noFrame': 'Formele 3D ale acestui model nu pot fi reconstruite după editări: a fost încărcat fără cadrul de coordonate al motorului. Reîncărcați-l pentru a activa actualizările.',
  'remesh.refused.noSource': 'Formele 3D ale acestui model nu pot fi reconstruite după editări: nu a fost încărcat dintr-un fișier IFC.',
  'remesh.refused.unreadable': 'Datele elementului editat nu au putut fi citite înapoi, deci forma lui 3D nu a fost reconstruită. Modificarea este păstrată.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
