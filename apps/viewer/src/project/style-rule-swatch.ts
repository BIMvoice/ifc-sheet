/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a style rule draws (#31), for the swatch beside it in the configurator: the ONE styler (`viewStyler`) asked about a cut face
 * of what the rule matches, over the template it belongs to. So the swatch cannot say something the drawing, the sheet or the export
 * would not.
 */

import { PEN_TABLE, classKey, materialKey, resolveViewGraphics, viewStyler, type ItemStyle, type ProjectViewTemplate, type StyleRule } from '@bimvoice/ifcsheet';

/** The class a material rule's swatch is drawn on: a wall, the usual cut. */
const SWATCH_CLASS = 'IfcWall';

/** The cut face of `name` (a class, or a material) the way `template` draws it now. */
export function swatchStyle(template: ProjectViewTemplate, by: StyleRule['by'], name: string): ItemStyle {
  const styler = viewStyler({
    graphics: resolveViewGraphics({ templateId: template.id }, [template]),
    pens: PEN_TABLE,
    materialOf: () => name,
  });
  return styler.face(by === 'class' ? { entityId: 1, ifcType: name } : { entityId: 1, ifcType: SWATCH_CLASS, materialId: 1 });
}

/** The names the template's rules already map, per kind, as rules compare them. */
export function mappedKeys(template: ProjectViewTemplate, by: StyleRule['by']): Set<string> {
  const keys = new Set<string>();
  for (const r of template.graphics.styleRules ?? []) {
    if (r.by === by) for (const m of r.match) keys.add(by === 'class' ? classKey(m) : materialKey(m));
  }
  return keys;
}
