/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The record of an annotation preset and its file reader, apart from the project store so the field registry can import it (#497). A name for a choice of what TAGALL, DIMALL and LEVELALL place ("Show from the model"). A
 * preset is only the options those commands already take (which commands, and which of TAGALL's kinds of label); applying
 * one runs the same commands, so what a view has already is not placed again. Kept in the project.
 */

import type { TagParts } from '@/tagall/types';
import { COMMAND_ORDER, type AnnotateCommand } from './choices';

export interface AnnotationPreset {
  id: string;
  name: string;
  on: Record<AnnotateCommand, boolean>;
  tagParts: TagParts;
}

/** What the panel switches: the commands, and the kinds TAGALL labels. */
export type AnnotationOptions = Pick<AnnotationPreset, 'on' | 'tagParts'>;

const TAG_PART_KEYS = ['doors', 'windows', 'rooms'] as const;

/** The options as they run: TAGALL with no kind of label chosen places nothing, so it is off. */
export function effectiveOptions(options: AnnotationOptions): AnnotationOptions {
  const anyTag = TAG_PART_KEYS.some((k) => options.tagParts[k]);
  return { on: { ...options.on, tagall: options.on.tagall && anyTag }, tagParts: options.tagParts };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The presets of a project file; an entry that is not usable (no id, no name) is dropped, a switch that is missing is off. */
export function readAnnotationPresets(value: unknown): AnnotationPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((v): AnnotationPreset[] => {
    if (!isRecord(v) || typeof v.id !== 'string' || v.id === '' || seen.has(v.id) || typeof v.name !== 'string' || v.name.trim() === '') return [];
    seen.add(v.id);
    const on = isRecord(v.on) ? v.on : {};
    const parts = isRecord(v.tagParts) ? v.tagParts : {};
    return [{
      id: v.id,
      name: v.name,
      on: Object.fromEntries(COMMAND_ORDER.map((c) => [c, on[c] === true])) as Record<AnnotateCommand, boolean>,
      tagParts: Object.fromEntries(TAG_PART_KEYS.map((k) => [k, parts[k] === true])) as unknown as TagParts,
    }];
  });
}
