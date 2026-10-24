/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Joinery schedules as project items: create, change their settings. */

import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import type { SubReportFilter } from '@bimvoice/ifcsheet';
import type { ProjectSchedule } from '@/project/types';

export function addSchedule(kind: ProjectSchedule['kind'], name: string): string {
  const id = freshProjectId('schedule');
  const schedules = useProjectStore.getState().schedules ?? [];
  useProjectStore.setState({ schedules: [...schedules, { id, name, kind, createdAt: Date.now(), scale: 50 }], dirty: true });
  return id;
}

export function updateSchedule(id: string, patch: Partial<Omit<ProjectSchedule, 'id' | 'createdAt'>>): void {
  const schedules = useProjectStore.getState().schedules ?? [];
  useProjectStore.setState({ schedules: schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)), dirty: true });
}

export function scheduleById(id: string): ProjectSchedule | undefined {
  return (useProjectStore.getState().schedules ?? []).find((s) => s.id === id);
}

/** Whether a schedule can be split: a joinery list that is not itself a part (parts do not nest: a part is cut from the model's rows). */
export function canSplit(schedule: Pick<ProjectSchedule, 'kind' | 'sub'> | undefined): boolean {
  return !!schedule && !schedule.sub && (schedule.kind === 'door' || schedule.kind === 'window' || schedule.kind === 'all');
}

/** A sub-report of the schedule `parentId` that keeps what `filter` names, named `name`; returns its id, or null when the parent cannot be split. Same kind and scale as the parent. */
export function addSubReport(parentId: string, name: string, filter: SubReportFilter): string | null {
  const parent = scheduleById(parentId);
  if (!parent || !canSplit(parent)) return null;
  const id = freshProjectId('schedule');
  const schedules = useProjectStore.getState().schedules ?? [];
  useProjectStore.setState({ schedules: [...schedules, { id, name, kind: parent.kind, createdAt: Date.now(), scale: parent.scale ?? 50, sub: { parent: parentId, filter } }], dirty: true });
  return id;
}

/** Change what the sub-report `id` keeps; `undefined` for a dimension removes its restriction. */
export function setSubReportFilter(id: string, patch: Partial<Record<keyof SubReportFilter, string[] | undefined>>): void {
  const schedule = scheduleById(id);
  if (!schedule?.sub) return;
  const filter: SubReportFilter = { ...schedule.sub.filter, ...patch } as SubReportFilter;
  for (const key of Object.keys(filter) as (keyof SubReportFilter)[]) if (filter[key] === undefined) delete filter[key];
  updateSchedule(id, { sub: { ...schedule.sub, filter } });
}

/** `value` in `list` if absent, out if present (a toggle); an absent list is "everything", so the first toggle starts from `all`. */
export function toggled<T>(list: readonly T[] | undefined, value: T, all: readonly T[]): T[] {
  const base = list ?? all;
  return base.includes(value) ? base.filter((v) => v !== value) : all.filter((v) => v === value || base.includes(v));
}

/** The sub-reports of `parentId`, in the order they were made. */
export function subReportsOf(schedules: readonly ProjectSchedule[], parentId: string): ProjectSchedule[] {
  return schedules.filter((s) => s.sub?.parent === parentId);
}

/** Doors and windows apart: two sub-reports of the schedule `parentId`; returns their ids. */
export function splitByKind(parentId: string, names: { door: string; window: string }): string[] {
  return [addSubReport(parentId, names.door, { kinds: ['door'] }), addSubReport(parentId, names.window, { kinds: ['window'] })].filter((id): id is string => !!id);
}

/** One sub-report per storey, named after it; returns their ids. */
export function splitByLevel(parentId: string, levels: readonly string[]): string[] {
  return levels.map((level) => addSubReport(parentId, level, { levels: [level] })).filter((id): id is string => !!id);
}
