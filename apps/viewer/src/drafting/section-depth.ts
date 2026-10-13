/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How far a section looks, drawn on its plan: a band on the viewing side of
 * the cut line with one handle on its far edge. Plain geometry in plan
 * metres; the handle is a grip, and dragging it sets the section view's
 * depth.
 */

import type { Grip } from './grips';
import { sectionLink, sectionNormal, withSectionParts } from './section-symbol';
import type { DraftEntity, Pt } from './types';

/** The section's cut line and the side it looks toward, on its plan. */
export interface SectionCut {
  /** The entity holding the cut line. */
  id: string;
  viewId: string;
  a: Pt;
  b: Pt;
  side: Pt;
}

/** Shown for a section that has no depth of its own, metres. */
export const DEFAULT_BAND_DEPTH_M = 3;
/** The shallowest depth a drag sets, and the step it snaps to, metres. */
export const MIN_BAND_DEPTH_M = 0.1;
export const BAND_DEPTH_STEP_M = 0.05;

const same = (p: Pt, q: Pt): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

/**
 * The cut line and side of the section whose symbol `parts` are, or `null`.
 * The cut line is the longest line of the symbol; the stem that leaves its
 * start ends on the viewing side.
 */
export function sectionCutOf(parts: readonly DraftEntity[]): SectionCut | null {
  const lines = parts.flatMap((e) => (e.shape.type === 'line' && sectionLink(e) ? [{ e, a: e.shape.a, b: e.shape.b }] : []));
  if (lines.length === 0) return null;
  const cut = lines.reduce((m, l) => (Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) > Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) ? l : m));
  const stem = lines.find((l) => l !== cut && same(l.a, cut.a));
  const viewId = sectionLink(cut.e);
  if (!stem || !viewId) return null;
  return { id: cut.e.id, viewId, a: cut.a, b: cut.b, side: stem.b };
}

/** The band: the cut line pushed `depth` toward the viewing side. */
export function depthBandPolygon(cut: Pick<SectionCut, 'a' | 'b' | 'side'>, depth: number): Pt[] {
  const n = sectionNormal(cut.a, cut.b, cut.side);
  if (!n) return [];
  const at = (p: Pt): Pt => ({ x: p.x + n.x * depth, y: p.y + n.y * depth });
  return [cut.a, cut.b, at(cut.b), at(cut.a)];
}

/** The handle: the middle of the band's far edge. */
export function depthHandle(cut: Pick<SectionCut, 'a' | 'b' | 'side'>, depth: number): Pt | null {
  const n = sectionNormal(cut.a, cut.b, cut.side);
  if (!n) return null;
  return { x: (cut.a.x + cut.b.x) / 2 + n.x * depth, y: (cut.a.y + cut.b.y) / 2 + n.y * depth };
}

/** The depth a handle dragged to `p` means: its distance from the cut line on the viewing side, snapped, never less than the minimum. */
export function depthFromPoint(cut: Pick<SectionCut, 'a' | 'b' | 'side'>, p: Pt): number | null {
  const n = sectionNormal(cut.a, cut.b, cut.side);
  if (!n) return null;
  const raw = (p.x - cut.a.x) * n.x + (p.y - cut.a.y) * n.y;
  const snapped = Math.round(Math.round(raw / BAND_DEPTH_STEP_M) * BAND_DEPTH_STEP_M * 1e4) / 1e4;
  return Math.max(MIN_BAND_DEPTH_M, snapped);
}

/** The grip of a selected section's depth band. */
export function depthGrip(cut: SectionCut, depth: number): Grip | null {
  const at = depthHandle(cut, depth);
  return at ? { id: cut.id, key: 'depth', at, section: cut } : null;
}

/**
 * The depth band of the one section whose symbol is selected: its cut line,
 * the depth to show and the handle. `null` when the selection is not one
 * section's symbol (none, several, or anything else).
 */
export function selectedSectionBand(
  selection: ReadonlySet<string>,
  entities: readonly DraftEntity[],
  views: readonly { id: string; viewDepth?: number | null }[],
): { cut: SectionCut; depth: number; grip: Grip } | null {
  const touched = new Set(entities.filter((e) => selection.has(e.id)).map((e) => sectionLink(e)));
  if (touched.size !== 1) return null;
  const [viewId] = touched;
  if (!viewId) return null;
  const view = views.find((v) => v.id === viewId);
  if (!view) return null;
  const parts = entities.filter((e) => withSectionParts(selection, entities).has(e.id) && sectionLink(e) === viewId);
  const cut = sectionCutOf(parts);
  if (!cut) return null;
  const depth = typeof view.viewDepth === 'number' && view.viewDepth > 0 ? view.viewDepth : DEFAULT_BAND_DEPTH_M;
  const grip = depthGrip(cut, depth);
  return grip ? { cut, depth, grip } : null;
}
