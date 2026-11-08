/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { frameOf, titleBlockRect } from './sheet-frame.js';
import type { SheetImage, SheetText } from './sheet-graphic.js';
import { LOGO_FIELD } from './title-block-fields.js';
import { printTitleBlock, sheetLookup } from './title-block-print.js';
import { standardCaptionsFor, standardTitleBlock } from './title-block-standard.js';

type Polyline = readonly Point2D[];

/** The logo as the PDF can draw it: a PNG or JPEG data URL. An SVG logo, which the app shows, is not drawn here yet. */
export function printableLogo(src: string | undefined): string | undefined {
  return src && /^data:image\/(png|jpeg);base64,/i.test(src) ? src : undefined;
}

/**
 * The title block: the layout the project keeps (`doc.titleBlockTemplate`: the Romanian one, or any the app edited),
 * else the standard one, as the app does (`title-block-standard.ts`). `projectFields` are the project's fields
 * resolved from the model (`title-block-sources.ts`); without them the document's typed values are all there is.
 */
export function titleBlock(sheet: ProjectSheet, doc: ProjectDocument, paper: { w: number; h: number }, scale: string, projectFields?: Record<string, string>, language?: string): { frame: Polyline[]; texts: SheetText[]; images: SheetImage[] } {
  const tb = titleBlockRect(paper, frameOf(sheet));
  const template = doc.titleBlockTemplate ?? standardTitleBlock(standardCaptionsFor(language));
  return printTitleBlock(template, sheetLookup(sheet, doc, scale, projectFields, language), tb, frameOf(sheet).titleBlock === 'right', printableLogo((projectFields ?? doc.titleBlock)?.[LOGO_FIELD]));
}

