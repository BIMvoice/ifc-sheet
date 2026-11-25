/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Pagina de start: ce face aplicația dintr-un fișier IFC și cum se intră. */
export const wallStartRo = {
  'wall.start.eyebrow': 'IFC la intrare, planșe la ieșire',
  'wall.start.titleStart': 'Planșe din',
  'wall.start.titleEnd': 'modelul dumneavoastră IFC.',
  'wall.start.body': 'Deschideți unul sau mai multe fișiere IFC, de exemplu arhitectură și structură împreună, iar planurile, fațadele și secțiunile lor sunt așezate pe planșe, cu cartușul completat din model, gata de emis ca PDF.',
  'wall.start.drop': 'Trageți aici unul sau mai multe fișiere IFC',
  'wall.start.dropNow': 'Dați drumul ca să le deschideți',
  'wall.start.choose': 'Alegeți fișiere IFC',
  'wall.start.notIfc': '{name} nu este un fișier IFC. IfcSheet desenează din IFC: {formats}.',
  'wall.start.templates': 'Aveți un șablon de set al biroului sau pentru autorizație?',
  'wall.start.previewOpen': 'Deschideți proiectul demonstrativ din care provine această planșă',
  'wall.start.previewAlt': 'Planșa A-101: două planuri de nivel la 1:100, cu numele și ariile încăperilor, cote și cartuș',
  'wall.start.previewCaption': 'Planșa A-101 a proiectului demonstrativ, un bloc de locuințe, desenată și adnotată de IfcSheet din fișierul lui IFC.',
} as const satisfies Record<string, TranslationValue>;
