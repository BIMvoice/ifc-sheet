/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Graphic standards: the definitions (the paper pens and text sizes of a drawing set, chosen once per project,
 * `ProjectDocument.graphicStandard`) are the engine package's (`packages/ifcsheet/src/graphic-standard.ts`), re-exported
 * here, so the app, the PDF and the command line draw with the same ones. What stays here is the app's handling of the
 * style lists a standard adds to the project's style book: a standard's text and dimension styles are added under their
 * own names and selected for new annotations (`setGraphicStandard`); the project's own styles, Standard included, are
 * never overwritten, so going back to the default restores them exactly. A standard's style still in use (by a drawn
 * element, or by a dimension style that stays) stays too.
 */

import { GRAPHIC_STANDARDS, type GraphicStandard } from '@bimvoice/ifcsheet';
import type { DimStyle, TextStyle } from './styles';

export {
  DEFAULT_GRAPHIC_STANDARD, GRAPHIC_STANDARDS, ISO_128_LINE_WIDTHS, GERMAN_PRACTICE, ISO_3098_HEIGHTS, ROMANIAN_PRACTICE, graphicStandardOf, knownGraphicStandard, standardValues,
  type GraphicStandard, type WeightPair,
} from '@bimvoice/ifcsheet';

/** A style as comparable text: flat objects, keys sorted, so a file round trip that reorders keys still compares equal. */
const canonical = (style: object): string => JSON.stringify(style, Object.keys(style).sort());

/**
 * One style list under `own`, the chosen standard's styles. A style another
 * built-in standard brought and the user left as it came goes, unless `used`
 * names it; one the user edited is theirs now and stays. Every other style
 * stays as it is, in its place. The chosen standard's styles are appended
 * where their id is free: one already there (edited or not) is never
 * overwritten.
 */
function listUnder<T extends { id: string }>(own: readonly T[], brought: readonly T[], list: readonly T[], used: ReadonlySet<string>): T[] {
  const asBrought = new Map(brought.map((x) => [x.id, canonical(x)]));
  const ownIds = new Set(own.map((x) => x.id));
  const kept = list.filter((x) => ownIds.has(x.id) || used.has(x.id) || asBrought.get(x.id) !== canonical(x));
  const taken = new Set(kept.map((x) => x.id));
  return [...kept, ...own.filter((x) => !taken.has(x.id)).map((x) => ({ ...x }))];
}

/** Style ids drawn elements name (`params.textStyle` / `params.dimStyle`). */
export interface StylesInUse {
  textStyles: ReadonlySet<string>;
  dimStyles: ReadonlySet<string>;
}

const NONE_IN_USE: StylesInUse = { textStyles: new Set(), dimStyles: new Set() };

/** The style ids `drafts` name. */
export function stylesInUse(drafts: readonly { params: Record<string, unknown> }[]): StylesInUse {
  const ids = (key: string) => new Set(drafts.map((d) => d.params[key]).filter((v): v is string => typeof v === 'string'));
  return { textStyles: ids('textStyle'), dimStyles: ids('dimStyle') };
}

/**
 * The project's style lists under `standard` (see `listUnder`). A style `inUse`
 * names is kept, and so is the text style of every dimension style kept, so no
 * element is left naming a style the project no longer has. Going from the
 * default to a standard and back returns the lists the project had, exactly,
 * as long as the standard's styles were not edited or used meanwhile.
 */
export function stylesUnder(standard: GraphicStandard, textStyles: readonly TextStyle[], dimStyles: readonly DimStyle[], inUse: StylesInUse = NONE_IN_USE): { textStyles: TextStyle[]; dimStyles: DimStyle[] } {
  const dims = listUnder(standard.dimStyles, GRAPHIC_STANDARDS.flatMap((g) => g.dimStyles), dimStyles, inUse.dimStyles);
  const usedText = new Set([...inUse.textStyles, ...dims.map((d) => d.textStyle)]);
  return {
    textStyles: listUnder(standard.textStyles, GRAPHIC_STANDARDS.flatMap((g) => g.textStyles), textStyles, usedText),
    dimStyles: dims,
  };
}
