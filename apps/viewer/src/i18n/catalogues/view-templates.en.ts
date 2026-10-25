/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The graphics of a drawing on the Wall and the project's view templates (#44). */
export const viewTemplatesEn = {
  'wall.gfx.title': 'Graphics',
  'wall.gfx.summaryOwn': 'Own graphics',
  'wall.gfx.summaryTemplate': 'Template {name}',
  'wall.gfx.template': 'View template',
  'wall.gfx.templateNone': 'None (own graphics)',
  'wall.gfx.followers': {
    one: 'One drawing follows "{name}". Changes here are this drawing\'s own; change the template itself under View templates in the project.',
    other: '{count} drawings follow "{name}". Changes here are this drawing\'s own; change the template itself under View templates in the project.',
  },
  'wall.gfx.saveAs': 'Save as template…',
  'wall.gfx.saveAsName': 'Template name',
  'wall.gfx.save': 'Save',
  'wall.gfx.cancel': 'Cancel',
  'wall.gfx.detach': 'Detach',
  'wall.gfx.resetOverrides': 'Reset overrides ({count})',
  'wall.gfx.categories': 'What shows',
  'wall.gfx.show': 'Show {category}',
  'wall.gfx.weightOf': 'Line weight of {category}',
  'wall.gfx.weightSet': 'As set',
  'wall.gfx.overridden': 'Set on this drawing, not by its template',
  'wall.gfx.layers': 'Layers hidden on this sheet',
  'wall.gfx.layersNone': 'This project has no drafting layers yet.',
  'wall.gfx.layerShown': 'Show layer {layer} in this viewport',
  'wall.gfx.layerOffInDrawing': 'Off in the drawing',
  'wall.tpl.title': 'View templates',
  'wall.tpl.hint': 'The graphics a kind of drawing shares. Change one here and every drawing that follows it changes.',
  'wall.tpl.empty': 'No view templates yet. Save a drawing\'s graphics as one from its card.',
  'wall.tpl.name': 'Template name',
  'wall.tpl.usedBy': { one: 'used by one drawing', other: 'used by {count} drawings' },
  'wall.tpl.edit': 'What shows in {name}',
  'wall.tpl.delete': 'Delete template {name}; its drawings keep their graphics',
} as const satisfies Record<string, TranslationValue>;
