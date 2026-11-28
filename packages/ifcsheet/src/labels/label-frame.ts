/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The frame a label type draws round the label of one element (#924): a door's or a window's own frame where the type
 * gives one, else the type's frame. The app's labels, its label sync and the engine's TAGALL all ask here, so a door
 * ringed on the sheet is ringed in the engine's PDF and DXF too.
 */

import { FRAMED_CLASSES, type ClassFrame, type FramedClass, type LabelSpec } from '../annotation-type.js';
import { asTextFrame, type TextFrame } from '../draft-types.js';

/** The framed class an IFC class belongs to: `IfcDoorStandardCase` is a door. */
export function framedClassOf(className: string): FramedClass | undefined {
  const lower = className.toLowerCase();
  return FRAMED_CLASSES.find((c) => lower.startsWith(c.toLowerCase()));
}

/** The frame of `spec`'s label on an element of `className`; undefined: no frame. `className` is read only when the type frames a class on its own. */
export function labelFrameOf(spec: LabelSpec, className: () => string): TextFrame | undefined {
  if (!spec.classFrames) return spec.frame;
  const own = framedClassOf(className());
  const frame = own ? spec.classFrames[own] : undefined;
  if (frame === undefined) return spec.frame;
  return frame === 'none' ? undefined : frame;
}

/** The class frames a file stores, those it does not know left out; undefined when none is left. */
export function readClassFrames(v: unknown): LabelSpec['classFrames'] {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const stored = v as Record<string, unknown>;
  const out: Partial<Record<FramedClass, ClassFrame>> = {};
  for (const c of FRAMED_CLASSES) {
    const frame = stored[c] === 'none' ? 'none' : asTextFrame(stored[c]);
    if (frame) out[c] = frame;
  }
  return Object.keys(out).length ? out : undefined;
}
