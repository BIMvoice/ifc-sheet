/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readClassificationMappings, type ClassificationMapping } from '@bimvoice/ifcsheet';
import { listField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The office's classification mappings (#89): class, type or material to the code of a system (Uniclass, OmniClass, its own). IfcSheet ships no code table; the office enters codes or imports a CSV. Also carried in a `.bvlib` library. */
    classificationMappings?: ClassificationMapping[];
  }
}

export const classificationMappingsField = listField('classificationMappings', (raw) => readClassificationMappings(raw.classificationMappings), { presentOnly: true });
