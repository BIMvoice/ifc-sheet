/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation types: what applying one does to the drafting settings, and
 * capturing the current settings as a new one. Pure; the store and the
 * drafting session are driven from `annotation-type-actions.ts`.
 */

import type { DraftSettings } from '@/drafting/commands/types';
import { dimStyleOf, textStyleOf, type StyleBook } from '@/drafting/styles';
import type { DraftLayer } from '@/drafting/types';
import type { AnnotationTool, AnnotationType } from './types';

export interface TypeEffect {
  textStyle: string;
  dimStyle: string;
  /** Paper millimetres: the text height of the type's text style. */
  textHeightMm: number;
  /** The layer to draw on, when the type names one that exists. */
  layer?: string;
  settings: Partial<DraftSettings>;
}

const isDimension = (tool: AnnotationTool) => tool.startsWith('dim');

/** What drafting with `type` means for the settings, given the styles and layers of the project and the styles in use now. */
export function typeEffect(type: AnnotationType, book: StyleBook, layers: readonly DraftLayer[], current: { textStyle: string; dimStyle: string }): TypeEffect {
  const dimStyle = type.dimStyle && book.dimStyles.some((d) => d.id === type.dimStyle) ? type.dimStyle : current.dimStyle;
  // A dimension's text is its dimension style's; the type's own text style applies to the other tools.
  const textStyle = isDimension(type.tool) && type.dimStyle
    ? dimStyleOf(book, dimStyle).textStyle
    : type.textStyle && book.textStyles.some((s) => s.id === type.textStyle) ? type.textStyle : current.textStyle;
  const settings: Partial<DraftSettings> = { annotationType: { id: type.id, tool: type.tool } };
  if (type.axis) Object.assign(settings, { axisBubble: type.axis.bubble, axisEnds: type.axis.ends, axisSize: type.axis.size, axisLineType: type.axis.lineType });
  if (type.hatch) Object.assign(settings, { hatchPattern: type.hatch.pattern, hatchScale: type.hatch.scale, hatchAngle: type.hatch.angle });
  if (type.tagField) settings.tagField = type.tagField;
  return {
    textStyle, dimStyle, textHeightMm: textStyleOf(book, textStyle).height,
    ...(type.layer && layers.some((l) => l.id === type.layer) ? { layer: type.layer } : {}),
    settings,
  };
}

/** A new type for `tool` from the settings in force now. */
export function captureType(
  id: string, name: string, tool: AnnotationTool, settings: Readonly<DraftSettings>, layer: string,
): AnnotationType {
  const type: AnnotationType = { id, name, tool, layer };
  if (isDimension(tool)) type.dimStyle = settings.currentDimStyle;
  else type.textStyle = settings.currentTextStyle;
  if (tool === 'axis') type.axis = { bubble: settings.axisBubble, ends: settings.axisEnds, size: settings.axisSize, lineType: settings.axisLineType };
  if (tool === 'hatch') type.hatch = { pattern: settings.hatchPattern, scale: settings.hatchScale, angle: settings.hatchAngle };
  if (tool === 'tag') type.tagField = settings.tagField;
  return type;
}
