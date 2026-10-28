/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `element-graphics.en.ts`. Term choices: `../ro-glossary.md`. */
export const elementGraphicsRo = {
  'elgfx.selected': { one: 'Un element selectat', few: '{count} elemente selectate', other: '{count} de elemente selectate' },
  'elgfx.hide': 'Ascunde în această vedere',
  'elgfx.graphics': 'Grafica acestui element…',
  'elgfx.graphicsMany': 'Grafica acestor elemente…',
  'elgfx.hideLine': 'Ascunde o linie',
  'elgfx.pickLine': 'Faceți clic pe o linie din desen ca s-o ascundeți. Apăsați Esc pentru a opri.',
  'elgfx.showHidden': 'Arată ce e ascuns ({count})',
  'elgfx.showAll': 'Arată tot',
  'elgfx.ghostHint': 'Ce ascunde această vedere apare în gri. Faceți clic pe el ca să-l readuceți.',
  'elgfx.ghostElement': 'Element ascuns. Faceți clic ca să-l arătați din nou.',
  'elgfx.ghostLine': 'Linie ascunsă. Faceți clic ca s-o arătați din nou.',
  'elgfx.panel.title': { one: 'Grafica acestui element', few: 'Grafica a {count} elemente', other: 'Grafica a {count} de elemente' },
  'elgfx.panel.hint': 'Doar în această vedere. Câmpurile lăsate pe „Cea stabilită” păstrează ce dă categoria.',
  'elgfx.lineColour': 'Culoarea liniei',
  'elgfx.fillColour': 'Culoarea de umplere',
  'elgfx.colourClear': 'Cea stabilită',
  'elgfx.cutWeight': 'Grosimea liniei, în secțiune',
  'elgfx.projectionWeight': 'Grosimea liniei, dincolo de secțiune',
  'elgfx.weightSet': 'Cea stabilită',
  'elgfx.lineStyle': 'Tipul liniei',
  'elgfx.style.default': 'Cel stabilit',
  'elgfx.style.solid': 'Continuă',
  'elgfx.style.dashed': 'Întreruptă',
  'elgfx.cutHatch': 'Hașura din secțiune',
  'elgfx.hatchSet': 'Cea stabilită',
  'elgfx.reset': 'Resetează',
  'elgfx.close': 'Închide',
  'wall.hidden.title': 'Ascuns în acest desen',
  'wall.hidden.summary': { one: 'Un element ascuns', few: '{count} elemente ascunse', other: '{count} de elemente ascunse' },
  'wall.hidden.summaryNone': 'Nimic ascuns',
  'wall.hidden.none': 'Nimic nu e ascuns aici. Selectați elemente în desen și alegeți „Ascunde în această vedere”.',
  'wall.hidden.hideSelected': { one: 'Ascunde elementul selectat', few: 'Ascunde cele {count} elemente selectate', other: 'Ascunde cele {count} de elemente selectate' },
  'wall.hidden.show': 'Arată {name}',
  'wall.hidden.showLabel': 'Arată',
  'wall.hidden.showAll': 'Arată tot',
  'wall.hidden.lines': { one: 'O linie ascunsă', few: '{count} linii ascunse', other: '{count} de linii ascunse' },
  'wall.hidden.orphans': 'Nu mai sunt în model',
  'wall.hidden.orphanHint': 'Modelul nu mai are aceste elemente. Ce spune desenul despre ele se păstrează, în caz că un model mai nou le readuce, și nu se desenează.',
  'wall.hidden.orphanHidden': 'ascuns',
  'wall.hidden.orphanOverride': 'grafică proprie',
  'wall.hidden.orphanLines': { one: 'o linie ascunsă', few: '{count} linii ascunse', other: '{count} de linii ascunse' },
  'wall.hidden.orphanForget': 'Uită',
  'wall.hidden.orphanForgetLabel': 'Uită ce spune acest desen despre {name}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
