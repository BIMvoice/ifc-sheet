/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A joinery schedule's primitives as SVG, in paper millimetres — in its own
 * tab and on sheets alike — tagged for the DXF exporter (layer SCHEDULE for
 * the table, SCHEDULE-SYMBOLS for the drawings). `useScheduleLayout` reads
 * the schedule live: it follows model edits and the catalogue.
 */

import { memo, useMemo } from 'react';
import type { PanelOperation } from '@ifc-lite/create';
import { formatLocaleFixed, useTranslation, type TranslationKey } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule, ProjectSheet } from '@/project/types';
import { scheduleData, type ScheduleData } from '@/joinery/schedule-data';
import { layoutSchedule, type ScheduleLabels, type ScheduleLayout, type SchedulePrim } from '@/joinery/schedule-layout';
import { takeoffRows, type TakeoffRow } from '@/joinery/material-takeoff';
import { collectTakeoffElements } from '@/joinery/material-takeoff-models';
import { layoutMaterialTakeoff, type TakeoffLabels } from '@/joinery/material-takeoff-layout';
import { typeQuantities, type TypeQuantities } from '@/joinery/type-quantities';
import { collectTypeElements } from '@/joinery/type-quantities-models';
import { layoutTypeQuantities, type TypeQuantityLabels } from '@/joinery/type-quantities-layout';
import { roomFinishes, type RoomFinishes } from '@/joinery/room-finishes';
import { collectRoomInputs } from '@/joinery/room-finishes-models';
import { layoutRoomFinishes, type RoomFinishLabels } from '@/joinery/room-finishes-layout';
import { layoutUrban } from '@/urban/urban-layout';
import { drawingRegisterRows, type RegisterRow } from '@/project/drawing-register';
import { layoutRegister, type RegisterLabels } from '@/joinery/register-layout';
import { penTags } from '../sheets/dxf-tags';
import { useUrbanIndicators, useUrbanLabels } from '../urban/useUrban';

const FONT = 'ui-sans-serif, system-ui, sans-serif';

export function useScheduleLabels(title: string): ScheduleLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    title,
    mark: t('schedule.row.mark'), name: t('schedule.row.name'), size: t('schedule.row.size'), operation: t('schedule.row.operation'),
    sill: t('schedule.row.sill'), total: t('schedule.row.total'), uValue: t('schedule.row.uValue'), fire: t('schedule.row.fire'),
    op: (op: PanelOperation) => t(`joinery.op.${op}` as TranslationKey),
  }), [t, title]);
}

export function useTakeoffLabels(title: string): TakeoffLabels {
  const { t, locale } = useTranslation();
  return useMemo(() => ({
    title, material: t('takeoff.material'), elements: t('takeoff.elements'), volume: t('takeoff.volume'),
    area: t('takeoff.area'), usedIn: t('takeoff.usedIn'), total: t('takeoff.total'),
    // English keeps the plain `toFixed` text it always printed; other locales write their own separators.
    number: locale === 'en' ? undefined : (value, digits) => formatLocaleFixed(locale, value, digits),
  }), [t, locale, title]);
}

/** The material takeoff's rows, read from the loaded models again only when they change (materials are parsed on demand). */
export function useTakeoffRows(): TakeoffRow[] {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // mutationVersion / models: what `collectTakeoffElements` reads.
  return useMemo(() => takeoffRows(collectTakeoffElements()), [mutationVersion, models]);
}

export function useTypeQuantityLabels(title: string): TypeQuantityLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    title, type: t('typeQty.type'), class: t('typeQty.class'), level: t('typeQty.level'), count: t('typeQty.count'),
    length: t('typeQty.length'), area: t('typeQty.area'), volume: t('typeQty.volume'), noQto: t('typeQty.noQto'),
    total: t('typeQty.total'), noType: t('typeQty.noType'), noLevel: t('typeQty.noLevel'),
  }), [t, title]);
}

/** The quantities by type, read from the loaded models again only when they change. */
export function useTypeQuantities(): TypeQuantities {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // mutationVersion / models: what `collectTypeElements` reads.
  return useMemo(() => typeQuantities(collectTypeElements()), [mutationVersion, models]);
}

export function useRoomFinishLabels(title: string): RoomFinishLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    title, number: t('finishes.number'), room: t('finishes.room'), level: t('finishes.level'),
    floor: t('finishes.floor'), wall: t('finishes.wall'), ceiling: t('finishes.ceiling'), area: t('finishes.area'),
  }), [t, title]);
}

/** The rooms with their finishes, read from the loaded models again only when they change. */
export function useRoomFinishes(): RoomFinishes[] {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // mutationVersion / models: what `collectRoomInputs` reads.
  return useMemo(() => roomFinishes(collectRoomInputs()), [mutationVersion, models]);
}

export function useRegisterLabels(title: string): RegisterLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    title, number: t('issue.list.sheet'), sheetTitle: t('issue.list.sheetTitle'), scale: t('issue.list.scale'), revision: t('issue.list.revision'), date: t('issue.list.date'),
  }), [t, title]);
}

