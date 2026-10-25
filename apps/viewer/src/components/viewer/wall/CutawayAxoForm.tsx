/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Add a drawing → Cut-away axonometric" (#97): pick the storey, the height it
 * is cut at (the storey's default plan cut, `defaultPlanCutHeight`) and the
 * corner it is seen from; the view is a 3D view that prints as vector lines,
 * cut at that storey (`@bimvoice/ifcsheet/axonometric`).
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { AXONOMETRIC_PRESETS, DEFAULT_AXONOMETRIC_PRESET } from '@/project/axonometric';
import { updateProjectView, useProjectStore } from '@/project/project-store';
import { sameElevation } from '@/project/view-defaults';
import { defaultPlanCutHeight } from '@/project/view-defaults';
import type { AxonometricPreset, NewProjectView, ProjectLevel, ThreeDProjectView } from '@/project/types';
import { WALL_FIELD } from './wall-type';
import { SectionBoxFields } from './SectionBoxFields';

/** The new cut-away view's settings, as `addProjectView` takes them. */
export function cutawayAxoView(name: string, level: ProjectLevel, cutHeight: number, preset: AxonometricPreset): NewProjectView {
  return { kind: '3d' as const, name, viewpoint: null, projection: 'axonometric' as const, preset, scale: 100, cutaway: { storey: { level, cutHeight } } };
}

/** `onAdd` makes the view (and hangs it), in one undo step with the rest of the add. */
export function CutawayAxoForm({ onAdd }: { onAdd: (view: NewProjectView) => void }) {
  const { t } = useTranslation();
  const levels = useProjectStore((s) => s.levels);
  const [index, setIndex] = useState(Math.max(0, levels.length - 1));
  const level = levels[Math.min(index, levels.length - 1)];
  const [height, setHeight] = useState<string>(() => (level ? String(defaultPlanCutHeight(level, levels)) : '1.2'));
  const [preset, setPreset] = useState<AxonometricPreset>(DEFAULT_AXONOMETRIC_PRESET);
  const cutHeight = Number(height.replace(',', '.'));
  const valid = level !== undefined && height.trim() !== '' && Number.isFinite(cutHeight);
  const pickLevel = (i: number): void => {
    setIndex(i);
    setHeight(String(defaultPlanCutHeight(levels[i], levels)));
  };
  return (
    <form
      className="grid max-w-[420px] gap-3 text-sm text-sky-100"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onAdd(cutawayAxoView(t('cutawayAxo.viewName', { storey: level.name }), level, cutHeight, preset));
      }}
    >
      <label className="block">
        {t('cutawayAxo.storey')}
        <select className={WALL_FIELD} value={index} onChange={(e) => pickLevel(Number(e.target.value))}>
          {levels.map((l, i) => <option key={l.name + l.elevation} value={i}>{l.name}</option>)}
        </select>
      </label>
      <label className="block">
        {t('cutawayAxo.cutHeight')}
        <input className={WALL_FIELD} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
      </label>
      <label className="block">
        {t('wall.vp.threeD.corner')}
        <select className={WALL_FIELD} value={preset} onChange={(e) => setPreset(e.target.value as AxonometricPreset)}>
          {AXONOMETRIC_PRESETS.map((p) => <option key={p} value={p}>{t(`wall.vp.threeD.corner.${p}`)}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!valid} className="justify-self-start rounded-full border border-sky-300/40 px-4 py-2 text-sky-50 hover:border-sky-300 hover:bg-sky-500/10 disabled:opacity-40">{t('cutawayAxo.create')}</button>
    </form>
  );
}

/** A cut-away's storey cut in its drawing's card: the storey and the cut height, changed in place. */
export function CutawayCard({ view }: { view: ThreeDProjectView }) {
  const { t } = useTranslation();
  const levels = useProjectStore((s) => s.levels);
  const meshes = useDrawingRuntime().geometryResult?.meshes ?? null;
  const storey = view.cutaway?.storey;
  const [height, setHeight] = useState<string | null>(null);
  if (!view.cutaway) return null;
  const box = <SectionBoxFields view={view} meshes={meshes} />;
  if (!storey) return box;
  const index = levels.findIndex((l) => sameElevation(l.elevation, storey.level.elevation));
  const set = (patch: { level?: ProjectLevel; cutHeight?: number }): void => {
    updateProjectView(view.id, { cutaway: { ...view.cutaway, storey: { ...storey, ...patch } } });
  };
  return (
    <>
    <fieldset className="space-y-2">
      <legend>{t('cutawayAxo.card')}</legend>
      <label className="block">
        {t('cutawayAxo.storey')}
        <select className={WALL_FIELD} value={index} onChange={(e) => { const level = levels[Number(e.target.value)]; if (level) set({ level, cutHeight: defaultPlanCutHeight(level, levels) }); }}>
          {index < 0 ? <option value={-1}>{storey.level.name}</option> : null}
          {levels.map((l, i) => <option key={l.name + l.elevation} value={i}>{l.name}</option>)}
        </select>
      </label>
      <label className="block">
        {t('cutawayAxo.cutHeight')}
        <input
          className={WALL_FIELD}
          inputMode="decimal"
          value={height ?? String(storey.cutHeight)}
          onChange={(e) => setHeight(e.target.value)}
          onBlur={() => {
            const n = Number((height ?? '').replace(',', '.'));
            if (height !== null && height.trim() !== '' && Number.isFinite(n)) set({ cutHeight: n });
            setHeight(null);
          }}
        />
      </label>
      <p className="m-0 text-xs text-sky-300">{t('cutawayAxo.scaleNote', { scale: view.scale ?? 100 })}</p>
    </fieldset>
    {box}
    </>
  );
}
