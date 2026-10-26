/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view template's class and material mapping (#31): which `StyleRule`s speak for an IFC class and for a building material.
 * Within one kind a later rule wins, field by field. The styler (`view-style.ts`) lays class rules, then material rules, over the
 * template's category graphics and under the view's own; the app's cut hatches (`cutHatches`) read the same answer from here.
 */

import type { StyleRule, StyleRuleStyle } from './view-graphics-types.js';

/** A class name as rules compare it: upper case, a "standard case" or "elemented case" subtype being its base class (`IfcWall` covers `IfcWallStandardCase`). */
export const classKey = (ifcType: string): string => ifcType.trim().toUpperCase().replace(/(STANDARDCASE|ELEMENTEDCASE)$/, '');

/** A material name as rules compare it: case and spacing aside. */
export const materialKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const NONE: StyleRuleStyle = Object.freeze({});

/** What the rules of `by` say of `key` (`classKey` / `materialKey` of the item), merged in list order; empty when none matches. */
export function ruleStyleFor(rules: readonly StyleRule[] | undefined, by: StyleRule['by'], key: string | null | undefined): StyleRuleStyle {
  if (!rules?.length || !key) return NONE;
  let out: StyleRuleStyle = NONE;
  for (const r of rules) {
    if (r.by !== by || !r.match.some((m) => (by === 'class' ? classKey(m) : materialKey(m)) === key)) continue;
    out = { ...out, ...r.style };
  }
  return out;
}

/** The class and material styles of one item. */
export interface ItemRules {
  classStyle: StyleRuleStyle;
  materialStyle: StyleRuleStyle;
}

export function itemRules(rules: readonly StyleRule[] | undefined, ifcType: string | undefined, materialName: string | null | undefined): ItemRules {
  return { classStyle: ruleStyleFor(rules, 'class', ifcType ? classKey(ifcType) : null), materialStyle: ruleStyleFor(rules, 'material', materialName ? materialKey(materialName) : null) };
}
