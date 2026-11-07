/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What to annotate, as one person or tool says it (#707): `all`, a list of commands (`dimension,tag,level`; also their
 * drafting names `dimall`, `tagall`, `levelall`) or the name of an annotation preset the project saved (#497). The one reader
 * the command line (`--annotate=`) and the MCP tool share.
 */

import { ALL_TAG_PARTS, type TagParts } from '../tagall/types.js';
import { choicesFrom, type AnnotateChoices, type AnnotateCommand } from './choices.js';
import { effectiveOptions, type AnnotationPreset } from './presets.js';

const WORDS: Record<string, AnnotateCommand> = {
  dimension: 'dimall', dimensions: 'dimall', dim: 'dimall', dimall: 'dimall',
  tag: 'tagall', tags: 'tagall', tagall: 'tagall',
  level: 'levelall', levels: 'levelall', levelmark: 'levelall', levelmarks: 'levelall', levelall: 'levelall',
};

/** The words a command list is written in, one per command. */
export const ANNOTATE_WORDS = ['dimension', 'tag', 'level'] as const;

export interface AnnotateSpec {
  choices: AnnotateChoices;
  /** Which labels TAGALL places: a preset limits them; absent: every kind. */
  tagParts?: TagParts;
  /** The preset the spec named, when it did. */
  preset?: string;
}

const none = (): Record<AnnotateCommand, boolean> => ({ tagall: false, dimall: false, levelall: false });

/**
 * The commands `spec` asks for. `error` when a word is neither a command nor a preset of `presets`; a preset with nothing
 * switched on (or TAGALL with no kind of label) says so rather than annotating nothing silently.
 */
export function readAnnotateSpec(spec: string, presets: readonly AnnotationPreset[] = []): AnnotateSpec | { error: string } {
  const text = spec.trim();
  if (text === '' || text.toLowerCase() === 'all') return { choices: choicesFrom({ tagall: true, dimall: true, levelall: true }) };
  const words = text.split(/[,+\s]+/).filter(Boolean).map((w) => w.toLowerCase());
  if (words.every((w) => WORDS[w])) {
    const on = none();
    for (const w of words) on[WORDS[w]] = true;
    return { choices: choicesFrom(on) };
  }
  const preset = presets.find((p) => p.name.trim().toLowerCase() === text.toLowerCase());
  if (!preset) {
    const known = presets.map((p) => `"${p.name}"`);
    return { error: `"${spec}" is not all, a list of ${ANNOTATE_WORDS.join(', ')}, or a preset of the project${known.length > 0 ? ` (${known.join(', ')})` : ' (it has none)'}.` };
  }
  const options = effectiveOptions(preset);
  if (!Object.values(options.on).some(Boolean)) return { error: `The preset "${preset.name}" switches no command on.` };
  return { choices: choicesFrom(options.on), ...(options.on.tagall ? { tagParts: { ...ALL_TAG_PARTS, ...options.tagParts } } : {}), preset: preset.name };
}
