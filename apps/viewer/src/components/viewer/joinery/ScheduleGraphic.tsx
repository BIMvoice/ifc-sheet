/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A joinery schedule's primitives as SVG, in paper millimetres — in its own
 * tab and on sheets alike — tagged for the DXF exporter (layer SCHEDULE for
 * the table, SCHEDULE-SYMBOLS for the drawings). `useScheduleLayout` reads
 * the schedule live: it follows model edits and the catalogue.
 */

import { memo, useEffect, useMemo } from 'react';
import type { PanelOperation } from '@ifc-lite/create';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule, ProjectSheet, SheetViewport } from '@/project/types';
import { isJoinerySchedule, layoutJoineryOnSheet, layoutTableOnSheet, syncSchedulePages } from '@/project/schedule-fit';
import type { ScheduleData } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { layoutSchedule, type ScheduleLabels, type ScheduleLayout, type SchedulePrim } from '@/joinery/schedule-layout';
import { takeoffRows, type TakeoffRow } from '@/joinery/material-takeoff';
import { collectTakeoffElements } from '@/joinery/material-takeoff-models';
import { layoutMaterialTakeoff, type TakeoffLabels } from '@/joinery/material-takeoff-layout';
import { layoutUrban } from '@/urban/urban-layout';
import { layoutRoomSchedule } from '@/joinery/room-schedule-layout';
import { registerFitOn, registerPaper, sharedRegisterRows, type RegisterRow } from '@/project/drawing-register';
import { layoutRegisterPage, type RegisterLabels } from '@/joinery/register-layout';
import { roomFinishes, type RoomFinishes } from '@/joinery/room-finishes';
import { collectRoomInputs } from '@/joinery/room-finishes-models';
import { layoutRoomFinishes, type RoomFinishLabels } from '@/joinery/room-finishes-layout';
import type { TypeQuantities } from '@/joinery/type-quantities';
import { typeQuantitiesOf } from '@/joinery/type-quantities-models';
import type { ScheduleClassification } from '@bimvoice/ifcsheet';
import { layoutTypeQuantities, type TypeQuantityLabels } from '@/joinery/type-quantities-layout';
import type { MeasuredWords } from '@/joinery/measured-marks';
import { penTags } from '../sheets/dxf-tags';
import { useUrbanIndicators, useUrbanLabels } from '../urban/useUrban';
import { useElementViews, type ViewRequest } from './useElementViews';
import type { ElementViews } from '@/joinery/element-views';
import { useTableSheetLayouts } from './useTableSheetLayouts';
import { fontFamily, tablesFace } from '@/drafting/styles';
import { useSheetLocale } from '@/project/units-and-numbers';
import { useRoomScheduleData, useRoomScheduleLabels, useRoomSummary } from './room-schedule-hooks';

export function useScheduleLabels(title: string): ScheduleLabels {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => ({
    locale, title,
    mark: t('schedule.row.mark'), name: t('schedule.row.name'), size: t('schedule.row.size'), operation: t('schedule.row.operation'),
    sill: t('schedule.row.sill'), total: t('schedule.row.total'), uValue: t('schedule.row.uValue'), fire: t('schedule.row.fire'),
    op: (op: PanelOperation) => t(`joinery.op.${op}` as TranslationKey),
  }), [t, locale, title]);
}

/** The words that explain a figure measured from geometry (#74), shared by the takeoff and the quantities by type. */
function measuredWords(t: ReturnType<typeof useTranslation>['t']): MeasuredWords {
  return {
    note: t('measuredQty.note'), unmeasured: (count: number) => t('measuredQty.unmeasured', { count }),
    column: t('measuredQty.column'), volume: t('measuredQty.volume'), area: t('measuredQty.area'),
  };
}

