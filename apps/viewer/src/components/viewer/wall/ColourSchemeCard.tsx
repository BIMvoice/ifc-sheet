/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section of the viewport card: colour the view by a property (#92). Pick what is painted (the plan's rooms, or the elements of a
 * class), the property, the palette; read the values the view shows with their colours and change any of them; put the legend of
 * those colours on the sheet. The rules are the engine's (`@bimvoice/ifcsheet/colour-scheme`); this only edits the view's scheme.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE_IDS, type ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { addColourLegend, colourLegendOf, patchColourScheme, setColourScheme, setValueColour } from '@/project/colour-scheme-actions';
import { propertyChoices } from '@/project/colour-scheme-choices';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { VIEW_CATEGORIES } from '@/project/view-graphics';
import { propertyReader, schemeResultOf } from '@/project/view-colour-scheme';
import { useViewDrawings } from '@/project/view-drawings';
import { useViewerStore } from '@/store';
import { schemeHeading } from '@/project/scheme-heading';
import { attributeLabeller, useLegendLabels } from '../legend/LegendGraphic';
import { CardSection } from './CardSection';
import { WALL_FIELD, WALL_PILL } from './wall-type';

const field = WALL_FIELD;
const ALL = '*';

/** Views that have a cut to paint: a plan (rooms or elements), a section or an elevation (elements). */
export const canBeColoured = (view: ProjectView | undefined): view is ProjectView => view?.kind === 'plan' || view?.kind === 'section' || view?.kind === 'elevation';

