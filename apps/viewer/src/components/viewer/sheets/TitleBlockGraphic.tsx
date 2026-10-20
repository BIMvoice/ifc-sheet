/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block, bottom right, drawn from its layout (#143): the project's
 * edited layout, else the standard one (`title-block-template.ts`). Text is
 * resolved through the sheet's parameters; the logo is the project's.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { FRAME_MARGIN_MM, TITLE_BLOCK_MM } from '@/project/sheets';
import { useProjectStore } from '@/project/project-store';
import { LOGO_FIELD } from '@/project/title-block';
import { useEffectiveTitleBlock } from '@/project/title-block-model';
import { resolveParamText } from '@/project/title-block-params';
import { standardTitleBlock, textSizeFor, type TemplateItem } from '@/project/title-block-template';
import type { ProjectSheet } from '@/project/types';
import { penTags } from './dxf-tags';
import { useSheetParamLookup } from './useSheetParams';

const FONT = 'ui-sans-serif, system-ui, sans-serif';

function Item({ item, ox, oy, lookup, logo }: { item: TemplateItem; ox: number; oy: number; lookup: (name: string) => string | undefined; logo: string | undefined }) {
  switch (item.kind) {
    case 'rect':
      return <rect x={ox + item.x} y={oy + item.y} width={item.w} height={item.h} fill="none" stroke="#000" strokeWidth={item.weight} />;
    case 'line':
      return <line x1={ox + item.x1} y1={oy + item.y1} x2={ox + item.x2} y2={oy + item.y2} stroke="#000" strokeWidth={item.weight} />;
    case 'logo':
      return logo ? <image data-export-ignore-dxf="true" href={logo} x={ox + item.x} y={oy + item.y} width={item.w} height={item.h} preserveAspectRatio="xMidYMid meet" /> : null;
    default: {
      const shown = resolveParamText(item.text, lookup);
      return <text x={ox + item.x} y={oy + item.y} fontSize={textSizeFor(item, shown)} fontWeight={item.bold ? 700 : undefined} fontFamily={FONT} fill={item.muted ? '#52525b' : '#000'}>{shown}</text>;
    }
  }
}

export function TitleBlockGraphic({ sheet, projectName, w, h }: { sheet: ProjectSheet; projectName: string; w: number; h: number }) {
  const { t } = useTranslation();
  const logo = useEffectiveTitleBlock()?.[LOGO_FIELD];
  const edited = useProjectStore((s) => s.titleBlockTemplate);
  const lookup = useSheetParamLookup(sheet, projectName);
  const template = useMemo(() => edited ?? standardTitleBlock(t), [edited, t]);
  const ox = w - FRAME_MARGIN_MM - TITLE_BLOCK_MM.w;
  const oy = h - FRAME_MARGIN_MM - TITLE_BLOCK_MM.h;
  return (
    <g {...penTags('TITLEBLOCK', 0.35)}>
      <rect x={ox} y={oy} width={TITLE_BLOCK_MM.w} height={TITLE_BLOCK_MM.h} fill="#fff" />
      {template.items.map((item) => <Item key={item.id} item={item} ox={ox} oy={oy} lookup={lookup} logo={logo} />)}
    </g>
  );
}
