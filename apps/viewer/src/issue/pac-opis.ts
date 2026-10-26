/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { pacOpisOf, type PacOpis, type ProjectSheet } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { effectiveTitleBlock } from '@/project/title-block-model';

/**
 * The opis page of the permit submission (#364) for the project as it stands and the `sheets` the PDF holds. The engine's
 * `pacOpisOf` makes it, the function the command line's `ifcsheet build --pac` calls too, so the two cannot differ: here
 * the project's name, views, title block and works come from the store.
 */
export function projectPacOpis(sheets: readonly ProjectSheet[], locale: string): PacOpis {
  const project = useProjectStore.getState();
  return pacOpisOf({ name: project.name, sheets, views: project.views, titleBlock: effectiveTitleBlock(), intervention: project.pacIntervention }, locale);
}
