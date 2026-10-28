/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hatched zone's pattern, scale and angle: the built-in patterns and the
 * project's imported ones. They are the settings the hatch tool reads, so the
 * next zone filled takes them. With hatches chosen (`selected`) the same fields
 * show and change those hatches instead, each change one undoable edit.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { builtInPatterns } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { editDrafts } from '@/drafting/draft-store';
import { baseDraftSettings, draftSizeScale, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import type { AnnotationShape, DraftEntity } from '@/drafting/types';

type HatchShape = Extract<AnnotationShape, { type: 'hatch' }>;
import { useProjectStore } from '@/project/project-store';
import { DraftNumber } from './DraftNumber';
import { WALL_FIELD } from './wall-type';

const field = WALL_FIELD;

/** The hatches among `entities`. */
export const hatchesOf = (entities: readonly DraftEntity[]): readonly (DraftEntity & { shape: HatchShape })[] =>
  entities.filter((e): e is DraftEntity & { shape: HatchShape } => e.shape.type === 'hatch');

export function HatchSettings({ selected = [] }: { selected?: readonly (DraftEntity & { shape: HatchShape })[] }) {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const names = useMemo(() => [...new Set([...builtInPatterns(), ...parsePat(patternText).patterns].map((p) => p.name))], [patternText]);
  const settings = baseDraftSettings();
  const first = selected[0]?.shape;
  const pattern = first?.pattern ?? settings.hatchPattern;
  // A drawn hatch holds its scale in the drawing's units; the card speaks the settings' (the same number the tool card shows).
  const size = draftSizeScale();
  const scale = first ? first.scale / size : settings.hatchScale;
  const angle = first?.angle ?? settings.hatchAngle;
  // The chosen hatches take the change; with none chosen it is the next zone's setting.
  const change = (patch: Partial<Pick<HatchShape, 'pattern' | 'scale' | 'angle'>>, next: Parameters<typeof patchDraftSettings>[0]): void => {
    if (selected.length === 0) patchDraftSettings(next);
    else editDrafts({ update: new Map(selected.map((e) => [e.id, { ...e.shape, ...patch }])) });
  };
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-sky-200">
      <label className="col-span-2">
        {t('wall.hatch.pattern')}
        <select className={field} value={pattern} onChange={(e) => change({ pattern: e.target.value }, { hatchPattern: e.target.value })}>
          {names.includes(pattern) ? null : <option value={pattern}>{pattern}</option>}
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        {t('wall.hatch.scale')}
        <DraftNumber value={scale} min={0.05} step={0.05} accept={(v) => v > 0} onValid={(v) => change({ scale: v * size }, { hatchScale: v })} />
      </label>
      <label>
        {t('wall.hatch.angle')}
        <DraftNumber value={angle} step={15} onValid={(v) => change({ angle: v }, { hatchAngle: v })} />
      </label>
    </div>
  );
}
