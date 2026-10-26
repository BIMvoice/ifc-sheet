/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the IFC export dialog (`ExportDialog.tsx` and its option parts), which the command palette's
 * "Exportă IFC" row opens over the IfcSheet face. Schema codes (IFC2X3, IFC4, IFC4X3, IFC5), IFCX and file
 * extensions stay as they are. Term choices: `../ro-glossary.md`.
 */
export const exportDialogRo = {
  'exportDialog.trigger': 'Exportă IFC',
  'exportDialog.title': 'Exportul fișierului IFC',
  'exportDialog.description.ifc5': 'Exportă datele și geometria modelului, inclusiv poziționarea curentă din spațiul de lucru',
  'exportDialog.description.default': 'Exportă coordonatele modelului așa cum au fost create și modificările de proprietăți. Repoziționarea din spațiul de lucru se salvează separat.',
  'exportDialog.scopeLabel': 'Domeniu',
  'exportDialog.scope.single': 'Un singur model',
  'exportDialog.scope.merged': 'Îmbinat (toate modelele)',
  'exportDialog.mixedUnitsLabel': 'Unități diferite',
  'exportDialog.unitReconciliation.auto': 'Păstrează fiecare unitate (proiecte separate)',
  'exportDialog.unitReconciliation.normalize': 'Normalizează la primul model',
  'exportDialog.unitReconciliation.assumeShared': 'Presupune o unitate comună',
  'exportDialog.modelLabel': 'Model',
  'exportDialog.selectModelPlaceholder': 'Alegeți modelul',
  'exportDialog.schemaLabel': 'Schemă',
  'exportDialog.schemaOption.ifc5Alpha': 'IFC5 (Alpha)',
  'exportDialog.currentSchemaSuffix': ' (curentă)',
  'exportDialog.schemaUpgradeTitle': 'Trecere la o schemă mai nouă',
  'exportDialog.schemaDowngradeTitle': 'Trecere la o schemă mai veche',
  'exportDialog.conversionSummary': 'Conversie din {source} în {target}.',
  'exportDialog.schemaDowngradeNote': 'La conversia într-o schemă mai veche se pot pierde date.',
  'exportDialog.schemaUpgradeNote': 'Tipurile de entități vor fi transpuse în schema mai nouă.',
  'exportDialog.outputLabel': 'Rezultat',
  'exportDialog.visibleOnlyLabel': 'Exportă doar ce este vizibil',
  'exportDialog.visibleOnlyHint': 'Include doar entitățile vizibile acum în vederea 3D',
  'exportDialog.includeGeometryLabel': 'Include geometria',
  'exportDialog.applyMutationsLabel': 'Aplică modificările de proprietăți',
  'exportDialog.changesOnlyLabel.default': 'Doar modificările (diferențe JSON)',
  'exportDialog.changesOnlyLabel.ifc5': 'Doar modificările (suprapunere IFCX)',
  'exportDialog.changesOnlyHint.ifc5': 'Exportă ca suprapunere IFCX, doar cu modificările',
  'exportDialog.changesOnlyHint.default': 'Exportă modificările ca diferențe JSON',
  'exportDialog.onlyKnownPropertiesLabel': 'Doar proprietățile IFC5 cunoscute',
  'exportDialog.onlyKnownPropertiesHint': 'Omite proprietățile fără o schemă IFC5 oficială (evită avertismentele din vizualizatoare)',
  'exportDialog.pendingChangesTitle': 'Modificări în așteptare',
  'exportDialog.pendingChangesDescription': {
    one: 'O entitate a fost modificată',
    few: '{countDisplay} entități au fost modificate',
    other: '{countDisplay} de entități au fost modificate',
  },
  'exportDialog.progressCount': '{processed} / {total} entități',
  'exportDialog.resultSuccessTitle': 'Reușit',
  'exportDialog.resultErrorTitle': 'Eroare',
  'exportDialog.cancelButton': 'Anulare',
  'exportDialog.exportingLabel': 'Se exportă...',
  'exportDialog.exportButton': 'Exportă',
  'exportDialog.landXml.title': 'LandXML nu poate fi exportat ca IFC',
  'exportDialog.landXml.description': 'Înregistrările de teren rămân în formatul sursă original; la export nu se creează entități IFC.',
  'exportDialog.landXml.error': 'LandXML este geometrie sursă, nu IFC. Exportați în schimb fișierul LandXML original.',
  'exportDialog.landXml.downloadSource': 'Descarcă LandXML original',
  'exportDialog.landXml.sourceUnavailable': 'Fișierul original nu mai este păstrat în memorie, deci nu poate fi salvat din nou de aici. Deschideți-l din nou pentru a exporta sursa.',
  'exportDialog.landXml.convertTitle': 'LandXML va fi convertit în IFC4X3',
  'exportDialog.landXml.convertSurfaces': {
    one: 'o suprafață de teren',
    few: '{count} suprafețe de teren',
    other: '{count} de suprafețe de teren',
  },
  'exportDialog.landXml.convertPoints': {
    one: 'un punct topografic',
    few: '{count} puncte topografice',
    other: '{count} de puncte topografice',
  },
  'exportDialog.landXml.convertAlignments': {
    one: 'un traseu',
    few: '{count} trasee',
    other: '{count} de trasee',
  },
  'exportDialog.landXml.convertSummary': 'Este o conversie derivată într-un singur sens, nu un circuit dus-întors. Se vor scrie: {records}.',
  'exportDialog.landXml.excludedTitle': 'Nu intră în IFC',
  'exportDialog.landXml.assumedUnit': 'Coordonatele sunt scalate cu o unitate liniară presupusă ({unit}), nu cu una declarată de sursă. Geometria are o scară aleasă de operator.',
  'exportDialog.landXml.missingCrs': 'Nu este declarat niciun sistem de referință de coordonate, deci nu se scrie georeferențierea și verificarea ordinii coordonatelor nu poate rula.',
  'exportDialog.landXml.declaredCrs': 'Georeferențierea se scrie pentru sistemul de referință declarat ({crs}), dar verificarea ordinii coordonatelor nu poate rula: ifc-lite nu poate determina limitele de coordonate ale unui sistem de referință. O sursă ale cărei puncte au fost scrise cu estul primul produce o suprafață în oglindă care se afișează totuși, deci verificați sursa înainte de a vă baza pe poziție.',
  'exportDialog.landXml.mergedUnsupported': 'Transpunerea LandXML convertește un fișier într-un model IFC4X3 de sine stătător; nu poate face parte dintr-un export îmbinat. Treceți domeniul pe un singur model pentru a-l converti.',
  'exportDialog.landXml.schemaUnsupported': 'Transpunerea LandXML produce doar IFC4X3 STEP. Alegeți IFC4X3 pentru a converti acest model sau exportați fișierul LandXML original.',
  'exportDialog.landXml.exported': 'Convertit în IFC4X3: {records}.',
  'exportDialog.notReadyError': 'Alegeți un model și o schemă înainte de export.',
  'exportDialog.landXml.imageryExported': 'Imaginea suprapusă este aplicată ca textură pe teren și însoțește IFC-ul ca {entry}, într-un .ifcZIP.',
  'exportDialog.landXml.imageryRefused': 'Imaginea suprapusă nu a fost exportată: {reason}',
  'exportDialog.landXml.imageryWillExport': 'Imaginea suprapusă {name} ({crs}) va fi aplicată ca textură pe teren și va însoți IFC-ul într-un .ifcZIP. {percent} % din vârfurile terenului se află pe imagine; dincolo de ea, consumatorii IFC extind pixelii de la marginea imaginii în loc să arate culoarea plată a terenului.',
  'exportDialog.landXml.imageryAssumedUnit': 'Maparea texturii imaginii preia unitatea liniară presupusă ({unit}), ca orice altă coordonată din fișier.',
  'exportDialog.landXml.imageryTiles': 'Dalele de hartă suprapuse se văd doar în vizualizator și nu se exportă: octeții lor aparțin furnizorului, iar acoperirea lor depinde de nivelul de zoom.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
