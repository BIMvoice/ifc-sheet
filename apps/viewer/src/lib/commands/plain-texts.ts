/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tool texts for a person who is not in AutoCAD mode (#168): where the AutoCAD
 * text says "Enter to finish" or "type MARK", the plain text names the visible
 * way out (the Done button, the tag card's field choice). With AutoCAD mode on
 * the original text is used unchanged. The map is key to key, so a text shared
 * by both modes has one source and the plain one is a second.
 */

import { useCallback } from 'react';
import { useTranslation } from '@/i18n';
import type { TranslationKey, TranslationParameters } from '@/i18n';
import { useAutocadMode } from './autocad-mode';

export const PLAIN_TEXT: Readonly<Partial<Record<TranslationKey, TranslationKey>>> = {
  'wall.drawHint': 'plainHints.drawHint',
  'wall.tool.dimension.hint': 'plainHints.dimensionHint',
  'elgfx.pickLine': 'plainHints.pickLine',
  'drafting.prompt.levelPoint': 'plainHints.levelPoint',
  'drafting.prompt.place.door': 'plainHints.placeDoor',
  'drafting.prompt.place.window': 'plainHints.placeWindow',
  'drafting.prompt.place.opening': 'plainHints.placeOpening',
  'drafting.prompt.labelElement': 'plainHints.labelElement',
  'drafting.prompt.tagElement': 'plainHints.tagElement',
  'drafting.prompt.tagLabel': 'plainHints.tagLabel',
  'drafting.prompt.chainAdd': 'plainHints.chainAdd',
  'drafting.prompt.chainRemove': 'plainHints.chainRemove',
  'drafting.prompt.chainSplit': 'plainHints.chainSplit',
  'drafting.prompt.secondPoint': 'plainHints.secondPoint',
  'drafting.prompt.trimPick': 'plainHints.trimPick',
  'wall.draw.polyline.body': 'polylineCard.body',
  'drafting.prompt.polylineNext': 'plainHints.polylineNext',
  'drafting.prompt.extendPick': 'plainHints.extendPick',
};

/** `t`, with the plain text in place of the AutoCAD one while AutoCAD mode is off. */
export function usePlainT(): (key: TranslationKey, params?: TranslationParameters) => string {
  const { t } = useTranslation();
  const autocad = useAutocadMode((s) => s.on);
  return useCallback((key, params) => t(autocad ? key : PLAIN_TEXT[key] ?? key, params), [t, autocad]);
}
