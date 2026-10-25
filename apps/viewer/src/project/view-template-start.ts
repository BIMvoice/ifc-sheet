/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { assignDefaultTemplates, defaultViewTemplates, freshProjectId, nameOf } from '@bimvoice/ifcsheet';
import { useProjectStore } from './project-store';

const state = () => useProjectStore.getState();

/**
 * The starting view templates (#44): a project that starts its set gets one per kind (Plans, Sections, Elevations) and the set's views follow them,
 * as the engine's starting set does (`generateDefaultSet`). A project that has a template of a kind keeps it; a view that has a template, or
 * has no kind a template is for, is left alone. The templates start empty, so nothing the views draw changes.
 */
export function ensureViewTemplates(): void {
  const have = state().viewTemplates ?? [];
  const made = defaultViewTemplates((kind) => nameOf(`names.viewTemplate.${kind}`), () => freshProjectId('viewtemplate')).filter((t) => !have.some((h) => h.kind === t.kind));
  const templates = [...have, ...made];
  const views = assignDefaultTemplates(state().views, templates);
  useProjectStore.setState({
    ...(made.length > 0 ? { viewTemplates: templates } : {}),
    ...(views.some((v, i) => v !== state().views[i]) ? { views } : {}),
    dirty: true,
  });
}
