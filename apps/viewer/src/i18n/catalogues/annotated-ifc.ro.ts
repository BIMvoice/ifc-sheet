/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the annotated copy of the IFC (`annotated-ifc.en.ts`). Term choices: `../ro-glossary.md`. */
export const annotatedIfcRo = {
  'annotatedIfc.action': 'Exportă IFC cu adnotări',
  'annotatedIfc.hint': 'Scrie o copie a IFC-ului așa cum a fost încărcat, cu adnotările planurilor: o adnotare pe plan, la nivelul lui, iar marcajul unui element ca set de proprietăți IfcSheet_Annotation, unde eticheta (Tag) nu îl spune deja. Secțiunile și fațadele nu se scriu. Fișierul deschis nu se modifică.',
  'annotatedIfc.kind.section': 'secțiune',
  'annotatedIfc.kind.elevation': 'fațadă',
  'annotatedIfc.kind.other': 'vedere',
  'annotatedIfc.msg.noModel': 'Nu este deschis niciun model IFC din care să se facă o copie.',
  'annotatedIfc.msg.nothing': 'Nimic de scris: niciun plan nu are adnotări pe un nivel al modelului deschis.',
  'annotatedIfc.msg.done': '{model}: {views} planuri și {marks} marcaje scrise în {name}. Fișierul deschis nu s-a modificat.',
  'annotatedIfc.msg.files': 'Copii adnotate: {count} fișiere în {name}.',
  'annotatedIfc.msg.viewLeftOut': 'Nescris: {view} este o {kind}, și se scriu doar planurile.',
  'annotatedIfc.msg.noStorey': 'Nescris: nivelul din {view} nu este în modelul deschis.',
  'annotatedIfc.msg.storeyFrame': 'Nescris: nivelul din {view} din {model} nu este așezat orizontal, deci punctele lui nu au un plan pe care să cadă.',
  'annotatedIfc.msg.hatches': '{count} hașuri nu s-au scris: o hașură este o umplere, nu o linie.',
  'annotatedIfc.msg.marksMissing': '{count} marcaje nu s-au scris: elementul nu este în modelul deschis.',
  'annotatedIfc.msg.failed': '{model} nu a putut fi scris: {reason}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