/** The register's rows, read from the sheets, the title block and the issues as they stand: nothing about them is stored. */
export function useRegisterRows(): RegisterRow[] {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const titleBlock = useProjectStore((s) => s.titleBlock);
  const issues = useProjectStore((s) => s.issues);
  const schedules = useProjectStore((s) => s.schedules);
  const asIndicated = t('sheets.asIndicated');
  return useMemo(
    () => drawingRegisterRows({ sheets, titleBlock, issues, asIndicated, schedules }),
    [sheets, titleBlock, issues, schedules, asIndicated],
  );
}

/** The schedule's data and layout, recomputed when the models or the catalogue change. */
export function useScheduleLayout(schedule: ProjectSchedule | undefined): { data: ScheduleData; layout: ScheduleLayout } | null {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const labels = useScheduleLabels(schedule?.name ?? '');
  return useMemo(() => {
    if (!schedule || schedule.kind === 'materials' || schedule.kind === 'types' || schedule.kind === 'finishes' || schedule.kind === 'urban' || schedule.kind === 'register') return null;
    const data = scheduleData(schedule.kind);
    return { data, layout: layoutSchedule(data, labels, { scale: schedule.scale ?? 50 }) };
    // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores.
  }, [schedule, labels, mutationVersion, models, catalogue, mapping]);
}

/** The layouts of the schedules placed on `sheet`, by schedule id. */
export function useSheetSchedules(sheet: ProjectSheet): Map<string, ScheduleLayout> {
  const schedules = useProjectStore((s) => s.schedules);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const labels = useScheduleLabels('');
  const takeoffLabels = useTakeoffLabels('');
  const typeLabels = useTypeQuantityLabels('');
  const finishLabels = useRoomFinishLabels('');
  const places = (kind: ProjectSchedule['kind']) => (sheet.viewports ?? []).some((vp) => schedules?.some((s) => s.id === vp.viewId && s.kind === kind));
  const placesTakeoff = places('materials');
  const placesTypes = places('types');
  const placesFinishes = places('finishes');
  // The indicators measure footprints: only when the sheet shows them.
  const urban = useUrbanIndicators(places('urban'));
  const urbanLabels = useUrbanLabels('', urban?.areas ?? null);
  const registerLabels = useRegisterLabels('');
  const registerRows = useRegisterRows();
  return useMemo(() => {
    const out = new Map<string, ScheduleLayout>();
    // The takeoff parses materials on demand: read once per change, and only when a sheet shows one.
    const rows = placesTakeoff ? takeoffRows(collectTakeoffElements()) : [];
    const byType = placesTypes ? typeQuantities(collectTypeElements()) : null;
    const finishRooms = placesFinishes ? roomFinishes(collectRoomInputs()) : [];
    for (const vp of sheet.viewports ?? []) {
      const schedule = schedules?.find((s) => s.id === vp.viewId);
      if (!schedule || out.has(schedule.id)) continue;
      if (schedule.kind === 'urban') {
        if (urban) out.set(schedule.id, layoutUrban(urban.result, { ...urbanLabels, title: schedule.name }));
        continue;
      }
      out.set(schedule.id, schedule.kind === 'register'
        ? layoutRegister(registerRows, { ...registerLabels, title: schedule.name })
        : schedule.kind === 'materials'
        ? layoutMaterialTakeoff(rows, { ...takeoffLabels, title: schedule.name })
        : schedule.kind === 'types'
          ? layoutTypeQuantities(byType ?? { levels: [], rows: [] }, { ...typeLabels, title: schedule.name })
          : schedule.kind === 'finishes'
            ? layoutRoomFinishes(finishRooms, { ...finishLabels, title: schedule.name })
            : layoutSchedule(scheduleData(schedule.kind), { ...labels, title: schedule.name }, { scale: schedule.scale ?? 50 }));
    }
    return out;
    // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` and the takeoff read from the stores.
  }, [sheet.viewports, schedules, labels, takeoffLabels, typeLabels, finishLabels, registerLabels, registerRows, placesTakeoff, placesTypes, placesFinishes, urban, urbanLabels, mutationVersion, models, catalogue, mapping]);
}

function Prim({ p }: { p: SchedulePrim }) {
  if (p.kind === 'line') {
    return <line {...penTags('SCHEDULE', p.w)} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#000" strokeWidth={p.w} />;
  }
  if (p.kind === 'path') {
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join('') + (p.closed ? 'Z' : '');
    return <path {...penTags('SCHEDULE-SYMBOLS', p.w, !!p.dashed)} d={d} fill="none" stroke="#000" strokeWidth={p.w} strokeDasharray={p.dashed ? '1.2 0.8' : undefined} strokeLinejoin="round" />;
  }
  return (
    <text
      {...penTags('SCHEDULE', 0.18)} x={p.x} y={p.y} fontSize={p.size} fontFamily={FONT} fontWeight={p.bold ? 700 : 400} fill="#000"
      textAnchor={p.anchor} transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}
    >
      {p.text}
    </text>
  );
}

/** The schedule at (x, y) on the paper (its top-left corner). */
export const ScheduleGraphic = memo(function ScheduleGraphic({ layout, x = 0, y = 0 }: { layout: ScheduleLayout; x?: number; y?: number }) {
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined}>
      {layout.prims.map((p, i) => <Prim key={i} p={p} />)}
    </g>
  );
});
