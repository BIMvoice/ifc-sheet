/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Click-to-go for a finding about model elements: the view in front zooms to
 * them and highlights them. The finding asks (`requestFocus`); the drawing view
 * answers once its drawing is there, and clears the request (`focusBox`
 * is the part that is pure: where to look).
 */

import { create } from 'zustand';
import type { Pt } from '@/drafting/types';

export interface FocusRequest { viewId: string; guids: readonly string[]; nonce: number }

export const useFocusRequest = create<{ request: FocusRequest | null }>(() => ({ request: null }));

let nonce = 0;
export function requestFocus(viewId: string, guids: readonly string[]): void {
  useFocusRequest.setState({ request: { viewId, guids, nonce: ++nonce } });
}
export const clearFocus = (): void => useFocusRequest.setState({ request: null });

/** The least a view must show of its elements, as a fraction of the view's smaller side: a door stays a door, not a speck, when it is alone. */
const MIN_SPAN = 4;

export interface Box { min: Pt; max: Pt }

/** The box round `rings`, grown to show what surrounds them: at least `minSpan` units across (a door is a metre or two, the room round it more). */
export function focusBox(rings: readonly (readonly Pt[])[], minSpan = MIN_SPAN): Box | null {
  const pts = rings.flat();
  if (pts.length === 0) return null;
  const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
  const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
  // A door's swing lies outside its outline: leave a metre, or a tenth of the span, round whatever is asked for.
  const grow = (a: number, b: number): [number, number] => {
    const m = Math.max(1, 0.1 * (b - a));
    return b - a + 2 * m >= minSpan ? [a - m, b + m] : [(a + b) / 2 - minSpan / 2, (a + b) / 2 + minSpan / 2];
  };
  const [x0, x1] = grow(min.x, max.x), [y0, y1] = grow(min.y, max.y);
  return { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } };
}
