/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The link between a section view and its symbol on a plan, both ways.
 *
 * The symbol is the handle: move or rotate it on the plan, or drag an end of
 * its cut line, and the section's cut plane follows. Change the plane on the
 * section view and the symbol moves to it. Whichever side changed last wins;
 * the other is brought into line, so the two never disagree for long.
 *
 * Pure functions over the project document; `installSectionLink` runs them
 * after every change of the project store.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { CustomSectionPlane } from '@/store/section-types';
import { useProjectStore } from '@/project/project-store';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { PlanProjectView, ProjectLevel, ProjectView, SectionProjectView } from '@/project/types';
import { withAnnotationScreenUp } from './annotation';
import { sectionPlaneFromLine } from './section-create';
import { drawingToWorld, worldToDrawing, type Vec3 } from './frame';
import { sectionLink, sectionMarkOf, sectionSymbolShapes } from './section-symbol';
import type { DraftEntity, EntityShape, Pt } from './types';

const EPS = 1e-6;

/** Where a symbol sits on its plan: the cut line from `a` to `b`, looking toward `side`. */
export interface SymbolPlacement {
  a: Pt;
  b: Pt;
  side: Pt;
}

/** The parts of `viewId`'s symbol on one plan, in the order `sectionSymbolShapes` made them. */
export function symbolParts(drafts: readonly DraftEntity[], viewId: string): DraftEntity[] {
  return drafts.filter((d) => sectionLink(d) === viewId);
}

/**
 * Where the symbol made of `parts` sits. The cut line is the first line, the
 * first stem the second; the stem's direction is the side the section looks
 * toward. Measured from the parts, so it holds after a move, a rotation or a
 * grip drag of one end of the cut line.
 */
