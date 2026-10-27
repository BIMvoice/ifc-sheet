/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's layout as data (#143), whose types and text fitting live
 * in the engine package (`packages/ifcsheet/src/title-block-template.ts`) so
 * the PDF prints the same layout. The standard layout is the engine's and
 * is what a project prints until its layout is edited; editing saves a
 * `ProjectDocument.titleBlockTemplate` that every sheet prints.
 */

import type { TranslationKey } from '@/i18n';
import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from '@/drafting/graphic-standard';
import { fitCell, fitText, ITEM_KINDS, MAX_TEXT, standardTitleBlock as engineStandardTitleBlock, TEXT_FIT_MIN, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate } from '@bimvoice/ifcsheet';

export { fitCell, fitText, ITEM_KINDS, MAX_TEXT, TEXT_FIT_MIN, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate };

/**
 * The standard layout (180 x 50 mm), built in the engine package
 * (`title-block-standard.ts`) so the PDF and the command line print it too;
 * here its captions are written in the language of `t` at the time, with the
 * pens and letter heights of the graphic standard.
 */
export function standardTitleBlock(t: (key: TranslationKey) => string, standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD): TitleBlockTemplate {
  return engineStandardTitleBlock(t, standard);
}
