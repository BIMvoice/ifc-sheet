/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Making a section from a line on a plan: the section view and its symbol on
 * the plan, as one step. The SECTION command and the proposed sections
 * (`project/section-proposals.ts`) both come through here, so a section made
 * either way is the same thing.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { addProjectView, useProjectStore } from '@/project/project-store';
import { styledParams } from '@/project/drafting-standards';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { SectionProposal } from '@/project/section-proposals';
import type { PlanProjectView, ProjectLevel } from '@/project/types';
import { editDrafts, newDraft } from './draft-store';
import type { CustomSectionPlane } from '@/store/section-types';
import { drawingToWorld, worldToDrawing, type Vec3 } from './frame';
import { nextSectionMark, sectionMarkOf, sectionSymbolShapes, sectionViewName } from './section-symbol';
import type { DraftParamValue, Pt } from './types';

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const tuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/** The vertical section plane through a plan line, looking toward `side`. `null` for a degenerate line. */
export function sectionPlaneFromLine(plan: SectionPlaneConfig, a: Pt, b: Pt, side: Pt): CustomSectionPlane | null {
  const p = drawingToWorld(plan, a);
  const q = drawingToWorld(plan, b);
  const s = drawingToWorld(plan, side);
  // Horizontal direction along the line (viewer frame is Y-up).
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  let normal: Vec3 = { x: dz / len, y: 0, z: -dx / len };
  // Keep the picked side: the normal points away from it.
  if ((s.x - p.x) * normal.x + (s.z - p.z) * normal.z > 0) normal = { x: -normal.x, y: 0, z: -normal.z };
  const up: Vec3 = { x: 0, y: 1, z: 0 };
  // Looking along −normal with world up, screen right is (−normal) × up.
  const tangent = cross({ x: -normal.x, y: 0, z: -normal.z }, up);
  return {
    normal: tuple(normal),
    distance: dot(p, normal),
    pickedAt: tuple(p),
    tangent: tuple(tangent),
    bitangent: tuple(up),
  };
}

export interface SectionOnPlan {
  /** The plan the line is drawn on, and its drawing plane. */
  planViewId: string;
  plan: SectionPlaneConfig;
  /** The cut line and a point on the side the section looks toward, plan drawing coordinates. */
  a: Pt;
  b: Pt;
  side: Pt;
  layerId: string;
  /** Text height of the symbol's names, drawing units. */
  textHeight: number;
  /** Text and dimension style current where it is drawn. */
  styles?: { textStyle?: string; dimStyle?: string };
  /** What it cuts through, for people: "Through the stair". */
  through?: string;
}

/** Make the section and leave its symbol on the plan. `null` for a degenerate line. */
export function createSectionOnPlan(input: SectionOnPlan): string | null {
  const custom = sectionPlaneFromLine(input.plan, input.a, input.b, input.side);
  if (!custom) return null;
  const name = sectionViewName(nextSectionMark(useProjectStore.getState().views));
  const viewId = addProjectView({
    kind: 'section', name, plane: { axis: 'front', offset: custom.distance, flipped: false, custom },
    ...(input.through ? { through: input.through } : {}),
  });
  const mark = sectionMarkOf(useProjectStore.getState().views.find((v) => v.id === viewId)?.name ?? name);
  const current = { textStyle: input.styles?.textStyle ?? 'standard', dimStyle: input.styles?.dimStyle ?? 'standard' };
  editDrafts({
    add: sectionSymbolShapes(input.a, input.b, input.side, mark, input.textHeight).map((shape) => {
      const params: Record<string, DraftParamValue> = { ...styledParams(input.planViewId, shape, current), sectionOf: viewId };
      return newDraft(input.planViewId, input.layerId, shape, params);
    }),
  });
  return viewId;
}

/** The paper height of a section symbol's names, mm. */
export const SYMBOL_TEXT_MM = 2.5;

/** Make a proposed section on `plan`: the same section the SECTION command would make along its line. */
export function createProposedSection(plan: PlanProjectView, levels: readonly ProjectLevel[], proposal: SectionProposal): string | null {
  const config = viewPlaneConfig(plan, levels, null);
  if (!config) return null;
  const at = (p: { x: number; z: number }): Pt => worldToDrawing(config, { x: p.x, y: config.position, z: p.z });
  return createSectionOnPlan({
    planViewId: plan.id, plan: config, a: at(proposal.a), b: at(proposal.b), side: at(proposal.side), layerId: '0',
    textHeight: (SYMBOL_TEXT_MM * (plan.scale ?? 100)) / 1000, through: proposal.label,
  });
}
