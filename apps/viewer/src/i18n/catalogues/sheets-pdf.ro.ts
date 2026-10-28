/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the to-scale 3D-view PDF export dialog (`PdfViewExportDialog.tsx` and its appearance and page
 * notices), which the command palette's "Exportă PDF" row opens. The sheet-setup and title-block editor keys
 * (`sheetsPdf.sheetSetup.*`, `sheetsPdf.titleBlock.*`) belong to panels the face hides and stay English.
 * Term choices: `../ro-glossary.md`.
 */
export const sheetsPdfRo = {
  'sheetsPdf.pdfView.appearanceLabel': 'Aspect',
  'sheetsPdf.pdfView.shadedOption': 'Suprafețe umbrite',
  'sheetsPdf.pdfView.lineWorkOption': 'Doar linii',
  'sheetsPdf.pdfView.appearanceNoteShaded': 'Suprafețele se tipăresc în culorile modelului, umbrite așa cum le arată vederea 3D. Liniile de deasupra rămân vectoriale, deci planșa poate fi în continuare măsurată.',
  'sheetsPdf.pdfView.appearanceNoteLineWork': 'Doar linii monocrome. Fără umpleri, materiale, texturi sau nori de puncte.',
  'sheetsPdf.pdfView.shadingResolution': 'Rezoluția umbririi: {dpi} dpi.',
  'sheetsPdf.pdfView.shadingResolutionCapped': 'Rezoluția umbririi: {dpi} dpi (redusă de la {maxDpi} ca imaginea să încapă în limitele de memorie). Liniile rămân vectoriale și exacte.',
  'sheetsPdf.pdfView.hiddenEdgesLabel': 'Arată muchiile ascunse ca linii întrerupte',
  'sheetsPdf.pdfView.hiddenEdgesNoteShaded': 'Muchiile ascunse se aplică modului doar linii. Imaginea umbrită ascunde deja suprafețele acoperite.',
  'sheetsPdf.pdfView.hiddenEdgesNoteOn': 'Muchiile aflate în spatele altei geometrii se tipăresc ca linii întrerupte.',
  'sheetsPdf.pdfView.hiddenEdgesNoteOff': 'Se tipăresc doar muchiile pe care le puteți vedea efectiv.',
  'sheetsPdf.pdfView.scaleStampLabel': 'Tipărește pe planșă o riglă de scară și scara',
  'sheetsPdf.pdfView.scaleStampNoteOn': 'O riglă de scară și textul „Scara {scaleLabel}” se tipăresc într-o bandă sub desen, ceea ce face pagina puțin mai înaltă. Rigla este desenată la scară, deci rămâne corectă pe o fotocopie la care raportul tipărit nu mai e valabil.',
  'sheetsPdf.pdfView.scaleStampNoteOff': 'Planșa nu poartă o scară proprie. Procedați așa doar dacă ajunge într-un cartuș care indică scara, pentru că o tipăritură pe care nimeni nu o poate verifica îndeamnă la măsurare la o scară greșită.',

  'sheetsPdf.pdfView.exportPdfButton': 'Exportă PDF',
  'sheetsPdf.pdfView.dialogTitle': 'Exportă PDF (vedere 3D la scară)',
  'sheetsPdf.pdfView.dialogDescription': 'Salvează tot ce este vizibil acum, proiectat pe direcția vederii curente, la o scară exactă. Suprafețele umbrite sunt încorporate ca imagine plasată la dimensiunea exactă; toate liniile rămân vectoriale, deci măsurătorile luate de pe tipăritură sunt corecte.',
  'sheetsPdf.pdfView.scaleLabel': 'Scară',
  'sheetsPdf.pdfView.displayedScaleOption': 'Ca în vedere (aproximativ 1:{scale})',
  'sheetsPdf.pdfView.displayedScaleUnavailable': 'Ca în vedere (indisponibilă)',
  'sheetsPdf.pdfView.customOption': 'Personalizată',
  'sheetsPdf.pdfView.customScaleError': 'Introduceți un număr întreg mai mare ca zero, de exemplu 75.',
  'sheetsPdf.pdfView.sectionCutNote': 'Se aplică secțiunea activă. Muchiile tăiate se tipăresc cu o grosime mare de linie.',
  'sheetsPdf.pdfView.cancelButton': 'Anulare',
  'sheetsPdf.pdfView.exportingLabel': 'Se exportă...',
  'sheetsPdf.pdfView.exportButton': 'Exportă',
  'sheetsPdf.pdfView.exportPhasePreparing': 'Se pregătește',
  'sheetsPdf.pdfView.exportSuccessToast': 'PDF 1:{scale} exportat, pagina {width} x {height} mm',
  'sheetsPdf.pdfView.exportFailedWithMessage': 'Exportul PDF a eșuat: {message}',
  'sheetsPdf.pdfView.exportFailedGeneric': 'Exportul PDF a eșuat.',
  'sheetsPdf.pdfView.successTitle': 'Reușit',
  'sheetsPdf.pdfView.errorTitle': 'Eroare',

  'sheetsPdf.pdfView.pageReadoutFits': 'Pagină estimată: {width} x {height} mm (încape în {paperName}). Pagina exportată are dimensiunea desenului și nu va fi niciodată mai mare.',
  'sheetsPdf.pdfView.pageReadoutOversizeIso': 'Pagină estimată: {width} x {height} mm (mai mare decât orice format ISO). Pagina exportată are dimensiunea desenului și nu va fi niciodată mai mare.',
  'sheetsPdf.pdfView.pageReadoutUnavailable': 'Dimensiunea paginii nu este încă disponibilă. Încărcați un model și alegeți o scară validă.',
  'sheetsPdf.pdfView.oversizeTitle': 'Pagina este prea mare pentru tipărire',
  'sheetsPdf.pdfView.oversizeDescription': 'Această scară cere o pagină de {width} x {height} mm. O pagină PDF nu poate depăși {maxDimension} mm pe o latură. Alegeți o scară mai mică.',
  'sheetsPdf.pdfView.perspectiveTitle': 'Cameră în perspectivă',
  'sheetsPdf.pdfView.perspectiveDescription': 'PDF-ul este o proiecție ortogonală (paralelă) pe direcția vederii curente, deci obiectele apropiate și îndepărtate se tipăresc la aceeași scară. Doar așa poate o planșă tipărită să poarte o singură scară. Treceți pe cameră ortogonală pentru a vedea aceeași proiecție paralelă pe ecran.',
  'sheetsPdf.pdfView.switchToOrthographicButton': 'Treceți camera pe ortogonal',
  'sheetsPdf.pdfView.orthographicNote': 'Cameră ortogonală, deci scara tipărită este exactă. Planșa cuprinde tot ce este vizibil acum, nu doar partea încadrată pe ecran: panoramarea și zoom-ul schimbă ce priviți, nu ce se tipărește.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