export function placementOf(parts: readonly DraftEntity[]): SymbolPlacement | null {
  const lines = parts.flatMap((p) => (p.shape.type === 'line' ? [p.shape] : []));
  if (lines.length < 2) return null;
  const [cut, stem] = lines;
  const dx = cut.b.x - cut.a.x;
  const dy = cut.b.y - cut.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const sx = stem.b.x - stem.a.x;
  const sy = stem.b.y - stem.a.y;
  // The side is the normal of the cut line that the stem points along.
  let nx = -dy / len;
  let ny = dx / len;
  if (sx * nx + sy * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const mid = { x: (cut.a.x + cut.b.x) / 2, y: (cut.a.y + cut.b.y) / 2 };
  return { a: cut.a, b: cut.b, side: { x: mid.x + nx, y: mid.y + ny } };
}

/** The text height the symbol was drawn with (its labels'), else `fallback`. */
function symbolTextHeight(parts: readonly DraftEntity[], fallback: number): number {
  for (const p of parts) if (p.shape.type === 'text') return p.shape.height;
  return fallback;
}

const samePt = (p: Pt, q: Pt): boolean => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;

function sameShape(s: EntityShape, t: EntityShape): boolean {
  if (s.type === 'line' && t.type === 'line') return samePt(s.a, t.a) && samePt(s.b, t.b);
  if (s.type === 'text' && t.type === 'text') return samePt(s.p, t.p) && s.text === t.text && Math.abs(s.height - t.height) < EPS;
  return false;
}

/**
 * The symbol's parts redrawn whole at `placement`: after one end of the cut
 * line was dragged the stems, arrows and names are brought back to it. The
 * parts keep their ids, layers and parameters. `null` when they already match.
 */
export function redrawSymbol(parts: readonly DraftEntity[], placement: SymbolPlacement, mark: string, screenUp: 1 | -1 = -1): DraftEntity[] | null {
  // The letter's box grows up on the screen of the plan the symbol is on, whichever view the session is in (#297).
  const shapes = withAnnotationScreenUp(screenUp, () => sectionSymbolShapes(placement.a, placement.b, placement.side, mark, symbolTextHeight(parts, 0.25)));
  if (shapes.length !== parts.length) return null;
  if (parts.every((p, i) => sameShape(p.shape, shapes[i]))) return null;
  return parts.map((p, i) => ({ ...p, shape: shapes[i] }));
}

const v3 = (t: readonly number[]): Vec3 => ({ x: t[0], y: t[1], z: t[2] });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

function samePlane(p: CustomSectionPlane, q: CustomSectionPlane): boolean {
  return p.normal.every((c, i) => Math.abs(c - q.normal[i]) < EPS) && Math.abs(p.distance - q.distance) < EPS;
}

/**
 * The cut plane a symbol placement gives, keeping the view's drawing origin
 * where it was when only the distance changed: the section's own drafts stay
 * put when its cut slides along its normal.
 */
export function planeFromPlacement(plan: SectionPlaneConfig, placement: SymbolPlacement, current: CustomSectionPlane | undefined): CustomSectionPlane | null {
  const next = sectionPlaneFromLine(plan, placement.a, placement.b, placement.side);
  if (!next) return null;
  const sameDirection = current && next.normal.every((c, i) => Math.abs(c - current.normal[i]) < EPS);
  return sameDirection ? { ...next, pickedAt: current.pickedAt, tangent: current.tangent, bitangent: current.bitangent } : next;
}

/** Where the symbol goes for a changed cut plane: its ends moved straight onto the plane, the side kept. */
export function placementForPlane(plan: SectionPlaneConfig, placement: SymbolPlacement, plane: CustomSectionPlane): SymbolPlacement {
  const n = v3(plane.normal);
  const onto = (p: Pt): Pt => {
    const w = drawingToWorld(plan, p);
    const k = dot(w, n) - plane.distance;
    return worldToDrawing(plan, { x: w.x - k * n.x, y: w.y - k * n.y, z: w.z - k * n.z });
  };
  const a = onto(placement.a);
  const b = onto(placement.b);
  // The kept half is where dot(p, n) − d < 0: the side is one step against the normal.
  const mid = drawingToWorld(plan, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const side = worldToDrawing(plan, { x: mid.x - n.x, y: mid.y - n.y, z: mid.z - n.z });
  return { a, b, side };
}

/**
 * The selected entities whose grips are offered: everything but a section
 * symbol, whose only grips are its cut line's. Dragging an end turns or
 * stretches the cut, dragging its middle slides it; the rest is redrawn.
 */
export function grippable(selected: readonly DraftEntity[], all: readonly DraftEntity[], views: readonly { id: string }[]): DraftEntity[] {
  return selected.filter((e) => {
    const link = sectionLink(e);
    if (link === null || !views.some((v) => v.id === link)) return true;
    return symbolParts(all, link).find((p) => p.shape.type === 'line')?.id === e.id;
  });
}

export interface SectionLinkState {
  views: readonly ProjectView[];
  drafts: readonly DraftEntity[];
  levels: readonly ProjectLevel[];
}

export interface SectionLinkPatch {
  views?: ProjectView[];
  drafts?: DraftEntity[];
}

function planConfigOf(planId: string, state: SectionLinkState): SectionPlaneConfig | null {
  const plan = state.views.find((v): v is PlanProjectView => v.id === planId && v.kind === 'plan');
  return plan ? viewPlaneConfig(plan, state.levels, null) : null;
}

/** Plans draw drawing-y downward on screen, so their text grows toward -y; the other views the other way. */
const planScreenUp = (plan: SectionPlaneConfig): 1 | -1 => (plan.axis === 'y' ? -1 : 1);

/**
 * Bring sections and their symbols into line after a change from `previous`
 * to `next`. A section whose plane changed while its symbol did not moves its
 * symbol; any other difference moves the plane to the symbol. Returns only
 * what has to change, or `null` when everything already agrees.
 */
export function reconcileSectionLinks(previous: SectionLinkState, next: SectionLinkState): SectionLinkPatch | null {
  let views: ProjectView[] | null = null;
  let drafts: DraftEntity[] | null = null;
  for (const view of next.views) {
    if (view.kind !== 'section' || !view.plane.custom) continue;
    const parts = symbolParts(drafts ?? next.drafts, view.id);
    if (parts.length === 0) continue;
    const plan = planConfigOf(parts[0].viewId, next);
    const placement = placementOf(parts);
    if (!plan || !placement) continue;
    const before = previous.views.find((v): v is SectionProjectView => v.id === view.id && v.kind === 'section');
    const planeMoved = before?.plane.custom !== undefined && before.plane !== view.plane && !samePlane(before.plane.custom, view.plane.custom);
    const symbolMoved = symbolParts(previous.drafts, view.id).some((p, i) => p !== parts[i]);
    const mark = sectionMarkOf(view.name);
    if (planeMoved && !symbolMoved) {
      const redrawn = redrawSymbol(parts, placementForPlane(plan, placement, view.plane.custom), mark, planScreenUp(plan));
      if (redrawn) drafts = replaceParts(drafts ?? [...next.drafts], redrawn);
      continue;
    }
    const plane = planeFromPlacement(plan, placement, view.plane.custom);
    if (plane && !samePlane(plane, view.plane.custom)) {
      const moved: SectionProjectView = { ...view, plane: { ...view.plane, offset: plane.distance, custom: plane } };
      views = (views ?? [...next.views]).map((v) => (v.id === view.id ? moved : v));
    }
    const redrawn = redrawSymbol(parts, placement, mark, planScreenUp(plan));
    if (redrawn) drafts = replaceParts(drafts ?? [...next.drafts], redrawn);
  }
  if (!views && !drafts) return null;
  return { ...(views ? { views } : {}), ...(drafts ? { drafts } : {}) };
}

function replaceParts(drafts: DraftEntity[], parts: readonly DraftEntity[]): DraftEntity[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  return drafts.map((d) => byId.get(d.id) ?? d);
}

let installed: (() => void) | null = null;

/**
 * Keep every section and its symbol in line from now on. The follow-up write
 * is derived data, so it joins the change that caused it rather than making
 * an undo step of its own. Returns the uninstaller (tests).
 */
export function installSectionLink(): () => void {
  if (installed) return installed;
  let applying = false;
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (applying || (state.views === previous.views && state.drafts === previous.drafts && state.levels === previous.levels)) return;
    const patch = reconcileSectionLinks(previous, state);
    if (!patch) return;
    applying = true;
    try {
      useProjectStore.setState(patch);
    } finally {
      applying = false;
    }
  });
  installed = () => {
    unsubscribe();
    installed = null;
  };
  return installed;
}