export function useTakeoffLabels(title: string): TakeoffLabels {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => ({
    title, material: t('takeoff.material'), elements: t('takeoff.elements'), volume: t('takeoff.volume'),
    area: t('takeoff.area'), usedIn: t('takeoff.usedIn'), total: t('takeoff.total'),
    locale, measured: measuredWords(t),
  }), [t, locale, title]);
}

/** The material takeoff's rows, read from the loaded models again only when they change (materials are parsed on demand). */
export function useTakeoffRows(): TakeoffRow[] {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // mutationVersion / models: what `collectTakeoffElements` reads.
  return useMemo(() => takeoffRows(collectTakeoffElements()), [mutationVersion, models]);
}

export function useRegisterLabels(title: string): RegisterLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    title, number: t('issue.list.sheet'), sheetTitle: t('issue.list.sheetTitle'), scale: t('issue.list.scale'), revision: t('issue.list.revision'), date: t('issue.list.date'),
  }), [t, title]);
}

const NO_ROWS: RegisterRow[] = [];

/**
 * The register's rows, read from the sheets, the title block and the issues as
 * they stand: nothing about them is stored. Through the one shared cache, so a
 * sheet edit builds that sheet's row once however many sheets are on screen;
 * `false` (a sheet without the register) reads nothing.
 */
export function useRegisterRows(wanted = true): RegisterRow[] {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const titleBlock = useProjectStore((s) => s.titleBlock);
  const issues = useProjectStore((s) => s.issues);
  const schedules = useProjectStore((s) => s.schedules);
  const revisions = useProjectStore((s) => s.revisions);
  const drafts = useProjectStore((s) => s.drafts);
  const asIndicated = t('sheets.asIndicated');
  return useMemo(
    () => (wanted ? sharedRegisterRows({ sheets, titleBlock, issues, asIndicated, schedules, revisions, drafts }) : NO_ROWS),
    [wanted, sheets, titleBlock, issues, schedules, asIndicated, revisions, drafts],
  );
}

export function useRoomFinishLabels(title: string): RoomFinishLabels {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => ({
    locale, title, number: t('finishes.number'), room: t('finishes.room'), level: t('finishes.level'),
    floor: t('finishes.floor'), wall: t('finishes.wall'), ceiling: t('finishes.ceiling'), area: t('finishes.area'),
    sharedNote: t('finishes.sharedNote'),
  }), [t, locale, title]);
}

/** The rooms with their finishes, read from the loaded models again only when they change. */
export function useRoomFinishes(): RoomFinishes[] {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // mutationVersion / models: what `collectRoomInputs` reads.
  return useMemo(() => roomFinishes(collectRoomInputs()), [mutationVersion, models]);
}

export function useTypeQuantityLabels(title: string): TypeQuantityLabels {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => ({
    locale, title, type: t('typeQty.type'), class: t('typeQty.class'), level: t('typeQty.level'), count: t('typeQty.count'),
    length: t('typeQty.length'), area: t('typeQty.area'), volume: t('typeQty.volume'), noQto: t('typeQty.noQto'),
    total: t('typeQty.total'), noType: t('typeQty.noType'), noLevel: t('typeQty.noLevel'),
    classification: t('typeQty.classification'), classificationTitle: t('typeQty.classificationTitle'), unclassified: t('typeQty.unclassified'),
    measured: measuredWords(t),
  }), [t, locale, title]);
}

/** The quantities by type, read from the loaded models again only when they change. */
export function useTypeQuantities(choice?: ScheduleClassification): TypeQuantities {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const mappings = useProjectStore((s) => s.classificationMappings);
  // mutationVersion / models / mappings: what `typeQuantitiesOf` reads.
  return useMemo(() => typeQuantitiesOf(choice), [mutationVersion, models, mappings, choice?.mapping, choice?.group, choice !== undefined]);
}

