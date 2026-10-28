/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bar of the drawing in front for single elements (#32, #33). With elements selected in the drawing it offers "Hide in this view"
 * and "Graphics for this element…" (the overrides panel); "Hide a line" picks one line of the drawing; "Show hidden" greys in what the
 * view hides so it can be clicked back. Each action is one undo step (`element-graphics-actions.ts`). The 3D view's own hide and
 * isolate state is not touched, and not followed.
 */

import { useMemo, useState } from 'react';
import type { ViewGraphics } from '@bimvoice/ifcsheet';
import { hiddenElementIds } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { hideElements, showAllHidden } from '@/project/element-graphics-actions';
import { selectedElements } from '@/project/model-guids';
import { FLIP_HINGE, FLIP_SWING, flipOnDrawing, flippableGlobalIds, resetFlipsOnDrawing } from '@/project/drawing-symbol-flips';
import { useProjectStore } from '@/project/project-store';
import { ElementGraphicsPanel } from './ElementGraphicsPanel';

const NO_FLIPS: Record<string, number> = {};
const BTN = 'h-7 whitespace-nowrap rounded-sm px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800';

interface Props {
  viewId: string;
  graphics: ViewGraphics | undefined;
  extraPatterns: readonly HatchPattern[];
  showHidden: boolean;
  onShowHidden: (on: boolean) => void;
  pickingLine: boolean;
  onPickLine: (on: boolean) => void;
}

export function ElementGraphicsBar({ viewId, graphics, extraPatterns, showHidden, onShowHidden, pickingLine, onPickLine }: Props) {
  const { t } = useTranslation();
  const [panel, setPanel] = useState(false);
  const selectedIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedId = useViewerStore((s) => s.selectedEntityId);
  const models = useViewerStore((s) => s.models);
  const elements = useMemo(() => selectedElements(), [selectedIds, selectedId, models]);
  const flips = useProjectStore((s) => s.symbolFlips) ?? NO_FLIPS;
  // Doors (and typed windows) among the selection: they can be turned on this drawing without touching the model.
  const flippable = useMemo(() => flippableGlobalIds([...new Set([...(selectedIds ?? []), ...(selectedId !== null && selectedId !== undefined ? [selectedId] : [])])]), [selectedIds, selectedId, models]);
  const flippedSelected = flippable.filter((g) => flips[g]);
  const flippedCount = Object.keys(flips).length;
  const hiddenCount = hiddenElementIds(graphics).length + (graphics?.hiddenLines?.length ?? 0);
  const hide = () => {
    hideElements(viewId, elements.map((e) => e.globalId));
    setPanel(false);
  };
  return (
    <>
      <div
        data-element-graphics-bar role="toolbar" aria-label={t('elgfx.hide')}
        className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] cursor-default flex-wrap items-center gap-0.5 rounded-md border border-zinc-300 bg-white/95 p-1 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {elements.length > 0 ? (
          <>
            <span className="px-1.5 text-xs text-zinc-600 dark:text-zinc-400">{t('elgfx.selected', { count: elements.length })}</span>
            <button type="button" className={BTN} onClick={hide}>{t('elgfx.hide')}</button>
            <button type="button" className={BTN} aria-expanded={panel} onClick={() => setPanel(!panel)}>{elements.length === 1 ? t('elgfx.graphics') : t('elgfx.graphicsMany')}</button>
          </>
        ) : null}
        {flippable.length > 0 ? (
          <>
            <button type="button" className={BTN} onClick={() => flipOnDrawing(flippable, FLIP_SWING)}>{t('elgfx.flipSwing')}</button>
            <button type="button" className={BTN} onClick={() => flipOnDrawing(flippable, FLIP_HINGE)}>{t('elgfx.flipHinge')}</button>
          </>
        ) : null}
        {flippedSelected.length > 0 ? (
          <>
            <output className="px-1.5 text-xs text-primary">{t('elgfx.flipped')}</output>
            <button type="button" className={BTN} onClick={() => resetFlipsOnDrawing(flippedSelected)}>{t('elgfx.flipReset')}</button>
          </>
        ) : null}
        {flippedCount > flippedSelected.length ? <button type="button" className={BTN} onClick={() => resetFlipsOnDrawing()}>{t('elgfx.flipResetAll', { count: flippedCount })}</button> : null}
        <button type="button" className={BTN} aria-pressed={pickingLine} onClick={() => onPickLine(!pickingLine)}>{t('elgfx.hideLine')}</button>
        {hiddenCount > 0 ? (
          <>
            <button type="button" className={BTN} aria-pressed={showHidden} onClick={() => onShowHidden(!showHidden)}>{t('elgfx.showHidden', { count: hiddenCount })}</button>
            <button type="button" className={BTN} onClick={() => showAllHidden(viewId)}>{t('elgfx.showAll')}</button>
          </>
        ) : null}
        {pickingLine ? <output className="px-1.5 text-xs text-zinc-600 dark:text-zinc-400">{t('elgfx.pickLine')}</output> : null}
        {showHidden && hiddenCount > 0 && !pickingLine ? <output className="px-1.5 text-xs text-zinc-600 dark:text-zinc-400">{t('elgfx.ghostHint')}</output> : null}
      </div>
      {panel && elements.length > 0 ? (
        <ElementGraphicsPanel viewId={viewId} elements={elements} current={graphics?.elements?.[elements[0].globalId]} extraPatterns={extraPatterns} onClose={() => setPanel(false)} />
      ) : null}
    </>
  );
}
