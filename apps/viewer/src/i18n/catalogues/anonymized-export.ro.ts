/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the "Exportă subansamblul anonimizat (selecția)" dialog (`anonymized-export/AnonymizedExportDialog.tsx`
 * and its four panels), which the command palette opens over the IfcSheet face. IFC class names, entity names and
 * relationship identifiers are model content and stay as they are. GUID and IFC stay as written. Term choices: `../ro-glossary.md`.
 */
export const anonymizedExportRo = {
  // AnonymizationOptionsPanel
  'anonymizedExport.options.heading': 'Anonimizare',
  'anonymizedExport.options.keepLabel': 'Păstrează',
  'anonymizedExport.options.anonymizeLabel': 'Anonimizează',
  'anonymizedExport.options.toggleAriaLabel': 'Anonimizează: {label}',
  'anonymizedExport.options.keptAsAuthored': 'păstrat așa cum a fost creat',
  'anonymizedExport.options.namesLabel': 'Nume',
  'anonymizedExport.options.namesEffect': 'Name, LongName, Description și Tag devin IfcType-n',
  'anonymizedExport.options.otherNamesLabel': 'Alte nume',
  'anonymizedExport.options.otherNamesEffect': 'ObjectType, stiluri, materiale, straturi, profile',
  'anonymizedExport.options.globalIdsLabel': 'GUID-uri',
  'anonymizedExport.options.globalIdsEffect': 'GlobalId-urile se regenerează',
  'anonymizedExport.options.propertySetsLabel': 'Seturi de proprietăți',
  'anonymizedExport.options.propertySetsEffect': 'Seturile de proprietăți și de cantități se elimină',
  'anonymizedExport.options.rootPlacementLabel': 'Poziția plasării rădăcinii',
  'anonymizedExport.options.rootPlacementEffect': 'Translația rădăcinii se anulează; rotația se păstrează',
  'anonymizedExport.options.georeferencingLabel': 'Georeferențiere și adrese',
  'anonymizedExport.options.georeferencingEffect': 'Conversia hărții, CRS, latitudinea și longitudinea, adresele se elimină',
  'anonymizedExport.options.currencyLabel': 'Monedă',
  'anonymizedExport.options.currencyEffect': 'IfcMonetaryUnit devine USD',

  // RelationTogglePanel
  'anonymizedExport.relations.heading': 'Extinde cu elementele înrudite',
  'anonymizedExport.relations.connectedAriaLabel': 'Elemente conectate',
  'anonymizedExport.relations.connectedDepthLabel': 'Conectate, adâncime',
  'anonymizedExport.relations.openingsLabel': 'Goluri',
  'anonymizedExport.relations.fillingsLabel': 'Umpleri și gazdă',
  'anonymizedExport.relations.aggregatesLabel': 'Agregări și imbricări (părinți/copii)',
  'anonymizedExport.relations.typeObjectsLabel': 'Obiecte de tip',
  'anonymizedExport.relations.materialsLabel': 'Materiale',
  'anonymizedExport.relations.propertySetsSourceLabel': 'Seturi de proprietăți (sursă)',

  // RelatedEntityList
  'anonymizedExport.relatedList.seedsLabel': 'Selecția inițială',
  'anonymizedExport.relatedList.groupLabel': '{relationship} ({role})',
  'anonymizedExport.relatedList.entityFallbackType': 'Entitate',
  'anonymizedExport.relatedList.toggleAllAriaLabel': 'Comută toate: {label}',
  'anonymizedExport.relatedList.lockedBadge': 'blocat',
  'anonymizedExport.relatedList.emptyState': 'Nu există încă entități de exportat.',

  // TypeCategoryBar
  'anonymizedExport.typeCategoryBar.heading': 'Categorii în export',
  'anonymizedExport.typeCategoryBar.clickToBlockHint': 'faceți clic pe o categorie pentru a o exclude',
  'anonymizedExport.typeCategoryBar.blockedClickToBlockHint': 'Excluse: {count} · faceți clic pe o categorie pentru a o exclude',
  'anonymizedExport.typeCategoryBar.unblockAriaLabel': 'Include din nou: {typeName}',
  'anonymizedExport.typeCategoryBar.blockAriaLabel': 'Exclude: {typeName}',
  'anonymizedExport.typeCategoryBar.alwaysIncludedTitle': 'Mereu inclusă (selecția sau lanțul spațial)',
  'anonymizedExport.typeCategoryBar.blockedTitle': 'Exclusă — faceți clic pentru a o include',
  'anonymizedExport.typeCategoryBar.includedTitle': 'Inclusă — faceți clic pentru a o exclude',

  // AnonymizedExportDialog
  'anonymizedExport.dialog.title': 'Exportul subansamblului anonimizat',
  'anonymizedExport.dialog.description': 'Obiectele evidențiate în vederea 3D din dreapta sunt cele exportate: orice semnal care identifică proiectul este eliminat, iar transformările locale sunt păstrate.',
  'anonymizedExport.dialog.otherModelSeedsExcluded': {
    one: 'Un obiect selectat din alte modele nu este inclus',
    few: '{count} obiecte selectate din alte modele nu sunt incluse',
    other: '{count} de obiecte selectate din alte modele nu sunt incluse',
  },
  'anonymizedExport.dialog.droppedOverlaySeedsExcluded': {
    one: 'Un obiect selectat, creat în această sesiune, nu are înregistrare sursă și nu poate fi inclus',
    few: '{count} obiecte selectate, create în această sesiune, nu au înregistrare sursă și nu pot fi incluse',
    other: '{count} de obiecte selectate, create în această sesiune, nu au înregistrare sursă și nu pot fi incluse',
  },
  'anonymizedExport.dialog.noSelectionPrompt': 'Selectați unul sau mai multe obiecte în vederea 3D, apoi redeschideți această fereastră.',
  'anonymizedExport.dialog.resultCount': {
    one: 'Rezultat: o entitate',
    few: 'Rezultat: {count} entități',
    other: 'Rezultat: {count} de entități',
  },
  'anonymizedExport.dialog.truncatedBadge': 'Trunchiat',
  'anonymizedExport.dialog.previewIn3dLabel': 'Previzualizare în 3D',
  'anonymizedExport.dialog.exportingStatus': 'Se exportă…',
  'anonymizedExport.dialog.successTitle': 'Reușit',
  'anonymizedExport.dialog.errorTitle': 'Eroare',
  'anonymizedExport.dialog.warningsSummary': {
    one: 'un avertisment',
    few: '{count} avertismente',
    other: '{count} de avertismente',
  },
  'anonymizedExport.dialog.fileNameLabel': 'Numele fișierului',
  'anonymizedExport.dialog.ifcExtensionSuffix': '.ifc',
  'anonymizedExport.dialog.cancelButton': 'Anulează',
  'anonymizedExport.dialog.exportingButton': 'Se exportă...',
  'anonymizedExport.dialog.exportButtonLabel': 'Exportă .ifc',
  'anonymizedExport.dialog.previewCaption': {
    one: 'Previzualizare 3D: se va exporta un obiect evidențiat',
    few: 'Previzualizare 3D: se vor exporta {count} obiecte evidențiate',
    other: 'Previzualizare 3D: se vor exporta {count} de obiecte evidențiate',
  },
  'anonymizedExport.dialog.modelDataUnavailableError': 'Datele modelului nu sunt disponibile pentru export',
  'anonymizedExport.dialog.exportedEntities': {
    one: 'S-a exportat o entitate',
    few: 'S-au exportat {count} entități',
    other: 'S-au exportat {count} de entități',
  },
  'anonymizedExport.dialog.exportedEntitiesWithWarnings': {
    one: 'S-a exportat o entitate ({warnings} avertismente)',
    few: 'S-au exportat {count} entități ({warnings} avertismente)',
    other: 'S-au exportat {count} de entități ({warnings} avertismente)',
  },
  'anonymizedExport.dialog.exportFailedMessage': 'Exportul a eșuat: {message}',
  'anonymizedExport.dialog.unknownError': 'Eroare necunoscută',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
