/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawing on a sheet's paper where it hangs: the same drafting session as a
 * view (snaps, undo, the prompt line), in paper millimetres, through
 * `useSheetDrafting`. What is drawn lives on the sheet and prints with it.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePat } from '@/drafting/hatch/pattern';
import { pressEscape, submitCommandLine } from '@/drafting/session';
import type { Pt } from '@/drafting/types';
import { capturePointer } from '@/lib/pointer-capture';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { CommandLine } from '../drafting/CommandLine';
import { useDraftingKeys } from '../drafting/useDraftingKeys';
import { useSheetDrafting } from '../sheets/useSheetDrafting';
import type { SheetContent } from '../sheets/useSheetContent';
import { WallSheet } from './WallSheet';

export function SheetDrawingSurface({ sheet, sheetContent }: { sheet: ProjectSheet; sheetContent: SheetContent }) {
  const host = useRef<HTMLDivElement>(null);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const extraPatterns = useMemo(() => parsePat(patternText).patterns, [patternText]);
  // The paper fitted into the space, at its top left: px per mm and offset.
  const [pan, setPan] = useState({ x: 0, y: 0, k: 1 });
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const paper = paperOf(sheet);
      const k = Math.max(0.1, Math.min((width - 16) / paper.w, (height - 16) / paper.h));
      setPan({ x: 8, y: 8, k });
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sheet]);
  const drafting = useSheetDrafting(sheet.id, pan, extraPatterns);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const last = useRef<Pt | null>(null);
  useDraftingKeys({ inputRef, setText, submit: () => submitCommandLine('', last.current) });
  const toPaper = (clientX: number, clientY: number): Pt => {
    const rect = host.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0) - pan.x) / pan.k, y: (clientY - (rect?.top ?? 0) - pan.y) / pan.k };
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={host}
        data-sheet-canvas
        className={`relative min-h-0 flex-1 overflow-hidden touch-none ${drafting.drafting ? 'cursor-none' : 'cursor-crosshair'}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          capturePointer(e.currentTarget, e.pointerId);
          drafting.down(toPaper(e.clientX, e.clientY), e.shiftKey);
        }}
        onPointerMove={(e) => {
          last.current = toPaper(e.clientX, e.clientY);
          drafting.move(last.current);
        }}
      >
        <div className="absolute" style={{ left: pan.x, top: pan.y }}>
          <WallSheet sheet={sheet} width={paperOf(sheet).w * pan.k} sheetContent={sheetContent} />
        </div>
        {drafting.overlay}
      </div>
      <div className="bg-white text-zinc-900">
        <CommandLine ref={inputRef} value={text} onChange={setText} onSubmit={() => { submitCommandLine(text, last.current); setText(''); }} onEscape={() => { setText(''); pressEscape(); }} />
      </div>
    </div>
  );
}
