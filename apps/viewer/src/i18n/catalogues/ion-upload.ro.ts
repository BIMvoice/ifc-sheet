/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the Cesium ion upload dialog (`CesiumIonExportDialog.tsx`), which the command palette's
 * "Încarcă în Cesium ion" row opens over the IfcSheet face. Cesium ion, assets:write, IFC, IFCX, IFCZIP,
 * LandXML and HTTP stay as they are. Term choices: `../ro-glossary.md`.
 */
export const ionUploadRo = {
  'ionUpload.title': 'Încărcare în Cesium ion',
  'ionUpload.description': 'Încărcați în contul dvs. Cesium ion un model IFC împreună cu modificările în așteptare. Sunt incluse toate proprietățile modelului.',
  'ionUpload.close': 'Închide',
  'ionUpload.upload': 'Încarcă',
  'ionUpload.uploading': 'Se încarcă…',
  'ionUpload.abort': 'Anulează încărcarea',
  'ionUpload.successTitle': 'Trimis la teselare',
  'ionUpload.errorTitle': 'Încărcarea nu s-a finalizat',
  'ionUpload.accepted': 'Cesium ion a acceptat încărcarea și o va diviza în dale. Deschideți resursa pentru a verifica progresul și poziționarea.',
  'ionUpload.cancelled': 'Încărcare anulată. Orice resursă deja creată rămâne în Cesium ion; o puteți șterge de acolo.',
  'ionUpload.failed': '{phase} a eșuat (HTTP {status}). {help}',
  'ionUpload.failure.authorization': 'Verificați în Cesium ion permisiunile jetonului și adresele permise înainte de a reîncerca.',
  'ionUpload.failure.conflict': 'Cesium ion a respins cererea de încărcare. Dacă și o nouă încercare eșuează, raportați această eroare împreună cu starea HTTP.',
  'ionUpload.failure.capacity': 'Verificați în Cesium ion planul contului, spațiul de stocare permis și dimensiunea încărcării înainte de a reîncerca.',
  'ionUpload.failure.rateLimit': 'Cesium ion limitează cererile. Așteptați înainte de a reîncerca.',
  'ionUpload.failure.service': 'Cesium ion nu a putut finaliza această cerere. Verificați starea serviciului înainte de a reîncerca.',
  'ionUpload.failure.request': 'Verificați conexiunea și resursa din Cesium ion înainte de a reîncerca. Este posibil ca încărcarea să nu se fi finalizat.',
  'ionUpload.exportWarnings': 'Pregătirea IFC a raportat {count} avertismente. Exportați IFC local și rezolvați-le înainte de încărcare.',
  'ionUpload.serializationFailed': 'IFC-ul modificat nu a putut fi pregătit. Încercați să exportați IFC local pentru a verifica modelul.',
  'ionUpload.texturesUnsupported': 'Acest model include resurse de imagine. Exportați IFCZIP local pentru a păstra imaginile. Încărcarea directă a texturilor nu este încă acceptată.',
  'ionUpload.noModel': 'Încărcați un model IFC în format STEP pentru a-l putea încărca. IFCX și LandXML nu sunt acceptate.',
  'ionUpload.openAsset': 'Vedeți {name} în Cesium ion',
  'ionUpload.model': 'Model',
  'ionUpload.token': 'Jeton Cesium ion (assets:write)',
  'ionUpload.tokenHelp': 'Folosiți un jeton separat, cu permisiunea assets:write. Rămâne în memorie până la închiderea acestei ferestre și nu este salvat sau trimis către analiză.',
  'ionUpload.createToken': 'Creați un jeton',
  'ionUpload.placement': 'Încărcarea păstrează georeferențierea IFC. După teselare, verificați locația, orientarea și cota în Cesium ion. Pentru modelele fără georeferențiere, setați locația acolo.',
  'ionUpload.phase.serialize': 'Se pregătește IFC-ul modificat…',
  'ionUpload.phase.create': 'Se creează resursa…',
  'ionUpload.phase.upload': 'Se încarcă IFC-ul…',
  'ionUpload.phase.complete': 'Se pornește teselarea…',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
