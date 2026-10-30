/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the urban indicators schedule is printed with (#581), English and Romanian, under the keys of the app's catalogues
 * (`urban.*`: the table's headings, the rules printed under it, and the sentence saying where the site area came from). The app says
 * them through its own translation, `ifcsheet build` through `urbanSayFor`; a test in the app compares the two, so a sheet and its
 * PDF cannot word the table differently. `urbanLabelsOf` builds the labels for both. Imports no parser, so a catalogue may load it.
 */

import { fillTemplate } from './boq-words.js';
import type { EstimatedAreas } from './room-estimates.js';
import { sheetLevel, sheetNumber } from './sheet-number.js';
import type { SiteAreaChoice } from './site-area.js';
import type { SheetLocale } from './units-and-numbers.js';
import { signedLevel, type UrbanLabels } from './urban-layout.js';
import { CUT_BASEMENT_MAX_CLEAR_HEIGHT, type UrbanIndicators } from './urban-indicators.js';

export const URBAN_WORDS_EN = {
  'urban.level': 'Level',
  'urban.elevation': 'Level m',
  'urban.built': 'Built area m²',
  'urban.useful': 'Useful area m²',
  'urban.inCut': 'In CUT',
  'urban.yes': 'yes',
  'urban.no': 'no',
  'urban.category': 'Room category',
  'urban.area': 'Area m²',
  'urban.ac': 'Ac (built area)',
  'urban.ad': 'Ad (gross developed area, all levels)',
  'urban.adCut': 'Ad for CUT',
  'urban.au': 'Au (useful area)',
  'urban.site': 'Site area',
  'urban.pot': 'POT (Ac / site)',
  'urban.cut': 'CUT (Ad for CUT / site)',
  'urban.atLeast': '≥ {value}',
  'urban.belowGround': '{name} (basement)',
  'urban.ground': '{name} (Ac at {mark})',
  'urban.rule.areas': 'Ac: the built area at {mark}, on {level}. Ad: the built areas of all levels, basements included (STAS 4908-85).',
  'urban.rule.au': 'Au: every room (IfcSpace). Left out: {external} external (balconies, terraces), {gfa} area-scheme (GFA), {parents} split into rooms of their own.',
  'urban.rule.cut': 'Ad for CUT leaves out: {levels}. Law 350/2001 does not count basements with a clear height up to {limit} m, or used only for parking, technical rooms or civil protection. By default a basement up to {limit} m floor to floor is left out; the choice is made per level.',
  'urban.rule.cutNone': 'none',
  'urban.rule.ground': 'Basement: more than half the level\'s height below the terrain, at {terrain}. {mark} is model elevation {zero} ({source}).',
  'urban.rule.zero.assumed': 'not found in the model: taken at the lowest level, enter it if wrong',
  'urban.rule.zero.building': 'the building\'s reference elevation',
  'urban.rule.zero.model': 'from the storeys',
  'urban.rule.zero.user': 'entered',
  'urban.rule.auEstimated': 'Au includes {count} rooms whose area the model does not state: they are measured from their geometry (≈ {area} m², {share} % of Au) and may be wrong under sloped ceilings: {list}.',
  'urban.assumedInterior': 'No slab or room on {levels}: every enclosed space there was counted as built.',
  'urban.unmeasured': 'Ac/Ad may be low: {count} element(s) on {level} could not be measured.',
  'urban.siteSource.model': 'Site area: the model\'s IfcSite area; no plot boundary is drawn on the site plan.',
  'urban.siteSource.none': 'No plot boundary is drawn on the site plan and no site area is given: POT and CUT are not computed.',
  'urban.siteSource.plot': 'Site area: measured on the plot boundary drawn on the site plan. A site area typed in the project overrides it.',
  'urban.siteSource.typed': 'Site area: typed in the project. It overrides the plot boundary drawn on the site plan ({plot} m²).',
  'urban.siteSource.typedNoPlot': 'Site area: typed in the project; no plot boundary is drawn on the site plan.',
} as const;

export type UrbanWordKey = keyof typeof URBAN_WORDS_EN;

export const URBAN_WORDS_RO: Record<UrbanWordKey, string> = {
  'urban.level': 'Nivel',
  'urban.elevation': 'Cota m',
  'urban.built': 'Arie construită m²',
  'urban.useful': 'Arie utilă m²',
  'urban.inCut': 'În CUT',
  'urban.yes': 'da',
  'urban.no': 'nu',
  'urban.category': 'Categoria încăperii',
  'urban.area': 'Arie m²',
  'urban.ac': 'Ac (aria construită)',
  'urban.ad': 'Ad (aria desfășurată, toate nivelurile)',
  'urban.adCut': 'Ad pentru CUT',
  'urban.au': 'Au (aria utilă)',
  'urban.site': 'Suprafața terenului',
  'urban.pot': 'POT (Ac / teren)',
  'urban.cut': 'CUT (Ad pentru CUT / teren)',
  'urban.atLeast': '≥ {value}',
  'urban.belowGround': '{name} (subsol)',
  'urban.ground': '{name} (Ac la {mark})',
  'urban.rule.areas': 'Ac: aria construită la {mark}, pe {level}. Ad: ariile construite ale tuturor nivelurilor, inclusiv subsolurile (STAS 4908-85).',
  'urban.rule.au': 'Au: toate încăperile (IfcSpace). Excluse: {external} exterioare (balcoane, terase), {gfa} din schema de arii (GFA), {parents} împărțite în încăperi proprii.',
  'urban.rule.cut': 'Ad pentru CUT exclude: {levels}. Legea 350/2001 nu include subsolurile cu înălțimea liberă de cel mult {limit} m sau folosite numai pentru parcare, încăperi tehnice ori protecție civilă. Implicit, un subsol de cel mult {limit} m între pardoseli este exclus; alegerea se face pe fiecare nivel.',
  'urban.rule.cutNone': 'niciunul',
  'urban.rule.ground': 'Subsol: mai mult de jumătate din înălțimea nivelului se află sub teren, la {terrain}. {mark} este cota {zero} a modelului ({source}).',
  'urban.rule.zero.assumed': 'negăsită în model: luată la cel mai de jos nivel, introduceți-o dacă este greșită',
  'urban.rule.zero.building': 'cota de referință a clădirii',
  'urban.rule.zero.model': 'din niveluri',
  'urban.rule.zero.user': 'introdusă',
  'urban.rule.auEstimated': 'Au include {count} încăperi a căror arie nu este dată de model: sunt măsurate din geometrie (≈ {area} m², {share} % din Au) și pot fi greșite sub plafoane înclinate: {list}.',
  'urban.assumedInterior': 'Fără planșeu sau încăpere la {levels}: tot spațiul închis de acolo a fost socotit construit.',
  'urban.unmeasured': 'Ac/Ad pot fi subestimate: {count} element(e) de la {level} nu au putut fi măsurate.',
  'urban.siteSource.model': 'Suprafața terenului: aria IfcSite din model; pe planul de situație nu este desenată nicio limită a terenului.',
  'urban.siteSource.none': 'Pe planul de situație nu este desenată nicio limită a terenului și nu este dată nicio suprafață a terenului: POT și CUT nu se calculează.',
  'urban.siteSource.plot': 'Suprafața terenului: măsurată pe limita terenului desenată pe planul de situație. O suprafață introdusă în proiect o înlocuiește.',
  'urban.siteSource.typed': 'Suprafața terenului: introdusă în proiect. Înlocuiește limita terenului desenată pe planul de situație ({plot} m²).',
  'urban.siteSource.typedNoPlot': 'Suprafața terenului: introdusă în proiect; pe planul de situație nu este desenată nicio limită a terenului.',
};

/** Says a word of the urban table, its `{name}` slots filled from `params`. */
export type UrbanSay = (key: UrbanWordKey, params?: Record<string, string | number>) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function urbanSayFor(language: string): UrbanSay {
  const words: Record<UrbanWordKey, string> = /^ro\b/i.test(language) ? URBAN_WORDS_RO : URBAN_WORDS_EN;
  return (key, params) => fillTemplate(words[key], params);
}

/** Where the site area came from, in words: one sentence for every table that prints it. */
export function siteSourceNote(say: UrbanSay, locale: SheetLocale, site: SiteAreaChoice): string {
  if (site.source === 'typed') {
    return site.plot === null ? say('urban.siteSource.typedNoPlot') : say('urban.siteSource.typed', { plot: sheetNumber(locale, site.plot) });
  }
  return say(`urban.siteSource.${site.source ?? 'none'}`);
}

/** What of the measured areas the labels mention: the levels taken as built, the spaces left out of Au and the rooms measured from their geometry. */
export interface UrbanLabelFacts {
  assumedInterior: readonly string[];
  spacesLeftOut: { external: number; gfa: number; parents: number };
  estimated: EstimatedAreas | null;
}

/** The schedule's labels; `site`, when given, adds the line saying where the site area came from. The one build both hosts use. */
export function urbanLabelsOf(say: UrbanSay, locale: SheetLocale, title: string, areas: UrbanLabelFacts | null, site?: SiteAreaChoice): UrbanLabels {
  const assumed = areas?.assumedInterior.join(', ') ?? '';
  const leftOut = areas?.spacesLeftOut ?? null;
  // The figures inside a sentence are written like every other figure on the sheet: a literal "±0.00" or "1.80" would keep its point under a comma project.
  const mark = sheetLevel(locale, 0);
  const limit = sheetNumber(locale, CUT_BASEMENT_MAX_CLEAR_HEIGHT, 2, { group: false });
  const estimated = areas?.estimated ?? null;
  return {
    locale,
    title,
    level: say('urban.level'), elevation: say('urban.elevation'), built: say('urban.built'), useful: say('urban.useful'),
    inCut: say('urban.inCut'), yes: say('urban.yes'), no: say('urban.no'),
    belowGround: (name: string) => say('urban.belowGround', { name }),
    ground: (name: string) => say('urban.ground', { name, mark }),
    category: say('urban.category'), area: say('urban.area'),
    ac: say('urban.ac'), ad: say('urban.ad'), adCut: say('urban.adCut'), au: say('urban.au'), site: say('urban.site'), pot: say('urban.pot'), cut: say('urban.cut'),
    rules: (r: UrbanIndicators) => {
      const left = r.storeys.filter((s) => !s.inCut).map((s) => s.name);
      const out = [
        say('urban.rule.areas', { mark, level: r.storeys.find((s) => s.ground)?.name ?? '—' }),
        say('urban.rule.cut', { limit, levels: left.length ? left.join(', ') : say('urban.rule.cutNone') }),
        say('urban.rule.ground', { mark, terrain: signedLevel(locale, r.terrainLevel), zero: sheetNumber(locale, r.zero.elevation, 2, { group: false }), source: say(`urban.rule.zero.${r.zero.source}`) }),
      ];
      if (estimated) out.push(say('urban.rule.auEstimated', { count: estimated.count, area: sheetNumber(locale, estimated.area, 1, { kind: 'area' }), share: sheetNumber(locale, estimated.share, 0), list: estimated.rooms.map((room) => room.name).join(', ') }));
      if (leftOut) out.push(say('urban.rule.au', { external: leftOut.external, gfa: leftOut.gfa, parents: leftOut.parents }));
      if (site) out.push(siteSourceNote(say, locale, site));
      return out;
    },
    note: assumed ? say('urban.assumedInterior', { levels: assumed }) : '',
    atLeast: (value: string) => say('urban.atLeast', { value }),
    unmeasured: (count: number, level: string) => say('urban.unmeasured', { count, level }),
  };
}
