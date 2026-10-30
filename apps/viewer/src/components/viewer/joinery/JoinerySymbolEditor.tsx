/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The canvas a door or window type's plan symbol is drawn on (#448): the drafting view of the plans (`DraftingView`), in a dialog,
 * sized to the opening (its width and the frame's depth are drawn as a guide, the generated symbol faint inside it). There is no second
 * editor; the shapes are a working copy of the type's block (`joinery/symbol-drafts.ts`). Save makes the drawing the type's block, Reset
 * takes it away so the generated symbol draws again, Cancel changes nothing.
 *
 * The drafting session is one for the app, so it is parked while this one is open and given back whole after it has closed
 * (`parkDraftingSession`: selection, running command, history lines; `openSymbolDrafts`: the undo history). However the editor ends, by
 * a button, the overlay or an error unmounting it, the effect's cleanup gives them back.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JoineryBlockSymbol, JoinerySpec } from '@ifc-lite/create';
import { symbolCanvas } from '@bimvoice/ifcsheet/project';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { drawingToScreen, type ViewTransform } from '@/drafting/frame';
import { parkDraftingSession } from '@/drafting/session-park';
import type { ProjectView } from '@/project/types';
import { planSymbol } from '@/joinery/symbols';
import { drawnSymbolOf, openSymbolDrafts } from '@/joinery/symbol-drafts';
import { joinerySymbolViewId } from '@/joinery/view-draft-id';
import { DraftingView, type DraftingTarget } from '../drafting/DraftingView';

/** The scale annotation sizes are read at; a symbol has no text, so it only has to be a plan scale. */
const SCALE = 50;

export function JoinerySymbolEditor({ spec, block, onSave, onClose }: {
  spec: JoinerySpec; block: JoineryBlockSymbol | null; onSave: (block: JoineryBlockSymbol | null) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const typeId = spec.id ?? '';
  const [open, setOpen] = useState(false);
  const opened = useRef(block);
  useEffect(() => {
    const restore = parkDraftingSession();
    const close = openSymbolDrafts(typeId, opened.current);
    setOpen(true);
    // The canvas below clears the session's inputs as it unmounts, after this cleanup: the view the user was in is given back once it has.
    return () => { setOpen(false); close(); setTimeout(restore, 0); };
  }, [typeId]);

  const canvas = useMemo(() => symbolCanvas(spec), [spec]);
  const generated = useMemo(() => {
    const { planBlock: _block, ...bare } = spec;
    return planSymbol(bare).map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: p.x, y: p.y - spec.frame.offset })) }));
  }, [spec]);
  const target = useMemo<DraftingTarget>(() => ({
    axis: 'front',
    fit: canvas.view,
    underlay: (transform: ViewTransform) => {
      const a = drawingToScreen(canvas.opening.min, transform, 'front'), b = drawingToScreen(canvas.opening.max, transform, 'front');
      return (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" data-symbol-underlay>
          <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="none" stroke="#a1a1aa" strokeDasharray="4 3" />
          {generated.map((s, i) => (
            <polyline key={i} fill="none" stroke="#d4d4d8" strokeWidth={1}
              points={s.pts.map((p) => { const q = drawingToScreen(p, transform, 'front'); return `${q.x},${q.y}`; }).join(' ')} />
          ))}
        </svg>
      );
    },
  }), [canvas, generated]);
  const pseudo = useMemo<Exclude<ProjectView, { kind: '3d' }>>(
    () => ({ kind: 'drafting', id: joinerySymbolViewId(typeId), name: `${spec.mark} ${spec.name}`, createdAt: 0, scale: SCALE }),
    [typeId, spec.mark, spec.name],
  );
  const mm = (m: number) => Math.round(m * 1000);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* Escape belongs to the drafting command that is running, not to the dialog. */}
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col" onEscapeKeyDown={(e) => e.preventDefault()} data-symbol-editor={typeId}>
        <DialogHeader>
          <DialogTitle>{t('joinery.symbol.title', { mark: spec.mark, name: spec.name })}</DialogTitle>
          <DialogDescription>{t('joinery.symbol.hint', { width: mm(spec.width), depth: mm(spec.frame.depth) })}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 border border-zinc-200 dark:border-zinc-800">{open ? <DraftingView view={pseudo} bare target={target} /> : null}</div>
        <DialogFooter className="gap-1">
          <Button variant="ghost" data-symbol-cancel onClick={onClose}>{t('joinery.symbol.cancel')}</Button>
          <Button variant="outline" data-symbol-reset onClick={() => { try { onSave(null); } finally { onClose(); } }}>{t('joinery.symbol.reset')}</Button>
          <Button data-symbol-save onClick={() => { try { onSave(drawnSymbolOf(typeId)); } finally { onClose(); } }}>{t('joinery.symbol.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
