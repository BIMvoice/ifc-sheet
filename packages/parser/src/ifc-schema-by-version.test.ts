/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The per-schema attribute lookups answer from an index built once per
 * version (#154), not a scan of every entity name per call. Pinned here
 * against that scan, for every entity of every bundled version, in the case
 * the file spells it and in others.
 */

import { describe, expect, it } from 'vitest';
import { getAttributeNamesForSchema, getAttributeTypeForSchema, getAttributeNamesAcrossSchemas } from './ifc-schema.js';
import { getSchemaRegistryForVersion, type SchemaVersionWithRegistry } from './generated/schema-registry-by-version.js';

const VERSIONS: SchemaVersionWithRegistry[] = ['IFC2X3', 'IFC4', 'IFC4X3'];

/** The lookup as it was: scan the version's entity names for one equal ignoring case. */
function scanned(version: SchemaVersionWithRegistry, type: string) {
  const registry = getSchemaRegistryForVersion(version);
  const canonical = Object.keys(registry.entities).find((name) => name.toUpperCase() === type.toUpperCase());
  return canonical ? registry.entities[canonical]?.allAttributes : undefined;
}

describe('attribute lookups by schema version (#154)', () => {
  for (const version of VERSIONS) {
    it(`${version}: every entity, in any case, gets the scan's attribute names and types`, () => {
      const names = Object.keys(getSchemaRegistryForVersion(version).entities);
      expect(names.length).toBeGreaterThan(100);
      for (const name of names) {
        const expected = scanned(version, name)?.map((a) => a.name) ?? getAttributeNamesAcrossSchemas(name);
        for (const spelling of [name, name.toUpperCase(), name.toLowerCase()]) {
          expect(getAttributeNamesForSchema(spelling, version)).toEqual(expected);
        }
        const first = scanned(version, name)?.[0];
        if (first) expect(getAttributeTypeForSchema(name.toUpperCase(), first.name, version)).toBe(first.type);
      }
    });
  }

  it('accepts the schema spelled as files spell it', () => {
    expect(getAttributeNamesForSchema('IFCDOOR', 'IFC2X3')).toEqual(scanned('IFC2X3', 'IfcDoor')?.map((a) => a.name));
    expect(getAttributeNamesForSchema('IfcDoor', 'ifc4')).toEqual(scanned('IFC4', 'IfcDoor')?.map((a) => a.name));
    expect(getAttributeNamesForSchema('IfcDoor', 'IFC4X3_ADD2')).toEqual(scanned('IFC4X3', 'IfcDoor')?.map((a) => a.name));
  });

  it('falls back to the bundled union for a type the version does not have, and to nothing for a non-entity', () => {
    expect(getAttributeNamesForSchema('IfcRoad', 'IFC2X3')).toEqual(getAttributeNamesAcrossSchemas('IfcRoad'));
    expect(getAttributeNamesForSchema('constructor', 'IFC4')).toEqual(getAttributeNamesAcrossSchemas('constructor'));
    expect(getAttributeNamesForSchema('IfcNotAThing', 'IFC4')).toEqual([]);
  });

  it('hands each caller its own array', () => {
    const a = getAttributeNamesForSchema('IfcWall', 'IFC4');
    a.push('mutated');
    expect(getAttributeNamesForSchema('IfcWall', 'IFC4')).not.toContain('mutated');
  });
});
