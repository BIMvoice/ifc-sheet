/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View templates through the library (#31), end to end on the project store: exported from one project, imported into another under
 * each clash policy. An import makes the templates available; it does not move a drawing onto one.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import type { ProjectLevel } from '@/project/types';
import { selectKinds, serializeCatalogue } from './catalogue-file.js';
import { importCatalogueText, projectCatalogue } from './catalogue-store.js';

const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
const template = (id: string, fill: string): ProjectViewTemplate => ({
  id, name: 'Plans', kind: 'plan', graphics: { styleRules: [{ id: `${id}-r`, by: 'class', match: ['IfcWall'], style: { lineWeight: 'heavy', fillColor: fill } }] },
});

beforeEach(() => resetProject());

describe('view templates in the library, on the project store', () => {
  it('export carries only the templates when only they are chosen, rules included', () => {
    useProjectStore.setState({ viewTemplates: [template('a', '#666666')] });
    const text = serializeCatalogue(selectKinds(projectCatalogue(), new Set(['viewTemplates'])), 'Office', new Date(0));
    const file = JSON.parse(text);
    assert.deepEqual(file.viewTemplates, [template('a', '#666666')]);
    assert.deepEqual(file.layers, []);
  });

  it('import adds the templates and moves no view onto them; the three policies follow the names', () => {
    useProjectStore.setState({ viewTemplates: [template('a', '#666666')] });
    const text = serializeCatalogue(selectKinds(projectCatalogue(), new Set(['viewTemplates'])), 'Office', new Date(0));

    resetProject();
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    const viewsBefore = useProjectStore.getState().views;
    const report = importCatalogueText(text, 'mine').report;
    assert.equal(report.viewTemplates.added, 1);
    assert.deepEqual(useProjectStore.getState().viewTemplates, [template('a', '#666666')]);
    assert.equal(useProjectStore.getState().views, viewsBefore, 'no drawing was reassigned');

    // The project's own "Plans" with another look: mine keeps it, theirs replaces it under its id, both keeps two.
    const own = template('own', '#111111');
    useProjectStore.setState({ viewTemplates: [own] });
    assert.deepEqual(importCatalogueText(text, 'mine').report.viewTemplates, { added: 0, kept: 1, replaced: 0, renamed: 0 });
    assert.deepEqual(useProjectStore.getState().viewTemplates, [own]);
    importCatalogueText(text, 'theirs');
    assert.deepEqual(useProjectStore.getState().viewTemplates?.map((t) => [t.id, t.graphics.styleRules?.[0].style.fillColor]), [['own', '#666666']]);
    useProjectStore.setState({ viewTemplates: [own] });
    importCatalogueText(text, 'both');
    assert.deepEqual(useProjectStore.getState().viewTemplates?.map((t) => t.name), ['Plans', 'Plans (2)']);
  });
});
