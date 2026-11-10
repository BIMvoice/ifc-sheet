/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `catalogue.en.ts`. Term choices: `../ro-glossary.md`. */
export const catalogueRo = {
  'library.standard.title': 'Standard grafic',
  'library.standard.hint': 'Grosimile liniilor și dimensiunile textelor de pe toate planșele, pe ecran, la tipărire și în DXF. Alegerea unui standard adaugă stilurile lui de text și de cotare și le selectează pentru adnotările noi; stilurile dumneavoastră, inclusiv Standard, rămân neschimbate.',
  'library.standard.unknown': 'Fișierul indică standardul grafic „{id}”, pe care această versiune nu îl are. Planșele folosesc în schimb {fallback}.',
  'library.standard.export': 'Salvați acest standard ca fișier de bibliotecă',
  'library.kind.details': 'Detalii (vederi de desenare)',
  'library.kind.tagFields': 'Surse ale câmpurilor de etichetă',
  'library.kind.sheetTemplates': 'Șabloane de planșe',
  'drafting.props.symbol': 'Simbol',
  'drafting.props.symbolFactor': 'Factor de mărime',
  'drafting.props.symbolRotation': 'Rotire (°)',
  'drafting.props.typeSymbol': 'Simbol',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
