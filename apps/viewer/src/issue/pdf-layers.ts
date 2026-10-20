/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The layers of an issued sheet. The sheet SVG says what each element is with
 * the same `data-dxf-layer` tag the DXF export reads (`sheets/dxf-tags.ts`):
 * the frame, the title block and the view titles; the generated drawing's pens
 * (cut, seen, hidden, fills, hatching); schedules, legends and road drawings;
 * and, for anything drafted, the drafting layer's own name. Elements with no
 * tag are the sheet itself.
 *
 * `layerRuns` cuts a sheet into runs of consecutive elements on one layer, in
 * the order they are drawn, each run an SVG of its own that keeps its
 * ancestors (transforms, clips) and the shared definitions. Drawn one after
 * another, the runs paint exactly what the whole sheet paints: stacking order
 * is the document order, whatever the layers are.
 */

/** Where a layer sits in the layers panel of a PDF reader. */
export type LayerGroup = 'sheet' | 'drawing' | 'schedules' | 'drafting';

export interface LayerRef {
  group: LayerGroup;
  /** The role tag (`CUT`, `FRAME`, ...) or, for drafting, the drafting layer's name. */
  key: string;
}

/** The groups of the roles the sheet's own code tags; a tag outside this table is a drafting layer's name. */
export const ROLE_LAYERS: Readonly<Record<string, LayerGroup>> = {
  SHEET: 'sheet', FRAME: 'sheet', TITLEBLOCK: 'sheet', 'VIEWPORT-LABELS': 'sheet',
  FILL: 'drawing', HATCH: 'drawing', HIDDEN: 'drawing', SEEN: 'drawing', CUT: 'drawing',
  SYMBOLS: 'drawing', ROOF: 'drawing', MEMBRANE: 'drawing', ROAD: 'drawing',
  SCHEDULE: 'schedules', 'SCHEDULE-SYMBOLS': 'schedules', LEGEND: 'schedules',
};

/** A tag's layer: a known role, a road drawing's layer, or a drafting layer. */
export function layerOf(tag: string | null): LayerRef {
  if (tag === null) return { group: 'sheet', key: 'SHEET' };
  const group = ROLE_LAYERS[tag] ?? (tag.startsWith('C-ROAD-') ? 'schedules' : 'drafting');
  return { group, key: tag };
}

export interface LayerRun {
  layer: LayerRef;
  /** A standalone SVG with only this run's elements (and the sheet's definitions). */
  svg: SVGSVGElement;
}

const NS = 'http://www.w3.org/2000/svg';
/** Elements that define things other elements use; they draw nothing themselves. */
const DEFINITIONS = new Set(['defs', 'clippath', 'mask', 'pattern', 'marker', 'symbol', 'style', 'lineargradient', 'radialgradient', 'filter', 'title', 'desc', 'metadata']);

const tagOf = (el: Element) => el.getAttribute('data-dxf-layer');

interface Unit { el: Element; layer: LayerRef }

/** The drawn elements in document order, each with its layer: a tagged element carries its whole subtree. */
function unitsOf(root: Element, out: Unit[], definitions: Element[]): void {
  for (const child of Array.from(root.children)) {
    const name = child.localName.toLowerCase();
    if (DEFINITIONS.has(name)) {
      definitions.push(child);
      continue;
    }
    const tag = tagOf(child);
    if (tag !== null) out.push({ el: child, layer: layerOf(tag) });
    else if (name === 'g' || name === 'a' || name === 'svg') unitsOf(child, out, definitions);
    else out.push({ el: child, layer: layerOf(null) });
  }
}

/** The sheet as runs of consecutive elements on one layer. Definitions are shared by every run; nothing is left out. */
export function layerRuns(sheet: SVGSVGElement): LayerRun[] {
  const units: Unit[] = [];
  const definitions: Element[] = [];
  unitsOf(sheet, units, definitions);
  const groups: { layer: LayerRef; els: Element[] }[] = [];
  for (const u of units) {
    const last = groups.at(-1);
    if (last && last.layer.group === u.layer.group && last.layer.key === u.layer.key) last.els.push(u.el);
    else groups.push({ layer: u.layer, els: [u.el] });
  }
  return groups.map(({ layer, els }) => ({ layer, svg: runSvg(sheet, definitions, els) }));
}

/** A copy of the sheet's root holding the definitions and `els`, each under copies of its ancestors. */
function runSvg(sheet: SVGSVGElement, definitions: readonly Element[], els: readonly Element[]): SVGSVGElement {
  const root = sheet.cloneNode(false) as SVGSVGElement;
  if (definitions.length > 0) {
    const defs = sheet.ownerDocument.createElementNS(NS, 'defs');
    for (const d of definitions) defs.appendChild(d.cloneNode(true));
    root.appendChild(defs);
  }
  const copies = new Map<Element, Element>([[sheet, root]]);
  const ensure = (el: Element): Element => {
    const known = copies.get(el);
    if (known) return known;
    const copy = el.cloneNode(false) as Element;
    (el.parentElement ? ensure(el.parentElement) : root).appendChild(copy);
    copies.set(el, copy);
    return copy;
  };
  for (const el of els) (el.parentElement ? ensure(el.parentElement) : root).appendChild(el.cloneNode(true));
  return root;
}