/** The schedule's data and layout, recomputed when the models or the catalogue change; the cards get their views once cut. */
export function useScheduleLayout(schedule: ProjectSchedule | undefined): { data: ScheduleData; layout: ScheduleLayout; views: ReadonlyMap<string, ElementViews> | undefined } | null {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const schedules = useProjectStore((s) => s.schedules);
  const labels = useScheduleLabels(schedule?.name ?? '');
  const data = useMemo(() => {
    if (!schedule || schedule.kind === 'materials' || schedule.kind === 'finishes' || schedule.kind === 'types' || schedule.kind === 'register' || schedule.kind === 'urban' || schedule.kind === 'rooms' || schedule.kind === 'boq' || schedule.kind === 'list') return null;
    return scheduleDataOf(schedule, undefined, schedules ?? []);
    // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores; schedules: the text rows.
  }, [schedule?.kind, schedule?.sub, schedules, mutationVersion, models, catalogue, mapping]);
  const scale = schedule?.scale ?? 50;
  const requests = useMemo<ViewRequest[]>(() => (data ? [{ id: 'self', data, scale }] : []), [data, scale]);
  const views = useElementViews(requests).get('self');
  return useMemo(() => (data ? { data, layout: layoutSchedule(data, labels, { scale, views }), views } : null), [data, labels, scale, views]);
}

