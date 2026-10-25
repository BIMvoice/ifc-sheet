/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The office classification in a list (#351). The Lists engine (`@ifc-lite/lists`) knows no mappings: a column of source
 * `officeClassification` asks the provider (`getOfficeClassification`). This makes that answer, from the one function every other surface
 * uses (`classificationOf`, #89), so a list, a type schedule, a tag and the command line cannot disagree.
 *
 * The part of the provider it needs is described here, not imported, so the app's providers and the headless one both take it.
 */

import { classificationOf, mappingsFor, type ClassificationMapping, type ClassificationModel } from './classification.js';

/** What the office classification is resolved with: the project's mappings and the model's own references. */
export interface ListClassificationContext {
  mappings: readonly ClassificationMapping[];
  model: ClassificationModel;
}

/** The accessors of a Lists provider that say what an element is (all are the engine's own). */
export interface ClassifiableListProvider {
  getEntityTypeName(expressId: number): string;
  getEntityDefiningTypeName?(expressId: number): string;
  getMaterialNames?(expressId: number): string[];
}

/** The accessor the Lists engine reads for the column. */
export interface OfficeClassificationAccessor {
  getOfficeClassification(expressId: number, mappingId?: string): { code: string; title: string } | null;
}

/**
 * `provider` with `getOfficeClassification` added: for an element of model `modelId`, `classificationOf` over the mapping the column names
 * (`mappingId`; absent, the project's first, as tags do) and the model's own references. The provider is not changed.
 */
export function withOfficeClassification<P extends ClassifiableListProvider>(provider: P, modelId: string, context: ListClassificationContext): P & OfficeClassificationAccessor {
  // A Code column and a Title column ask about the same element: one answer each.
  const answers = new Map<string, { code: string; title: string } | null>();
  const getOfficeClassification = (expressId: number, mappingId?: string): { code: string; title: string } | null => {
    const key = `${mappingId ?? ''}|${expressId}`;
    const known = answers.get(key);
    if (known !== undefined) return known;
    const mappings = mappingId ? mappingsFor(context.mappings, mappingId) : context.mappings.slice(0, 1);
    const found = classificationOf(
      {
        className: provider.getEntityTypeName(expressId),
        typeName: provider.getEntityDefiningTypeName?.(expressId) || null,
        materials: provider.getMaterialNames?.(expressId) ?? [],
        modelId, expressId,
      },
      mappings, context.model,
    );
    const answer = found ? { code: found.code, title: found.title } : null;
    answers.set(key, answer);
    return answer;
  };
  return Object.assign(Object.create(provider) as P, { getOfficeClassification });
}
