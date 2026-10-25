/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readBoqArticles, type BoqArticle } from '@bimvoice/ifcsheet';
import { listField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The bill of quantities' mapping table: type, material or class (with a property filter) to the office's article code, unit and formula (`boq/`). Empty until the office enters its own; also carried in a `.bvlib` library. */
    boqArticles?: BoqArticle[];
  }
}

export const boqArticlesField = listField('boqArticles', (raw) => readBoqArticles(raw.boqArticles), { presentOnly: true });