/** A colour picker that commits once the hand has rested on it, so one drag is one undo step, not hundreds. */
export function ColourInput({ value, label, onCommit }: { value: string; label: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const commit = (hex: string): void => {
    if (timer.current) clearTimeout(timer.current);
    if (hex.toLowerCase() !== value.toLowerCase()) onCommit(hex);
  };
  return (
    <input
      type="color" aria-label={label} value={draft} className="h-7 w-9 shrink-0 cursor-pointer rounded border border-sky-300/40 bg-transparent p-0"
      onChange={(e) => {
        setDraft(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        const hex = e.target.value;
        timer.current = setTimeout(() => commit(hex), 350);
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}

export function ColourSchemeCard({ sheet, view }: { sheet: ProjectSheet; view: ProjectView }) {
  const { t } = useTranslation();
  const labels = useLegendLabels();
  const scheme = view.graphics?.colourScheme;
  const drawing = useViewDrawings((s) => s.byView[view.id]?.drawing);
  const meshes = useDrawingRuntime().geometryResult?.meshes;
  const edits = useViewerStore((s) => s.mutationVersion);
  const legends = useProjectStore((s) => s.legends);
  const legend = useMemo(() => colourLegendOf(view.id), [view.id, legends]);
  const onSheet = !!legend && !!sheet.viewports?.some((vp) => vp.viewId === legend.id);
  const result = useMemo(() => {
    void edits;
    return schemeResultOf(view, drawing, meshes);
  }, [view, drawing, meshes, edits]);
  const readable = !scheme || propertyReader(scheme.property) !== null;
  const choices = useMemo(() => {
    void edits;
    if (!scheme) return [];
    const ids = scheme.target === 'rooms'
      ? (meshes ?? []).filter((m) => m.ifcType === 'IfcSpace').map((m) => m.expressId)
      : (drawing?.cutPolygons ?? []).map((p) => p.entityId);
    return propertyChoices(ids);
  }, [scheme?.target, drawing, meshes, edits]);
  const entries = result?.entries ?? [];
  const summary = scheme ? `${t('wall.scheme.summary', { property: schemeHeading(scheme, attributeLabeller(t)) })}, ${t('wall.scheme.valueCount', { count: entries.length })}` : t('wall.scheme.summaryOff');
  const start = (): void => setColourScheme(view.id, view.kind === 'plan' ? { property: 'LongName', target: 'rooms' } : { property: 'ObjectType', target: 'elements' });
  const picked = scheme?.classes ?? [];
  const classesValue = picked.length > 0 ? VIEW_CATEGORIES.find((c) => c.classes.length === picked.length && c.classes.every((k) => picked.includes(k)))?.id ?? ALL : ALL;
  const typed = useRef<HTMLInputElement>(null);
  const editedProperty = (property: string): void => {
    if (scheme && property.trim() && property.trim() !== scheme.property) patchColourScheme(view.id, { property: property.trim() });
  };

  return (
    <CardSection id="scheme" title={t('wall.scheme.title')} summary={summary} defaultOpen={!!scheme}>
      {!scheme ? (
        <button type="button" className={`${WALL_PILL} mt-3`} onClick={start}>{t('wall.scheme.start')}</button>
      ) : (
        <div data-owns-keys>
          {view.kind === 'plan' ? (
            <label className="mt-3 block text-xs text-sky-200">
              {t('wall.scheme.target')}
              <select className={field} value={scheme.target} onChange={(e) => patchColourScheme(view.id, { target: e.target.value as ColourScheme['target'] })}>
                <option value="rooms">{t('wall.scheme.target.rooms')}</option>
                <option value="elements">{t('wall.scheme.target.elements')}</option>
              </select>
            </label>
          ) : null}
          {scheme.target === 'elements' ? (
            <label className="mt-3 block text-xs text-sky-200">
              {t('wall.scheme.classes')}
              <select
                className={field} value={classesValue}
                onChange={(e) => patchColourScheme(view.id, { classes: e.target.value === ALL ? undefined : [...(VIEW_CATEGORIES.find((c) => c.id === e.target.value)?.classes ?? [])] })}
              >
                <option value={ALL}>{t('wall.scheme.classesAll')}</option>
                {VIEW_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey as TranslationKey)}</option>)}
              </select>
            </label>
          ) : null}
          <label className="mt-3 block text-xs text-sky-200">
            {t('wall.scheme.property')}
            <select className={field} value={choices.includes(scheme.property) ? scheme.property : ''} onChange={(e) => e.target.value && editedProperty(e.target.value)}>
              <option value="">{t('wall.scheme.propertyPick')}</option>
              {choices.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-xs text-sky-200">
            {t('wall.scheme.propertyType')}
            <input
              ref={typed} key={scheme.property} className={field} defaultValue={scheme.property}
              onBlur={(e) => editedProperty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') typed.current?.blur(); }}
            />
          </label>
          <label className="mt-3 block text-xs text-sky-200">
            {t('wall.scheme.legendTitle')}
            <input
              key={`${scheme.property}|${scheme.title ?? ''}`} className={field} defaultValue={scheme.title ?? ''} placeholder={schemeHeading({ property: scheme.property }, attributeLabeller(t))}
              onBlur={(e) => { if (e.target.value.trim() !== (scheme.title ?? '')) patchColourScheme(view.id, { title: e.target.value.trim() || undefined }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </label>
          <label className="mt-3 block text-xs text-sky-200">
            {t('wall.scheme.palette')}
            <select className={field} value={scheme.palette ?? PALETTE_IDS[0]} onChange={(e) => patchColourScheme(view.id, { palette: e.target.value === PALETTE_IDS[0] ? undefined : (e.target.value as ColourScheme['palette']) })}>
              {PALETTE_IDS.map((p) => <option key={p} value={p}>{t(`wall.scheme.palette.${p}` as TranslationKey)}</option>)}
            </select>
          </label>
          <p className="m-0 mt-4 text-2xs font-medium uppercase tracking-widest text-sky-200/70">{t('wall.scheme.values')}</p>
          {!readable ? <p className="m-0 mt-2 text-xs text-amber-300">{t('wall.scheme.unreadable')}</p> : null}
          {readable && entries.length === 0 ? <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.scheme.noValues')}</p> : null}
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {entries.map((e) => (
              <li key={e.key} className="flex items-center gap-2 text-sm text-white">
                <ColourInput value={e.colour} label={t('wall.scheme.colourOf', { value: e.label })} onCommit={(hex) => setValueColour(view.id, e.key, hex)} />
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
                {scheme.colours?.[e.key] ? <button type="button" className="text-xs text-sky-200 underline" onClick={() => setValueColour(view.id, e.key, null)}>{t('wall.scheme.reset')}</button> : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={WALL_PILL} disabled={onSheet || entries.length === 0} onClick={() => addColourLegend(sheet.id, view.id, labels)}>
              {onSheet ? t('wall.scheme.legendOnSheet') : t('wall.scheme.addLegend')}
            </button>
            <button type="button" className={WALL_PILL} onClick={() => setColourScheme(view.id, null)}>{t('wall.scheme.remove')}</button>
          </div>
        </div>
      )}
    </CardSection>
  );
}
