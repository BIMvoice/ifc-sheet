/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the handover package takes from the open project besides the drawn sheets (#83): the IFC files as loaded, every schedule as a
 * workbook through the one XLSX writer (`joinery/schedule-export.ts`, the same table the sheet prints), and the issue's drawing list as
 * a workbook. Read when the package is built, so the files are the project as it stands.
 */

import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { exportXlsx, type ScheduleExport } from '@/joinery/schedule-export';
import { readScheduleExport, type ExportLabelSet } from '@/components/viewer/wall/schedule-export-read';
import { drawingListRows, type ListLabels } from './output';
import type { IssuePlan } from './plan';
import type { HandoverModel, HandoverWorkbook } from './handover';

/** The IFC models that are open, byte for byte as they were loaded (not the edited export). A model that is not IFC has no data store and is left out. */
export function loadedModels(): HandoverModel[] {
  const out: HandoverModel[] = [];
  for (const model of useViewerStore.getState().models.values()) {
    if (model.ifcDataStore) out.push({ name: model.name, bytes: model.ifcDataStore.source.materialize() });
  }
  return out;
}

const workbook = async (data: ScheduleExport): Promise<Uint8Array> => new Uint8Array(await (await exportXlsx(data)).arrayBuffer());

/** Every schedule of the project as a workbook; one with nothing to list is left out. */
export async function scheduleWorkbooks(labels: ExportLabelSet): Promise<HandoverWorkbook[]> {
  const out: HandoverWorkbook[] = [];
  for (const schedule of useProjectStore.getState().schedules ?? []) {
    const data = await readScheduleExport(schedule, labels);
    if (data) out.push({ name: schedule.name, xlsx: await workbook(data) });
  }
  return out;
}

/** The issue's drawing list as a workbook, the rows of the CSV beside the PDF. */
export async function registerWorkbook(plan: IssuePlan, labels: ListLabels): Promise<HandoverWorkbook> {
  const [header, ...rows] = drawingListRows(plan, labels);
  const name = `${plan.name} ${labels.drawingList}`;
  return { name, xlsx: await workbook({ title: labels.title, tables: [{ name: labels.title, header, rows }] }) };
}
