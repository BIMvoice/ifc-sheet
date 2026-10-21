/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The phases section of a view's Visibility / Graphics (`project/phases.ts`):
 * whether the view draws by phase, which phases it shows and how each draws
 * (line colour, pen, dashed, cut fill), and, for the whole project, the
 * property its phases are read from besides the IFC Status.
 */

import { useTranslation, type TranslationKey } from '@/i18n';
import { updateProjectView, useProjectStore } from '@/project/project-store';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { noElementSaysAPhase } from '@/project/phase-view';
import { PHASES, PHASE_LABEL_KEYS, PHASE_VIEW_PRESETS, phaseStyle, phasesFromPreset, unmarkedPhase, type PhaseSource } from '@/project/phases';
import { useViewerStore } from '@/store';
import type { CategoryLineWeight, PhaseId, PhaseStyle, ProjectView, ViewGraphics } from '@/project/types';

const WEIGHTS: readonly CategoryLineWeight[] = ['heavy', 'medium', 'light', 'hairline'];
const select = 'h-7 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';
const input = 'h-7 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

export function PhaseGraphics({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  const graphics: ViewGraphics = view.graphics ?? {};
  const phases = graphics.phases;
  const source = useProjectStore((s) => s.phaseSource) ?? {};
  const { geometryResult } = useDrawingRuntime();
  useViewerStore((s) => s.mutationVersion); // an edited Status changes the note below
  const noPhaseInModel = !!phases && noElementSaysAPhase(geometryResult?.meshes, useProjectStore.getState().phaseSource);
  const set = (next: ViewGraphics['phases']) => updateProjectView(view.id, { graphics: { ...graphics, phases: next } });
  const setStyle = (id: PhaseId, patch: Partial<PhaseStyle>) => phases && set({ ...phases, styles: { ...phases.styles, [id]: { ...phases.styles?.[id], ...patch } } });
  const setSource = (next: PhaseSource) => useProjectStore.setState({ phaseSource: next.mapping || next.unmarked ? next : undefined, dirty: true });
  const mapping = source.mapping ?? { set: '', property: '', values: {} };
  const setMapping = (patch: Partial<typeof mapping>) => {
    const next = { ...mapping, ...patch };
    // Kept while half-filled (`resolvePhase` reads it only with a set and a property).
    setSource({ ...source, mapping: next.set || next.property || Object.keys(next.values).length ? next : undefined });
  };
  const name = (id: PhaseId) => t(PHASE_LABEL_KEYS[id] as TranslationKey);
  return (
    <section className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-xs" aria-label={t('phase.title')}>
      <h3 className="font-semibold">{t('phase.title')}</h3>
      <p className="text-zinc-500">{t('phase.hint')}</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" aria-label={t('phase.use')} checked={!!phases} onChange={(e) => set(e.target.checked ? { show: [...PHASES] } : undefined)} />
          {t('phase.use')}
        </label>
        <span className="flex-1" />
        <label className="flex items-center gap-1">
          {t('phase.preset')}
          <select aria-label={t('phase.preset')} className={select} value="" onChange={(e) => e.target.value && set(phasesFromPreset(e.target.value as keyof typeof PHASE_VIEW_PRESETS, phases))}>
            <option value="">{t('phase.preset')}</option>
            {(Object.keys(PHASE_VIEW_PRESETS) as (keyof typeof PHASE_VIEW_PRESETS)[]).map((k) => <option key={k} value={k}>{t(`phase.preset.${k}` as TranslationKey)}</option>)}
          </select>
        </label>
      </div>
      {noPhaseInModel ? <p role="note" className="text-amber-700 dark:text-amber-400">{t('phase.noneInModel', { phase: name(unmarkedPhase(source)) })}</p> : null}
      {phases ? (
        <label className="flex items-center gap-1">
          <input type="checkbox" aria-label={t('phase.demolishAsExisting')} checked={!!phases.demolishAsExisting}
            onChange={(e) => set({ ...phases, demolishAsExisting: e.target.checked || undefined })} />
          {t('phase.demolishAsExisting')}
        </label>
      ) : null}
      {phases ? (
        <table className="w-full">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-1 font-medium">{t('phase.title')}</th>
              <th className="py-1 font-medium">{t('phase.show')}</th>
              <th className="py-1 font-medium">{t('phase.lineColor')}</th>
              <th className="py-1 font-medium">{t('phase.fillColor')}</th>
              <th className="py-1 font-medium">{t('phase.lineWeight')}</th>
              <th className="py-1 font-medium">{t('phase.dashed')}</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((id) => {
              const style = phaseStyle(graphics, id);
              return (
                <tr key={id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-2 font-medium">{name(id)}</td>
                  <td className="py-1">
                    <input type="checkbox" aria-label={`${name(id)} · ${t('phase.show')}`} checked={phases.show.includes(id)}
                      onChange={(e) => set({ ...phases, show: PHASES.filter((p) => (p === id ? e.target.checked : phases.show.includes(p))) })} />
                  </td>
                  <td className="py-1"><input type="color" aria-label={`${name(id)} · ${t('phase.lineColor')}`} value={style.lineColor} onChange={(e) => setStyle(id, { lineColor: e.target.value })} /></td>
                  <td className="py-1"><input type="color" aria-label={`${name(id)} · ${t('phase.fillColor')}`} value={style.fillColor} onChange={(e) => setStyle(id, { fillColor: e.target.value })} /></td>
                  <td className="py-1">
                    <select aria-label={`${name(id)} · ${t('phase.lineWeight')}`} className={select} value={style.lineWeight} onChange={(e) => setStyle(id, { lineWeight: e.target.value as CategoryLineWeight })}>
                      {WEIGHTS.map((w) => <option key={w} value={w}>{t(`viewGraphics.weight.${w}` as TranslationKey)}</option>)}
                    </select>
                  </td>
                  <td className="py-1"><input type="checkbox" aria-label={`${name(id)} · ${t('phase.dashed')}`} checked={style.dashed} onChange={(e) => setStyle(id, { dashed: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <h4 className="pt-1 font-medium">{t('phase.sourceTitle')}</h4>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">{t('phase.unmarked')}
          <select aria-label={t('phase.unmarked')} className={select} value={source.unmarked ?? 'existing'}
            onChange={(e) => setSource({ ...source, unmarked: e.target.value === 'existing' ? undefined : e.target.value as PhaseId })}>
            {PHASES.map((id) => <option key={id} value={id}>{name(id)}</option>)}
          </select>
        </label>
        <input aria-label={t('phase.mapSet')} placeholder={t('phase.mapSet')} className={input} value={mapping.set} onChange={(e) => setMapping({ set: e.target.value })} />
        <input aria-label={t('phase.mapProperty')} placeholder={t('phase.mapProperty')} className={input} value={mapping.property} onChange={(e) => setMapping({ property: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PHASES.map((id) => {
          const value = Object.entries(mapping.values).find(([, phase]) => phase === id)?.[0] ?? '';
          const label = t('phase.mapValue', { phase: name(id) });
          return (
            <input key={id} aria-label={label} placeholder={label} className={input} value={value}
              onChange={(e) => {
                const values = Object.fromEntries(Object.entries(mapping.values).filter(([, phase]) => phase !== id));
                if (e.target.value.trim()) values[e.target.value.trim()] = id;
                setMapping({ values });
              }} />
          );
        })}
      </div>
      <p className="text-zinc-500">{t('phase.mapHint')}</p>
    </section>
  );
}
