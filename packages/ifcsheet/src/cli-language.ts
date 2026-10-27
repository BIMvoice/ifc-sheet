/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one language resolver of the command line: the language a command writes its generated names (and, with `pac`, the
 * opis) in is the project's recorded language, else `--locale`, else Romanian for a PAC submission and English otherwise.
 * Both inputs are validated here, once: `--locale` is `ro` or `en` (anything else is a usage error), and a project's
 * `language` is read by the same `readProjectLanguage` the app's reader calls.
 */

import { nameLanguageOf, unknownLanguageMessage, unknownLocaleMessage, type NameLanguage } from './names.js';
import { PAC_DEFAULT_LOCALE } from './cli-pac.js';
import type { ProjectFacts } from './project-read.js';
import type { CliIo } from './cli-command.js';

/** The message for a `--locale` that is not `ro` or `en`, or undefined when it is one (or absent). */
export function localeProblem(locale: string | undefined): string | undefined {
  return locale === undefined || nameLanguageOf(locale) ? undefined : `ifcsheet: ${unknownLocaleMessage(locale)}\n`;
}

export interface ResolvedLanguage {
  language: NameLanguage;
  /** Lines for stderr, each ending in a newline: an ignored project `language`, a `--locale` the project overrides. */
  notes: string[];
}

export interface LanguageInputs {
  /** The project file as read; its `language` (or the unaccepted one it records) is the first choice. */
  project?: Pick<ProjectFacts, 'language' | 'unknownLanguage'>;
  /** `--locale`, already checked with {@link localeProblem}. */
  locale?: string;
  /** A PAC submission: Romanian by default, where every other command is English. The one place the default differs. */
  pac?: boolean;
}

/** `projectLanguage ?? --locale ?? (pac ? 'ro' : 'en')`; when the project and `--locale` disagree the project wins, and a note says so. */
export function resolveLanguage({ project, locale, pac = false }: LanguageInputs): ResolvedLanguage {
  const notes: string[] = [];
  if (project?.unknownLanguage !== undefined) notes.push(`ifcsheet: ${unknownLanguageMessage(project.unknownLanguage)}\n`);
  const asked = nameLanguageOf(locale);
  if (project?.language !== undefined) {
    if (asked !== undefined && asked !== project.language) notes.push(`ifcsheet: --locale ${asked} differs from the project's language ${project.language}; using ${project.language}.\n`);
    return { language: project.language, notes };
  }
  return { language: asked ?? (pac ? PAC_DEFAULT_LOCALE : 'en'), notes };
}

/** A command's language: {@link resolveLanguage} with its notes written to stderr. */
export function commandLanguage(inputs: LanguageInputs, io: CliIo): NameLanguage {
  const { language, notes } = resolveLanguage(inputs);
  for (const note of notes) io.stderr(note);
  return language;
}
