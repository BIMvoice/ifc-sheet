/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When a label is joined to its element by a leader, and where the leader
 * runs. It is drawn the way an element tag's leader is (the same line and
 * arrow); this module only decides whether there is one and where it ends.
 */

import type { Pt } from '@/drafting/types';
import { leaderStart } from '@bimvoice/ifcsheet';
import { nearestOnRing, rectCentre, rectRingGap, type Rect } from './label-geometry';

export const LEADER_MODES = ['never', 'displaced', 'always'] as const;
/** never: no leader; displaced: one once the label is further than the threshold from its element; always: always. */
export type LeaderMode = (typeof LEADER_MODES)[number];
export const DEFAULT_LEADER: LeaderMode = 'displaced';

export const asLeaderMode = (v: unknown): LeaderMode | undefined => (LEADER_MODES as readonly unknown[]).includes(v) ? (v as LeaderMode) : undefined;

/** A label further than this from its element, paper millimetres, is displaced. */
export const DISPLACED_MM = 2.5;

/**
 * Where the leader of a label whose box is `label` ends on its element (the ring), or undefined for none.
 * `threshold` is in drawing units. A label lying on its element gets none: there is nothing to point across.
 */
export function leaderTip(mode: LeaderMode, label: Rect, ring: readonly Pt[], threshold: number): Pt | undefined {
  if (mode === 'never' || ring.length < 3) return undefined;
  const gap = rectRingGap(label, ring);
  if (gap === 0) return undefined;
  if (mode === 'displaced' && gap <= threshold) return undefined;
  return nearestOnRing(ring, rectCentre(label));
}

// Where a leader leaves a label's box is the engine's (`text-leader.ts`): the PDF of `ifcsheet build` starts a text's leader there too.
export { leaderStart };

/** An element outline kept with its label as text: `x,y` pairs in millimetres, at most 24 points. */
export function ringToRef(ring: readonly Pt[]): string {
  return ring.map((p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`).join(' ');
}

export function refToRing(ref: unknown): Pt[] | null {
  if (typeof ref !== 'string') return null;
  const ring = ref.split(' ').map((s): Pt | null => {
    const m = /^(-?\d+),(-?\d+)$/.exec(s);
    return m ? { x: Number(m[1]) / 1000, y: Number(m[2]) / 1000 } : null;
  });
  return ring.length >= 3 && ring.every((p) => p !== null) ? (ring as Pt[]) : null;
}
