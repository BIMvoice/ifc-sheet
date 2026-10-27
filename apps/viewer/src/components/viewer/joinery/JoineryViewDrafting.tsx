/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A joinery type's front, plan or section as a drafting view (#492): the drafting view of the plans (`DraftingView`) with the type's own
 * lines under the shapes. There is no second editor; the shapes belong to the type (`joinery/view-drafts.ts`).
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { JoinerySpec } from '@ifc-lite/create';
import { joineryViewLines, type JoineryViewName } from '@bimvoice/ifcsheet/project';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { drawingToScreen, type ViewTransform } from '@/drafting/frame';
import type { ProjectView } from '@/project/types';
import type { ElementViews } from '@/joinery/element-views';
import { joineryDraftViewId } from '@/joinery/view-draft-id';
import { openJoineryViewDrafts } from '@/joinery/view-drafts';
import { DraftingView, type DraftingTarget } from '../drafting/DraftingView';

const NAME_KEY = { front: 'joinery.draft.view.front', plan: 'joinery.draft.view.plan', section: 'joinery.draft.view.section' } as const;
const PAD = 0.15;

export function JoineryViewDrafting({ spec, view, views, scale, onDone }: { spec: JoinerySpec; view: JoineryViewName; views: ElementViews; scale: number; onDone: () => void }) {
  const { t } = useTranslation();
  const typeId = spec.id ?? '';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = openJoineryViewDrafts(typeId, view);
    setOpen(true);
    return () => { setOpen(false); close(); };
  }, [typeId, view]);

  const lines = useMemo(() => joineryViewLines(view, views[view].lines, spec), [views, view, spec]);
  const target = useMemo<DraftingTarget>(() => {
    const { min, max } = views[view];
    return {
      axis: 'front',
      fit: { min: { x: min.x - PAD, y: min.y - PAD }, max: { x: max.x + PAD, y: max.y + PAD } },
      underlay: (transform: ViewTransform) => (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" data-joinery-underlay>
          {lines.map((l, i) => {
            const a = drawingToScreen(l.a, transform, 'front'), b = drawingToScreen(l.b, transform, 'front');
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={l.kind === 'hatch' ? '#a1a1aa' : '#52525b'} strokeWidth={l.kind === 'cut' ? 1.5 : 1} strokeDasharray={l.kind === 'hidden' ? '4 3' : undefined} />;
          })}
        </svg>
      ),
    };
  }, [views, view, lines]);
  const pseudo = useMemo<Exclude<ProjectView, { kind: '3d' }>>(
    () => ({ kind: 'drafting', id: joineryDraftViewId(typeId, view), name: `${spec.mark} ${t(NAME_KEY[view])}`, createdAt: 0, scale }),
    [typeId, view, spec.mark, scale, t],
  );

  return (
    <div className="flex h-full w-full flex-col" data-joinery-drafting={`${typeId}:${view}`}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 text-xs dark:border-zinc-800">
        <Button size="sm" variant="ghost" onClick={onDone}><ArrowLeft className="mr-1 size-3.5" />{t('joinery.draft.done')}</Button>
        <span className="font-semibold">{t('joinery.draft.title', { view: t(NAME_KEY[view]), mark: spec.mark, name: spec.name })}</span>
        <span className="truncate text-zinc-500">{t('joinery.draft.hint')}</span>
      </div>
      <div className="min-h-0 flex-1">{open ? <DraftingView view={pseudo} bare target={target} /> : null}</div>
    </div>
  );
}
