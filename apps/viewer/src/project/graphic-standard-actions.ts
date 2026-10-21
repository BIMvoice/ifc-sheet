/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Choosing the project's graphic standard (`drafting/graphic-standard.ts`):
 * the id is stored on the project, the standard's own text and dimension
 * styles are added (and those another standard brought, unedited and unused,
 * removed; the project's own styles are never overwritten), and the standard's styles
 * become the ones new annotations take.
 */

import { useMemo } from 'react';
import { DEFAULT_GRAPHIC_STANDARD, graphicStandardOf, stylesInUse, stylesUnder, type GraphicStandard } from '@/drafting/graphic-standard';
import { setCurrentStyles } from '@/drafting/session';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { commitStandards } from './drafting-standards';
import { useProjectStore } from './project-store';

/** The standard the project's sheets draw with. */
export function useGraphicStandard(): GraphicStandard {
  const id = useProjectStore((s) => s.graphicStandard);
  return useMemo(() => graphicStandardOf(id), [id]);
}

/** Choose the project's standard (`default` or absent: the IfcSheet default). */
export function setGraphicStandard(id: string): void {
  const standard = graphicStandardOf(id);
  const s = useProjectStore.getState();
  const styles = stylesUnder(standard, s.textStyles?.length ? s.textStyles : [DEFAULT_TEXT_STYLE], s.dimStyles?.length ? s.dimStyles : [DEFAULT_DIM_STYLE], stylesInUse(s.drafts));
  commitStandards({ ...styles, graphicStandard: standard === DEFAULT_GRAPHIC_STANDARD ? undefined : standard.id });
  const text = styles.textStyles.find((t) => t.id === standard.current.textStyle);
  setCurrentStyles({ ...standard.current, ...(text ? { textHeightMm: text.height } : {}) });
}
