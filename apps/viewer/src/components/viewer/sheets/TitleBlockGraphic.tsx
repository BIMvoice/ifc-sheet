/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block, in the frame's bottom-right corner or as a strip down its
 * right side, drawn from its layout (#143): the project's edited layout, else
 * the standard one (`title-block-template.ts`, on the project's graphic
 * standard). Text is resolved through the sheet's parameters; the logo is the
 * project's.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { frameOf, titleBlockRect, TITLE_BLOCK_MM } from '@/project/sheet-frame';
import { useGraphicStandard } from '@/project/graphic-standard-actions';
import { useProjectStore } from '@/project/project-store';
import { LOGO_FIELD } from '@/project/title-block';
import { useEffectiveTitleBlock } from '@/project/title-block-model';
import { resolveParamText } from '@/project/title-block-params';
import { fitCell, standardTitleBlock, type TemplateItem } from '@/project/title-block-template';
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
      // The same fit the PDF prints (`fitCell`): a long value wraps or shrinks, one line of text per printed line.
      const { size, lines } = fitCell(item, resolveParamText(item.text, lookup));
      return <>{lines.map((line, i) => <text key={i} x={ox + item.x} y={oy + item.y + line.dy} fontSize={size} fontWeight={item.bold ? 700 : undefined} fontFamily={FONT} fill={item.muted ? '#52525b' : '#000'}>{line.text}</text>)}</>;
    }
  }
}

export function TitleBlockGraphic({ sheet, projectName, w, h, issueDate }: { sheet: ProjectSheet; projectName: string; w: number; h: number; issueDate?: string }) {
  const { t } = useTranslation();
  const logo = useEffectiveTitleBlock()?.[LOGO_FIELD];
  const edited = useProjectStore((s) => s.titleBlockTemplate);
  const lookup = useSheetParamLookup(sheet, projectName, issueDate);
  const standard = useGraphicStandard();
  const template = useMemo(() => edited ?? standardTitleBlock(t, standard), [edited, t, standard]);
  const frame = frameOf(sheet);
  const box = titleBlockRect({ w, h }, frame);
  // Drawn at its own origin, then set in place (turned a quarter when it is a strip).
  return (
    <g {...penTags('TITLEBLOCK', standard.sheet.titleDivider)} data-title-block={frame.titleBlock} transform={frame.titleBlock === 'right' ? `translate(${box.x} ${box.y + box.h}) rotate(-90)` : `translate(${box.x} ${box.y})`}>
      <rect x={0} y={0} width={TITLE_BLOCK_MM.w} height={TITLE_BLOCK_MM.h} fill="#fff" />
      {template.items.map((item) => <Item key={item.id} item={item} ox={0} oy={0} lookup={lookup} logo={logo} />)}
    </g>
  );
}
