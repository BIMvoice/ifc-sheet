/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for "Issue the set" (`issue.en.ts`). The command name ISSUE stays as typed. Term choices: `../ro-glossary.md`. */
export const issueRo = {
  'issue.cmd': 'ISSUE',
  'issue.section': 'Emite setul',
  'issue.name': 'Denumirea emiterii',
  'issue.pdf': 'Emite ca PDF',
  'issue.svgZip': 'SVG, arhivat',
  'issue.dxfZip': 'DXF, arhivat',
  'issue.csv': 'Listă de planșe (CSV)',
  'issue.listFirst': 'Lista de planșe ca primă pagină',
  'issue.list.title': 'Listă de planșe',
  'issue.list.issue': 'Emitere',
  'issue.list.date': 'Data',
  'issue.list.sheet': 'Planșa',
  'issue.list.sheetTitle': 'Titlu',
  'issue.list.scale': 'Scara',
  'issue.list.paper': 'Format',
  'issue.list.revision': 'Revizie',
  'issue.reason.empty': 'Planșa {number} este goală, deci nu intră în emitere.',
  'issue.msg.nothing': 'Nu e nimic de emis: nicio planșă nu are vreun desen.',
  'issue.msg.working': {
    one: 'Se emite o planșă. Planșa este deschisă pentru a fi desenată.',
    few: 'Se emit {count} planșe. Fiecare planșă este deschisă pe rând pentru a fi desenată.',
    other: 'Se emit {count} de planșe. Fiecare planșă este deschisă pe rând pentru a fi desenată.',
  },
  'issue.msg.done': {
    one: 'Emis „{name}” ({date}): o planșă, în format {format}. Emiterea este înregistrată în proiect.',
    few: 'Emis „{name}” ({date}): {count} planșe, în format {format}. Emiterea este înregistrată în proiect.',
    other: 'Emis „{name}” ({date}): {count} de planșe, în format {format}. Emiterea este înregistrată în proiect.',
  },
  'issue.msg.line': '{text}',
  'issue.msg.noCapture': 'Planșa {number} nu a putut fi desenată.',
  'issue.msg.viewError': 'Planșa {number}: desenul „{view}” nu a putut fi generat ({message}).',
  'issue.msg.viewTimeout': 'Planșa {number}: „{view}” nu a fost desenat în {seconds} secunde.',
  'issue.msg.notIssued': 'Nu s-a emis nimic și nu s-a înregistrat nimic.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
