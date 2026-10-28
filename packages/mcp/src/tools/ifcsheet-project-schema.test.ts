/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The schema of the project file (#165) held to the engine's own types: every property the TypeScript interfaces declare is in the
 * schema and the schema lists no property the interfaces lack, so a field added to the engine cannot be left out of the resource.
 * That a saved project validates, and a corrupt one does not, is in `ifcsheet-resources.test.ts` (it needs a real set).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from '@bimvoice/ifcsheet';
import { projectSchema } from './ifcsheet-project-schema.js';
import { SCHEDULES_KEY } from './ifcsheet-project-file.js';

const ENGINE_SRC = ['document.ts', 'view-3d-types.ts'].map((f) => fileURLToPath(new URL(`../../../ifcsheet/src/${f}`, import.meta.url)));
const sources = ENGINE_SRC.map((file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true));

/** The property names an interface declares, with those of the interfaces it extends. */
function interfaceKeys(name: string): string[] {
  for (const source of sources) {
    for (const node of source.statements) {
      if (!ts.isInterfaceDeclaration(node) || node.name.text !== name) continue;
      const own = node.members.flatMap((m) => (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? [m.name.text] : []));
      const parents = (node.heritageClauses ?? []).flatMap((h) => h.types.map((t) => t.expression.getText(source)));
      return [...new Set([...own, ...parents.flatMap(interfaceKeys)])];
    }
  }
  throw new Error(`interface ${name} not found in ${ENGINE_SRC.join(', ')}`);
}

type Node = { properties?: Record<string, Node>; items?: Node };
const schema = projectSchema() as Node;
const keysOf = (node: Node | undefined): string[] => Object.keys(node?.properties ?? {}).sort();
const viewKeys = [...new Set(['ProjectViewBase', 'PlanProjectView', 'SectionProjectView', 'ElevationProjectView', 'ThreeDProjectView', 'DraftingProjectView'].flatMap(interfaceKeys))].sort();

describe('the project schema against the engine\'s types', () => {
  it('has the properties of ProjectDocument, besides the file\'s own (format, version, savedAt, schedules)', () => {
    const own = ['format', 'version', 'savedAt', SCHEDULES_KEY];
    expect(keysOf(schema).filter((k) => !own.includes(k))).toEqual(interfaceKeys('ProjectDocument').sort());
  });
  it.each([
    ['ProjectSheet', () => schema.properties!.sheets.items],
    ['SheetViewport', () => schema.properties!.sheets.items!.properties!.viewports.items],
    ['ProjectLevel', () => schema.properties!.views.items!.properties!.level],
    ['SectionProjectPlane', () => schema.properties!.views.items!.properties!.plane],
    ['ProjectModelRef', () => schema.properties!.models.items],
    ['NumberingScheme', () => schema.properties!.sheetNumbering],
  ])('has the properties of %s', (name, node) => {
    expect(keysOf(node())).toEqual(interfaceKeys(name).sort());
  });
  it('has the properties of every view kind', () => {
    expect(keysOf(schema.properties!.views.items)).toEqual(viewKeys);
  });
  it('names the format and version the engine reads', () => {
    const p = schema.properties as unknown as Record<string, { const?: string; maximum?: number }>;
    expect(p.format.const).toBe(PROJECT_FILE_FORMAT);
    expect(p.version.maximum).toBe(PROJECT_FILE_VERSION);
  });
});