/** The layouts of the schedules placed on `sheet`, by schedule id. */
export function useSheetSchedules(sheet: ProjectSheet): Map<string, ScheduleLayout> {
  const schedules = useProjectStore((s) => s.schedules);
  const sheets = useProjectStore((s) => s.sheets);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  // The codes the quantities by type show (#89).
  const classificationMappings = useProjectStore((s) => s.classificationMappings);
  const labels = useScheduleLabels('');
  // The word a page after the first says in its title, in the user's language.
  const continued = useTranslation().t('schedule.continued');
  const takeoffLabels = useTakeoffLabels('');
  const registerLabels = useRegisterLabels('');
  const placesRegister = (sheet.viewports ?? []).some((vp) => schedules?.some((s) => s.id === vp.viewId && s.kind === 'register'));
  const registerRows = useRegisterRows(placesRegister);
  // Every page is fitted to the register's own sheet's paper, the one `syncRegisterPages` counted pages on: not this sheet's.
  const registerId = placesRegister ? schedules?.find((s) => s.kind === 'register')?.id : undefined;
  const pagePaper = useProjectStore((s) => (registerId ? registerPaper(s.sheets, registerId) : null));
  const finishLabels = useRoomFinishLabels('');
  const placesFinishes = (sheet.viewports ?? []).some((vp) => schedules?.some((s) => s.id === vp.viewId && s.kind === 'finishes'));
  const typeLabels = useTypeQuantityLabels('');
  const places = (kind: ProjectSchedule['kind']) => (sheet.viewports ?? []).some((vp) => schedules?.some((s) => s.id === vp.viewId && s.kind === kind));
  const placesTypes = places('types');
  const placesTakeoff = places('materials');
  // The indicators measure footprints: only when the sheet shows them.
  const urban = useUrbanIndicators(places('urban'));
  const urbanLabels = useUrbanLabels('', urban?.areas ?? null, urban?.site);
  // The room schedule reads the rooms: only when the sheet shows it.
  const roomData = useRoomScheduleData(places('rooms'));
  const roomSummary = useRoomSummary(places('rooms'));
  const roomLabels = useRoomScheduleLabels('', roomData, roomSummary);
  // The joinery schedules on this sheet: their data once, for the layout and for the views cut from the models. Keyed on WHICH
  // schedules the sheet holds, not on its viewports: a viewport written (a continuation page added or moved) must not drop the views,
  // or the page count flips between "with" and "without" them and the continuation sheets are removed and made again without end.
  const heldKey = (sheet.viewports ?? []).map((vp) => vp.viewId).join('|');
  const joinery = useMemo(() => {
    const out: ViewRequest[] = [];
    for (const vp of sheet.viewports ?? []) {
      const schedule = schedules?.find((s) => s.id === vp.viewId);
      if (!schedule || (schedule.kind !== 'door' && schedule.kind !== 'window' && schedule.kind !== 'all') || out.some((r) => r.id === schedule.id)) continue;
      out.push({ id: schedule.id, data: scheduleDataOf(schedule), scale: schedule.scale ?? 50 });
    }
    return out;
    // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores.
  }, [heldKey, schedules, mutationVersion, models, catalogue, mapping]);
  const joineryViews = useElementViews(joinery);
  const { layouts, loaded } = useMemo(() => {
    const out = new Map<string, ScheduleLayout>();
    // The schedules whose data is there: before the models load a table is empty, and that is not a reason to drop its sheets.
    const loaded = new Set<string>();
    // The takeoff parses materials on demand: read once per change, and only when a sheet shows one.
    const rows = placesTakeoff ? takeoffRows(collectTakeoffElements()) : [];
    const finishRooms = placesFinishes ? roomFinishes(collectRoomInputs()) : [];
    // One read per distinct classification choice: two quantities-by-type schedules on a sheet may choose differently.
    const byTypeCache = new Map<string, TypeQuantities>();
    const byTypeOf = (choice: ScheduleClassification | undefined): TypeQuantities => {
      const key = choice ? `${choice.mapping ?? ''}|${choice.group === true}` : '';
      let read = byTypeCache.get(key);
      if (!read) byTypeCache.set(key, (read = typeQuantitiesOf(choice)));
      return read;
    };
    const layoutJoinery = (schedule: ProjectSchedule, vp: SheetViewport): ScheduleLayout => layoutJoineryOnSheet({
      data: joinery.find((r) => r.id === schedule.id)?.data ?? scheduleDataOf(schedule), labels: { ...labels, title: schedule.name }, scale: schedule.scale ?? 50,
      views: joineryViews.get(schedule.id), continued, sheets, sheet, vp,
    });
    for (const vp of sheet.viewports ?? []) {
      const schedule = schedules?.find((s) => s.id === vp.viewId);
      // The bill of quantities and the schedules from the Lists engine lay themselves out (`useTableSheetLayouts`).
      if (!schedule || out.has(schedule.id) || schedule.kind === 'boq' || schedule.kind === 'list') continue;
      const place = { continued, sheets, sheet, vp };
      // A schedule wraps to its viewport's box (the first sheet's, for every page) and shows its own page: a joinery list by bands, a column table by rows.
      const table = (has: boolean, layout: (paging: { maxHeight: number; page: number }) => ScheduleLayout): ScheduleLayout => {
        if (has) loaded.add(schedule.id);
        return layoutTableOnSheet(place, layout);
      };
      if (schedule.kind === 'urban') {
        if (urban) out.set(schedule.id, table(true, (paging) => layoutUrban(urban.result, { ...urbanLabels, title: schedule.name }, paging)));
        continue;
      }
      if (schedule.kind === 'rooms') {
        if (roomData) out.set(schedule.id, table(true, (paging) => layoutRoomSchedule(roomData.schedule, { ...roomLabels, title: schedule.name }, paging)));
        continue;
      }
      out.set(schedule.id, schedule.kind === 'register'
        // Shrunk to the register's own sheet's drawing area, then split into pages: this viewport shows its own (`syncRegisterPages`).
        ? layoutRegisterPage(registerRows, { ...registerLabels, title: schedule.name }, registerFitOn(registerRows.length, pagePaper ?? registerPaper([sheet], schedule.id)), vp.page ?? 0)
        : schedule.kind === 'materials'
        ? table(rows.length > 0, (paging) => layoutMaterialTakeoff(rows, { ...takeoffLabels, title: schedule.name }, paging))
        : schedule.kind === 'finishes'
          ? table(finishRooms.length > 0, (paging) => layoutRoomFinishes(finishRooms, { ...finishLabels, title: schedule.name }, paging))
        : schedule.kind === 'types'
          ? ((byType) => table(byType.rows.length > 0, (paging) => layoutTypeQuantities(byType, { ...typeLabels, title: schedule.name }, paging)))(placesTypes ? byTypeOf(schedule.classification) : { levels: [], rows: [], classTotals: [] })
          : layoutJoinery(schedule, vp));
      if (schedule.kind !== 'register' && isJoinerySchedule(schedule) && joinery.find((r) => r.id === schedule.id)?.data.entries.length) loaded.add(schedule.id);
    }
    return { layouts: out, loaded };
    // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` and the takeoff read from the stores.
  }, [sheet, sheets, schedules, labels, continued, takeoffLabels, finishLabels, typeLabels, registerLabels, registerRows, pagePaper, placesTakeoff, placesFinishes, placesTypes, classificationMappings, urban, urbanLabels, roomData, roomLabels, joinery, joineryViews, mutationVersion, models, catalogue, mapping]);
  // A schedule that runs over several pages has a sheet for each: the sheets follow the layout, from the schedule's first one.
  useEffect(() => {
    for (const vp of sheet.viewports ?? []) {
      const layout = layouts.get(vp.viewId);
      if (layout?.fit && (vp.page ?? 0) === 0 && loaded.has(vp.viewId)) syncSchedulePages(vp.viewId, layout.pages ?? 1);
    }
  }, [layouts, loaded, sheet.viewports]);
  const tables = useTableSheetLayouts(sheet);
  return useMemo(() => (tables.size > 0 ? new Map([...layouts, ...tables]) : layouts), [layouts, tables]);
}

