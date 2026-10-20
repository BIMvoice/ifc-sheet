/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Legends as project items: create, change their configuration, duplicate. */

import { DEFAULT_LEGEND, type LegendConfig, type ProjectLegend } from '@/catalogue/types';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';

export const projectLegends = (): ProjectLegend[] => useProjectStore.getState().legends ?? [];

/** A new legend; `scope` binds it to a view or sheet when it is made from one. Returns its id. */
export function addLegend(name: string, scope: Partial<Pick<LegendConfig, 'scope' | 'scopeId'>> = {}): string {
  const id = freshProjectId('legend');
  const legend: ProjectLegend = { ...DEFAULT_LEGEND, ...scope, id, name, title: name, createdAt: Date.now() };
  useProjectStore.setState({ legends: [...projectLegends(), legend], dirty: true });
  return id;
}

export function updateLegend(id: string, patch: Partial<Omit<ProjectLegend, 'id' | 'createdAt'>>): void {
  useProjectStore.setState({ legends: projectLegends().map((l) => (l.id === id ? { ...l, ...patch } : l)), dirty: true });
}

export function duplicateLegend(id: string, name: string): string | null {
  const source = projectLegends().find((l) => l.id === id);
  if (!source) return null;
  const copy: ProjectLegend = { ...structuredClone(source), id: freshProjectId('legend'), name, createdAt: Date.now() };
  useProjectStore.setState({ legends: [...projectLegends(), copy], dirty: true });
  return copy.id;
}
