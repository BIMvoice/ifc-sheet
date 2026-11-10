/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The SVGs that go with the annotated copy of the IFC (#548): the Bonsai drawing of a view and the layout of a sheet each name a file
 * (`drawings/<view>.svg`, `layouts/<number> - <sheet>.svg`) in their `IfcDocumentReference`. The files are the app's own sheet SVG
 * (`sheetSvgText`, what the SVG export button writes): a sheet whole, a view as the window of the sheet its first viewport takes.
 * Pure over the SVG text, so a test runs it without drawing a sheet.
 */

import { strToU8, zipSync } from 'fflate';
import type { AnnotatedSheet, AnnotatedView } from '@bimvoice/ifcsheet/annotated-ifc';
import type { ProjectSheet } from '@/project/types';

export type SheetFrame = Pick<ProjectSheet, 'id' | 'viewports'>;
export interface NamedBytes { name: string; bytes: Uint8Array }

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/** A window of a sheet's SVG, in paper millimetres from its top-left corner, as a standalone document of that size. */
export function cropSheetSvg(text: string, box: { x: number; y: number; w: number; h: number }): string {
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  root.setAttribute('width', `${num(box.w)}mm`);
  root.setAttribute('height', `${num(box.h)}mm`);
  root.setAttribute('viewBox', `${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
}

/**
 * Gives each view and sheet its SVG. `sheets` is the project's sheets in the order `collectAnnotations` listed them (`collected.sheets`
 * is the same list); `svgs` maps a sheet id to the SVG that was drawn. A view with no viewport on a drawn sheet, and a sheet that was
 * not drawn, get none (Bonsai then makes the file itself).
 */
export function withSvgs(
  collected: { views: AnnotatedView[]; sheets: AnnotatedSheet[] },
  sheets: readonly SheetFrame[],
  svgs: ReadonlyMap<string, string>,
): { views: AnnotatedView[]; sheets: AnnotatedSheet[] } {
  const views = collected.views.map((view) => {
    for (const sheet of sheets) {
      const text = svgs.get(sheet.id);
      const vp = text === undefined ? undefined : (sheet.viewports ?? []).find((v) => v.viewId === view.viewId && v.width > 0 && v.height > 0);
      if (text !== undefined && vp) return { ...view, svg: cropSheetSvg(text, { x: vp.x - vp.width / 2, y: vp.y - vp.height / 2, w: vp.width, h: vp.height }) };
    }
    return view;
  });
  const drawn = collected.sheets.map((s, i) => {
    const text = sheets[i] ? svgs.get(sheets[i].id) : undefined;
    return text === undefined ? s : { ...s, svg: text };
  });
  return { views, sheets: drawn };
}

/** The ZIP the copy is handed over in: the IFC files at its root and the SVGs at the paths their references name. */
export function annotatedZip(files: readonly NamedBytes[], support: readonly NamedBytes[]): Uint8Array {
  return zipSync(Object.fromEntries([...files, ...support].map((f) => [f.name, f.bytes])));
}

export const svgBytes = (text: string): Uint8Array => strToU8(text);