/** Picks a line of a type's view to hide (#449): the catalogue type's id and the line's id. */
export type PickLine = (type: string, line: string) => void;

function Prim({ p, face, onPick }: { p: SchedulePrim; face: ReturnType<typeof tablesFace>; onPick?: PickLine }) {
  if (p.kind === 'line') {
    return <line {...penTags('SCHEDULE', p.w)} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#000" strokeWidth={p.w} />;
  }
  if (p.kind === 'path') {
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join('') + (p.closed ? 'Z' : '');
    const path = <path {...penTags('SCHEDULE-SYMBOLS', p.w, !!p.dashed)} d={d} fill="none" stroke="#000" strokeWidth={p.w} strokeDasharray={p.dashed ? '1.2 0.8' : undefined} strokeLinejoin="round" />;
    const pick = p.pick;
    if (!onPick || !pick) return path;
    // A wide invisible stroke to hit; left out of exports (the SVG and DXF read the drawn paths).
    return (
      <g>
        {path}
        <path data-export-ignore-dxf="true" data-pick-line={pick.line} d={d} fill="none" stroke="transparent" strokeWidth={Math.max(1.2, p.w * 4)} style={{ cursor: 'pointer', pointerEvents: 'stroke' }} onClick={() => onPick(pick.type, pick.line)} />
      </g>
    );
  }
  return (
    <text
      {...penTags('SCHEDULE', 0.18)} data-dxf-font={face.styled ? face.font : undefined} x={p.x} y={p.y} fontSize={p.size} fontFamily={fontFamily(face.font)}
      fontWeight={p.bold ? 700 : 400} fontStyle={face.italic ? 'italic' : undefined} fill="#000"
      textAnchor={p.anchor} transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}
    >
      {p.text}
    </text>
  );
}

/** The schedule at (x, y) on the paper (its top-left corner). */
export const ScheduleGraphic = memo(function ScheduleGraphic({ layout, x = 0, y = 0, onPick }: { layout: ScheduleLayout; x?: number; y?: number; onPick?: PickLine }) {
  // The project's "Tables" text style (#500): one face for every schedule, report and register.
  const textStyles = useProjectStore((s) => s.textStyles);
  const face = useMemo(() => tablesFace(textStyles), [textStyles]);
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined}>
      {layout.prims.map((p, i) => <Prim key={i} p={p} face={face} onPick={onPick} />)}
    </g>
  );
});
