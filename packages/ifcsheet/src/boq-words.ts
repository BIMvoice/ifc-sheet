/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of the bill of quantities' table and its refusals (#75), English and Romanian, the one copy: the app's catalogues
 * (`boq.en.ts`, `boq.ro.ts`) spread these, and the command line prints them. Templates take `{name}` parameters, so a language
 * keeps its own word order. Imports nothing, so a catalogue loads it without the parser.
 */

export const BOQ_WORDS_EN = {
  'boq.title': 'Bill of quantities',
  'boq.col.number': 'No.',
  'boq.col.code': 'Article code',
  'boq.col.description': 'Description',
  'boq.col.unit': 'Unit',
  'boq.col.quantity': 'Quantity',
  'boq.detail.noType': '{class} (no type)',
  'boq.note.missing': '{code}: {count} elements do not declare {quantity} and are left out of the quantity (not counted as zero).',
  'boq.note.allMissing': '{code}: {count} elements match, but none declares {quantity}; there is no quantity.',
  'boq.note.noMatch': '{code}: no element matches.',
  'boq.note.refused': '{code}: refused. {reason}',
  'boq.note.sharedMaterial': '{code}: {count} elements have other materials too; their whole quantity is counted.',
  'boq.problem.noCode': 'An article has no code.',
  'boq.problem.noSelector': '{code}: choose a type, a material or an IFC class.',
  'boq.problem.unknownQuantity': '{code}: "{quantity}" is not a quantity an article can take (for example NetVolume, NetSideArea, Length, Count).',
  'boq.problem.unitMismatch': '{code}: {quantity} gives {fits}, not {unit}. Change the unit to {fits} or choose a quantity in {unit}.',
  'boq.problem.badFactor': '{code}: the factor must be above zero.',
  'boq.problem.badWaste': '{code}: the waste must be between 0 and 100 %.',
} as const;

export const BOQ_WORDS_RO: Record<keyof typeof BOQ_WORDS_EN, string> = {
  'boq.title': 'Antemăsurătoare',
  'boq.col.number': 'Nr. crt.',
  'boq.col.code': 'Cod articol',
  'boq.col.description': 'Denumire',
  'boq.col.unit': 'U.M.',
  'boq.col.quantity': 'Cantitate',
  'boq.detail.noType': '{class} (fără tip)',
  'boq.note.missing': '{code}: {count} elemente nu declară {quantity} și sunt lăsate în afara cantității (nu sunt numărate ca zero).',
  'boq.note.allMissing': '{code}: {count} elemente corespund, dar niciunul nu declară {quantity}; nu există cantitate.',
  'boq.note.noMatch': '{code}: niciun element nu corespunde.',
  'boq.note.refused': '{code}: respins. {reason}',
  'boq.note.sharedMaterial': '{code}: {count} elemente au și alte materiale; cantitatea lor întreagă este numărată.',
  'boq.problem.noCode': 'Un articol nu are cod.',
  'boq.problem.noSelector': '{code}: alegeți un tip, un material sau o clasă IFC.',
  'boq.problem.unknownQuantity': '{code}: „{quantity}” nu este o cantitate pe care o poate lua un articol (de exemplu NetVolume, NetSideArea, Length, Count).',
  'boq.problem.unitMismatch': '{code}: {quantity} dă {fits}, nu {unit}. Schimbați unitatea în {fits} sau alegeți o cantitate în {unit}.',
  'boq.problem.badFactor': '{code}: factorul trebuie să fie mai mare decât zero.',
  'boq.problem.badWaste': '{code}: pierderile trebuie să fie între 0 și 100 %.',
};

export type BoqWordKey = keyof typeof BOQ_WORDS_EN;

/** Says a word: its template with the `{name}` parameters filled in. */
export type BoqSay = (key: BoqWordKey, params?: Record<string, string | number>) => string;

/** A template with its `{name}` parameters filled in; an unknown parameter stays as written. */
export function fillTemplate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function boqSayFor(locale: string): BoqSay {
  const words: Record<BoqWordKey, string> = /^ro\b/i.test(locale) ? BOQ_WORDS_RO : BOQ_WORDS_EN;
  return (key, params) => fillTemplate(words[key], params);
}
