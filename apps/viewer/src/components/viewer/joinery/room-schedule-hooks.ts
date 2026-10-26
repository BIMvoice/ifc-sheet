/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule, live (#42): its rooms are read from the loaded
 * models again when they change (`collectRoomRecords`, the read Au is also
 * made from), and its labels carry the notes that say where the areas come
 * from and, once the storeys' footprints are measured, the area summary (Su, Sc,
 * Sd; read from the urban indicators, not computed again). Used by the schedule's own tab and by the sheets it is placed on.
 */

import { useMemo } from 'react';
import { sheetLevel, type SheetLocale } from '@bimvoice/ifcsheet/names';
import { roomSchedule, type RoomSchedule } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { useSheetLocale } from '@/project/units-and-numbers';
import { collectRoomRecords } from '@/urban/urban-models';
import { areaSummary, type AreaSummary } from '@/urban/area-summary';
import type { RoomSummaryWords } from '@/joinery/room-summary-layout';
import { useUrbanIndicators } from '../urban/useUrban';
import type { RoomScheduleLabels } from '@/joinery/room-schedule-layout';

export interface RoomScheduleData {
  schedule: RoomSchedule;
  leftOut: { external: number; gfa: number; parents: number };
}

/** The schedule of the loaded models' rooms, by project level; null while no model has a room. `enabled` false reads nothing. */
export function useRoomScheduleData(enabled = true): RoomScheduleData | null {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const levels = useProjectStore((s) => s.levels);
  return useMemo(() => {
    if (!enabled) return null;
    const { rooms, leftOut } = collectRoomRecords(levels);
    return rooms.length ? { schedule: roomSchedule(levels, rooms), leftOut } : null;
    // mutationVersion / models / levels: what `collectRoomRecords` reads.
  }, [enabled, mutationVersion, models, levels]);
}

/** The area summary of the urban indicators; null until the footprints are measured. `enabled` false measures nothing. */
export function useRoomSummary(enabled = true): AreaSummary | null {
  const urban = useUrbanIndicators(enabled);
  return useMemo(() => (urban ? areaSummary(urban.result) : null), [urban]);
}

type T = ReturnType<typeof useTranslation>['t'];

/** The schedule's labels, in the user's language and the project's number style. Pure: the Wall's export builds them too. */
export function roomScheduleLabelsOf(t: T, locale: SheetLocale, title: string, data: RoomScheduleData | null, summary: AreaSummary | null = null): RoomScheduleLabels {
  const notes = [t('roomSched.note.source'), t('roomSum.note.perimeter')];
  if (data) {
    if (data.schedule.fromGeometry > 0) notes.push(t('roomSched.note.geometry', { count: data.schedule.fromGeometry }));
    if (data.schedule.withoutArea > 0) notes.push(t('roomSched.note.none', { count: data.schedule.withoutArea }));
    notes.push(t('roomSched.note.leftOut', data.leftOut));
  }
  const lowerBound = summary !== null && (summary.building.scAtLeast || summary.building.sdAtLeast || summary.levels.some((l) => l.atLeast));
  const words: RoomSummaryWords = {
    heading: t('roomSum.heading'), level: t('roomSum.level'), su: t('roomSum.su'), sc: t('roomSum.sc'), sd: t('roomSum.sd'),
    building: t('roomSum.building'), noLevel: t('roomSched.noLevel'), atLeast: (value) => t('urban.atLeast', { value }),
    notes: [t('roomSum.note.defs', { mark: sheetLevel(locale, 0) }), ...(lowerBound ? [t('roomSum.note.atLeast')] : [])],
  };
  return {
    locale, title, notes, summary: summary ? { summary, words } : null,
    number: t('roomSched.number'), room: t('roomSched.room'), level: t('roomSched.noLevel'), area: t('roomSched.area'), perimeter: t('roomSum.perimeter'),
    levelTotal: (level: string) => t('roomSched.levelTotal', { level }), total: t('roomSched.total'),
    source: '', quantity: '', geometry: '', noLevel: t('roomSched.noLevel'),
  };
}

export function useRoomScheduleLabels(title: string, data: RoomScheduleData | null, summary: AreaSummary | null = null): RoomScheduleLabels {
  const { t } = useTranslation();
  // The project's "Units and numbers" (#88) as well as the language: the schedule's figures are written like every other sheet's.
  const locale = useSheetLocale();
  return useMemo(() => roomScheduleLabelsOf(t, locale, title, data, summary), [t, locale, title, data, summary]);
}
