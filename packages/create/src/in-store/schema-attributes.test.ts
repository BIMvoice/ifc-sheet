/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSchemaRegistryForVersion, type SchemaRegistry } from '@ifc-lite/parser';
import { canonicalEntity, conformsTo, schemaRegistry } from './schema-attributes.js';

const SCHEMAS = ['IFC2X3', 'IFC4', 'IFC4X3'] as const;

/** What `canonicalEntity` answered before it was indexed: a scan of the entity names. */
const scan = (registry: SchemaRegistry, type: string) =>
  Object.keys(registry.entities).find((name) => name.toUpperCase() === type.toUpperCase()) ?? null;

afterEach(() => vi.restoreAllMocks());

describe('canonicalEntity', () => {
  it('answers as a scan of the entity names, for every class of every authoring schema, in any case', () => {
    for (const schema of SCHEMAS) {
      const registry = getSchemaRegistryForVersion(schema);
      for (const name of Object.keys(registry.entities)) {
        for (const asked of [name, name.toUpperCase(), name.toLowerCase()]) expect(canonicalEntity(registry, asked)).toBe(scan(registry, asked));
      }
      expect(canonicalEntity(registry, 'IfcNoSuchClass')).toBeNull();
    }
  });

  it('keeps the first spelling of two names that differ only in case, as the scan did', () => {
    const registry = { name: 'TEST', entities: { IfcWall: {}, IFCWALL: {} }, types: {}, selects: {} } as unknown as SchemaRegistry;
    expect(canonicalEntity(registry, 'ifcwall')).toBe('IfcWall');
  });

  it('indexes each entity table by itself: another registry gets its own names', () => {
    const a = { name: 'A', entities: { IfcWall: {} }, types: {}, selects: {} } as unknown as SchemaRegistry;
    const b = { name: 'B', entities: { IfcSlab: {} }, types: {}, selects: {} } as unknown as SchemaRegistry;
    expect(canonicalEntity(a, 'IFCWALL')).toBe('IfcWall');
    expect(canonicalEntity(b, 'IFCWALL')).toBeNull();
    expect(canonicalEntity(b, 'IFCSLAB')).toBe('IfcSlab');
  });

  it('lists the entity names once, not on every lookup (#154)', () => {
    const registry = schemaRegistry('IFC4', 'test');
    canonicalEntity(registry, 'IfcWall');
    const keys = vi.spyOn(Object, 'keys');
    for (let i = 0; i < 100; i++) {
      expect(canonicalEntity(registry, 'IFCMATERIALLAYERSET')).toBe('IfcMaterialLayerSet');
      expect(conformsTo(registry, 'IFCMATERIALLAYERSETUSAGE', 'IfcMaterialSelect')).toBe(true);
    }
    expect(keys.mock.calls.filter(([o]) => o === registry.entities)).toHaveLength(0);
  });
});

describe('schemaRegistry', () => {
  it('gives the bundled registry of each authoring schema, the same object every time, and checks it once (#154)', () => {
    for (const schema of SCHEMAS) {
      const bundled = getSchemaRegistryForVersion(schema);
      expect(schemaRegistry(schema, 'test')).toBe(bundled);
      const keys = vi.spyOn(Object, 'keys');
      for (let i = 0; i < 100; i++) expect(schemaRegistry(schema, 'test')).toBe(bundled);
      expect(keys.mock.calls.filter(([o]) => o === bundled.entities), 'the non-empty check lists every entity name').toHaveLength(0);
      vi.restoreAllMocks();
    }
    expect(schemaRegistry(undefined, 'test')).toBe(getSchemaRegistryForVersion('IFC4'));
  });

  it('still refuses a schema it cannot author', () => {
    expect(() => schemaRegistry('IFC5', 'addThing')).toThrow(/addThing: authoring IFC5 models is not supported/);
  });
});
