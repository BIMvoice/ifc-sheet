/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a placed schedule exports (#80): the rows of the table the sheet draws, read from the same sources it reads (`ScheduleGraphic`'s
 * `useSheetSchedules`: `scheduleDataOf` for a joinery schedule, with its filter, sub-report and text rows; the takeoff, the finishes, the quantities by type,
 * the urban indicators and the register through the one function each table is drawn from), and handed to the table of its kind.
 * Read when the button is pressed, so the file is the table as it stands, not as it stood when the card opened. `null` when there is nothing to list.
 */

import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule } from '@/project/types';
import { sharedRegisterRows } from '@/project/drawing-register';
import { ensureWasm } from '@/lib/wasm/ensure-wasm';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { joineryExport, type JoineryExportLabels } from '@/joinery/schedule-layout';
import { takeoffRows } from '@/joinery/material-takeoff';
import { collectTakeoffElements } from '@/joinery/material-takeoff-models';
import { takeoffTable, type TakeoffLabels } from '@/joinery/material-takeoff-layout';
import { roomFinishes } from '@/joinery/room-finishes';
import { collectRoomInputs } from '@/joinery/room-finishes-models';
import { finishTable, type RoomFinishLabels } from '@/joinery/room-finishes-layout';
import { typeQuantitiesOf } from '@/joinery/type-quantities-models';
import { typeQuantityTable, type TypeQuantityLabels } from '@/joinery/type-quantities-layout';
import { registerTable, type RegisterLabels } from '@/joinery/register-layout';
import { urbanTable, type UrbanLabels } from '@/urban/urban-layout';
import type { UrbanAreas } from '@/urban/urban-models';
import { collectUrbanAreas } from '@/urban/urban-models';
import type { SiteAreaChoice } from '@/urban/site-area';
import type { ScheduleExport } from '@/joinery/schedule-export';
import { urbanResultOf } from '../urban/useUrban';
import { boqPropertyNames, boqTable, computeBoq, type BoqSay } from '@bimvoice/ifcsheet';
import { collectBoqElements } from '@/boq/boq-models';

/** The words of every kind's table, in the user's language; the schedule's name is written over them. */
export interface ExportLabelSet {
  joinery: JoineryExportLabels;
  takeoff: TakeoffLabels;
  finishes: RoomFinishLabels;
  types: TypeQuantityLabels;
  register: RegisterLabels;
  urban: (title: string, areas: UrbanAreas, site: SiteAreaChoice) => UrbanLabels;
  /** The register's "as indicated" scale. */
  asIndicated: string;
  /** The bill of quantities' words. */
  boq: BoqSay;
}

export async function readScheduleExport(schedule: ProjectSchedule, labels: ExportLabelSet): Promise<ScheduleExport | null> {
  const title = schedule.name;
  switch (schedule.kind) {
    case 'materials': {
      const rows = takeoffRows(collectTakeoffElements());
      return rows.length ? { title, tables: [takeoffTable(rows, { ...labels.takeoff, title })] } : null;
    }
    case 'finishes': {
      const rooms = roomFinishes(collectRoomInputs());
      return rooms.length ? { title, tables: [finishTable(rooms, { ...labels.finishes, title })] } : null;
    }
    case 'types': {
      const data = typeQuantitiesOf(schedule.classification);
      return data.rows.length ? { title, tables: [typeQuantityTable(data, { ...labels.types, title })] } : null;
    }
    case 'boq': {
      // The mapping table is the project's; the sum is the engine's, over the models as the session holds them.
      const articles = useProjectStore.getState().boqArticles ?? [];
      if (articles.length === 0) return null;
      const result = computeBoq(collectBoqElements(new Set(boqPropertyNames(articles))), articles);
      return { title, tables: [boqTable(result, labels.boq, { title, detail: schedule.detail === true })] };
    }
    case 'register': {
      const p = useProjectStore.getState();
      const rows = sharedRegisterRows({ sheets: p.sheets, titleBlock: p.titleBlock, issues: p.issues, asIndicated: labels.asIndicated, schedules: p.schedules, revisions: p.revisions, drafts: p.drafts });
      return rows.length ? { title, tables: [registerTable(rows, { ...labels.register, title })] } : null;
    }
    case 'urban': {
      // The footprints are measured by the geometry module: wait for it, as the table does.
      await ensureWasm();
      const areas = collectUrbanAreas();
      const p = useProjectStore.getState();
      const { result, site } = urbanResultOf(areas, p);
      return result.storeys.some((s) => s.builtArea !== null) ? { title, tables: [urbanTable(result, labels.urban(title, areas, site))] } : null;
    }
    default: {
      // A joinery schedule: the engine's rows, cut by its sub-report and filter, in the order and numbering of its content (`scheduleDataOf`).
      const data = scheduleDataOf(schedule);
      return data.entries.length ? joineryExport(data, { ...labels.joinery, title }) : null;
    }
  }
}
