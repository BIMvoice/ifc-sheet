/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the sheet settings and the title block (`sheets.en.ts`). Term choices: `../ro-glossary.md`. */
export const sheetsRo = {
  'sheets.panel': 'Setările planșei',
  'sheets.paper': 'Hârtie',
  'sheets.size': 'Format',
  'sheets.orientation': 'Orientare',
  'sheets.landscape': 'Orizontal',
  'sheets.portrait': 'Vertical',
  'sheets.titleBlock': 'Cartuș',
  'sheets.tb.number': 'Nr. planșă',
  'sheets.tb.title': 'Titlu',
  'sheets.tb.project': 'Proiect',
  'sheets.tb.drawnBy': 'Desenat',
  'sheets.tb.client': 'Beneficiar',
  'sheets.tb.checkedBy': 'Verificat',
  'sheets.tb.revision': 'Revizie',
  'sheets.tb.date': 'Data',
  'sheets.tb.scale': 'Scara',
  'sheets.asIndicated': 'Conform indicațiilor',
  'sheets.viewport': 'Vedere · {name}',
  'sheets.viewportLabel': '{name}  1:{scale}',
  'sheets.scale': 'Scara',
  'sheets.width': 'Lățime (mm)',
  'sheets.height': 'Înălțime (mm)',
  'sheets.removeViewport': 'Elimină de pe planșă',
  'sheets.fitBox': 'Încadrează chenarul în desen',
  'sheets.dropHint': 'Trageți un plan, o secțiune sau o fațadă din Navigatorul de proiect pe hârtie pentru a-l amplasa.',
  'sheets.export': 'Exportă',
  'sheets.svg': 'SVG',
  'sheets.dxf': 'DXF',
  'sheets.pdf': 'PDF / Tipărire',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
