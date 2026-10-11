/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { asEnum, asRef, asRefList, asString, CostEntityReader } from './cost-reader.js';
import { getInheritanceChain } from './ifc-schema.js';
import type {
  CostDiagnostic,
  CostRelationshipInfo,
  CostRelationshipType,
  CostValueInfo,
} from './cost-types.js';

function base(expressId: number, Type: CostRelationshipType, a: unknown[]): CostRelationshipInfo {
  return { expressId, Type, GlobalId: asString(a[0]), Name: asString(a[2]), Description: asString(a[3]) };
}

function reference(reader: CostEntityReader, expressId: number, index: number, required = true): {
  value?: number; invalid: boolean;
} {
  const value = reader.referenceLexeme(expressId, index);
  return { value, invalid: value === undefined && (required || reader.attributePresent(expressId, index)) };
}

function references(reader: CostEntityReader, expressId: number, index: number, required = true): {
  value: number[]; invalid: boolean;
} {
  const value = reader.referenceListLexeme(expressId, index);
  return { value: value ?? [], invalid: value === undefined && (required || reader.attributePresent(expressId, index)) };
}

function targetIs(reader: CostEntityReader, expressId: number, roots: ReadonlySet<string>): boolean {
  const type = reader.typeOf(expressId);
  if (type === undefined) return false;
  return getInheritanceChain(type).some(entry => roots.has(entry.toUpperCase()));
}

const OBJECT_DEFINITION_ROOT = new Set(['IFCOBJECTDEFINITION']);
const CONTROL_ROOT = new Set(['IFCCONTROL']);
const CONTEXT_ROOT = new Set(['IFCCONTEXT']);
const DEFINITION_SELECT_ROOTS = new Set(['IFCOBJECTDEFINITION', 'IFCPROPERTYDEFINITION']);
const PROCESS_ROOT = new Set(['IFCPROCESS']);
const PROCESS_SELECT_ROOTS = new Set(['IFCPROCESS', 'IFCTYPEPROCESS']);
const PRODUCT_ROOT = new Set(['IFCPRODUCT']);
const PRODUCT_SELECT_ROOTS = new Set([...PRODUCT_ROOT, 'IFCTYPEPRODUCT']);
const ROOT = new Set(['IFCROOT']);
const APPLIED_VALUE_ROOT = new Set(['IFCAPPLIEDVALUE']);
const COST_ITEM = new Set(['IFCCOSTITEM']);
const COST_SCHEDULE = new Set(['IFCCOSTSCHEDULE']);

/** Preserve every cost-relevant edge with its original relationship identity. */
export function extractCostRelationships(
  reader: CostEntityReader,
  itemIds: Set<number>,
  scheduleIds: Set<number>,
  valueIds: Set<number>,
): CostRelationshipInfo[] {
  const result: CostRelationshipInfo[] = [];
  const assignedTasks = new Set<number>();
  for (const expressId of reader.ids('IFCRELASSIGNSTOCONTROL')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const related = references(reader, expressId, 4);
    const control = reference(reader, expressId, 6);
    const candidates = asRefList(a[4]) ?? [];
    const candidateControl = asRef(a[6]);
    if (!itemIds.has(candidateControl ?? -1) && !scheduleIds.has(candidateControl ?? -1) &&
        !candidates.some(id => itemIds.has(id))) continue;
    const InvalidReferences = related.invalid || control.invalid ||
      related.value.some(id => !targetIs(reader, id, OBJECT_DEFINITION_ROOT)) ||
      (control.value !== undefined && !targetIs(reader, control.value, CONTROL_ROOT));
    const RelatedObjects = related.value;
    const RelatingControl = control.value;
    result.push({ ...base(expressId, 'IfcRelAssignsToControl', a), RelatedObjects, RelatingControl,
      InvalidReferences: InvalidReferences || undefined });
    if (RelatingControl !== undefined && itemIds.has(RelatingControl)) {
      for (const id of RelatedObjects) if (reader.typeOf(id) === 'IFCTASK') assignedTasks.add(id);
    }
  }
  for (const expressId of reader.ids('IFCRELASSIGNSTOPRODUCT')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const related = references(reader, expressId, 4);
    const product = reference(reader, expressId, 6);
    if ((asRefList(a[4]) ?? []).some(id => itemIds.has(id))) {
      const InvalidReferences = related.invalid || product.invalid ||
        related.value.some(id => !targetIs(reader, id, OBJECT_DEFINITION_ROOT)) ||
        (product.value !== undefined && !targetIs(reader, product.value,
          reader.schemaVersion === 'IFC2X3' ? PRODUCT_ROOT : PRODUCT_SELECT_ROOTS));
      result.push({ ...base(expressId, 'IfcRelAssignsToProduct', a), RelatedObjects: related.value,
        RelatingProduct: product.value, InvalidReferences: InvalidReferences || undefined });
    }
  }
  for (const expressId of reader.ids('IFCRELNESTS')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const parent = reference(reader, expressId, 4);
    const related = references(reader, expressId, 5);
    const RelatingObject = parent.value;
    const RelatedObjects = related.value;
    const candidateParent = asRef(a[4]);
    const candidateRelated = asRefList(a[5]) ?? [];
    const InvalidRelatedObjects = related.invalid;
    if ((candidateParent !== undefined && itemIds.has(candidateParent)) || candidateRelated.some(id => itemIds.has(id))) {
      result.push({ ...base(expressId, 'IfcRelNests', a), RelatingObject, RelatedObjects,
        InvalidRelatedObjects: InvalidRelatedObjects || undefined,
        InvalidReferences: (parent.invalid || related.invalid ||
          related.value.some(id => !targetIs(reader, id, OBJECT_DEFINITION_ROOT)) ||
          (parent.value !== undefined && !targetIs(reader, parent.value, OBJECT_DEFINITION_ROOT))) || undefined });
    }
  }
  for (const expressId of reader.ids('IFCRELDECLARES')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const definitions = references(reader, expressId, 5);
    const context = reference(reader, expressId, 4);
    if ((asRefList(a[5]) ?? []).some(id => scheduleIds.has(id) || itemIds.has(id))) {
      const InvalidReferences = definitions.invalid || context.invalid ||
        definitions.value.some(id => !targetIs(reader, id, DEFINITION_SELECT_ROOTS)) ||
        (context.value !== undefined && !targetIs(reader, context.value, CONTEXT_ROOT));
      result.push({ ...base(expressId, 'IfcRelDeclares', a), RelatingContext: context.value,
        RelatedDefinitions: definitions.value, InvalidReferences: InvalidReferences || undefined });
    }
  }
  for (const expressId of reader.ids('IFCRELASSIGNSTOPROCESS')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const related = references(reader, expressId, 4);
    const process = reference(reader, expressId, 6);
    const candidateProcess = asRef(a[6]);
    if ((candidateProcess !== undefined && assignedTasks.has(candidateProcess)) ||
        (asRefList(a[4]) ?? []).some(id => itemIds.has(id))) {
      const InvalidReferences = related.invalid || process.invalid ||
        related.value.some(id => !targetIs(reader, id, OBJECT_DEFINITION_ROOT)) ||
        (process.value !== undefined && !targetIs(reader, process.value,
          reader.schemaVersion === 'IFC2X3' ? PROCESS_ROOT : PROCESS_SELECT_ROOTS));
      result.push({ ...base(expressId, 'IfcRelAssignsToProcess', a), RelatedObjects: related.value,
        RelatingProcess: process.value, InvalidReferences: InvalidReferences || undefined });
    }
  }
  for (const expressId of reader.ids('IFCRELASSOCIATESAPPLIEDVALUE')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const related = references(reader, expressId, 4);
    const applied = reference(reader, expressId, 5);
    const candidateApplied = asRef(a[5]);
    if ((asRefList(a[4]) ?? []).some(id => itemIds.has(id)) ||
        (candidateApplied !== undefined && valueIds.has(candidateApplied))) {
      const InvalidReferences = related.invalid || applied.invalid ||
        related.value.some(id => !targetIs(reader, id, ROOT)) ||
        (applied.value !== undefined && !targetIs(reader, applied.value, APPLIED_VALUE_ROOT));
      result.push({ ...base(expressId, 'IfcRelAssociatesAppliedValue', a), RelatedObjects: related.value,
        RelatingAppliedValue: applied.value, InvalidReferences: InvalidReferences || undefined });
    }
  }
  for (const expressId of reader.ids('IFCRELSCHEDULESCOSTITEMS')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const related = references(reader, expressId, 4);
    const control = reference(reader, expressId, 6);
    const InvalidReferences = related.invalid || control.invalid ||
      related.value.some(id => !targetIs(reader, id, COST_ITEM)) ||
      (control.value !== undefined && !targetIs(reader, control.value, COST_SCHEDULE));
    result.push({ ...base(expressId, 'IfcRelSchedulesCostItems', a), RelatedObjects: related.value,
      RelatingControl: control.value, InvalidReferences: InvalidReferences || undefined });
  }
  for (const expressId of reader.ids('IFCAPPLIEDVALUERELATIONSHIP')) {
    const a = reader.get(expressId)?.attributes ?? [];
    const total = reference(reader, expressId, 0);
    const components = references(reader, expressId, 1);
    result.push({
      expressId, Type: 'IfcAppliedValueRelationship', ComponentOfTotal: total.value,
      Components: components.value, ArithmeticOperator: asEnum(a[2]),
      Name: asString(a[3]), Description: asString(a[4]),
      InvalidReferences: (total.invalid || components.invalid ||
        (total.value !== undefined && !targetIs(reader, total.value, APPLIED_VALUE_ROOT)) ||
        components.value.some(id => !targetIs(reader, id, APPLIED_VALUE_ROOT))) || undefined,
    });
  }
  return result;
}

/** Diagnose malformed nesting and value graphs without discarding them. */
export function diagnoseCostGraphs(
  relationships: CostRelationshipInfo[],
  values: CostValueInfo[],
  itemIds: Set<number>,
  diagnostics: CostDiagnostic[],
): void {
  for (const relationship of relationships) {
    if (relationship.InvalidReferences) diagnostics.push({
      Code: 'INVALID_LIST', Message: `${relationship.Type} #${relationship.expressId} contains an invalid endpoint`,
      Severity: 'error', expressId: relationship.expressId,
    });
  }
  const parents = new Map<number, { parent: number; relationship: number }>();
  const children = new Map<number, number[]>();
  for (const rel of relationships) {
    if (rel.Type !== 'IfcRelNests' || rel.RelatingObject === undefined || !itemIds.has(rel.RelatingObject)) continue;
    if (rel.InvalidRelatedObjects) diagnostics.push({
      Code: 'INVALID_LIST', Message: `RelatedObjects on IfcRelNests #${rel.expressId} is malformed`,
      Severity: 'error', expressId: rel.expressId,
    });
    const list = children.get(rel.RelatingObject) ?? [];
    for (const child of rel.RelatedObjects ?? []) {
      if (!itemIds.has(child)) continue;
      const previous = parents.get(child);
      if (previous !== undefined) {
        diagnostics.push({ Code: 'MULTIPLE_NESTING_PARENTS', Message: `Cost item #${child} participates in multiple nesting relationships`, Severity: 'error', expressId: child, RelatedExpressId: rel.expressId });
      } else parents.set(child, { parent: rel.RelatingObject, relationship: rel.expressId });
      list.push(child);
    }
    children.set(rel.RelatingObject, list);
  }
  const valueMap = new Map<number, CostValueInfo>();
  for (const value of values) if (value.expressId !== undefined) valueMap.set(value.expressId, value);
  const valueEdges = new Map<number, number[]>();
  for (const [id, value] of valueMap) valueEdges.set(id, [...(value.Components ?? [])]);
  for (const relationship of relationships) {
    if (relationship.Type !== 'IfcAppliedValueRelationship' || relationship.ComponentOfTotal === undefined) continue;
    const edges = valueEdges.get(relationship.ComponentOfTotal) ?? [];
    for (const component of relationship.Components ?? []) edges.push(component);
    valueEdges.set(relationship.ComponentOfTotal, edges);
  }
  diagnoseCycles(children, itemIds, 'NESTING_CYCLE', 'Cost item nesting', diagnostics);
  diagnoseCycles(valueEdges, new Set(valueEdges.keys()), 'VALUE_CYCLE', 'IfcAppliedValue', diagnostics);
}

function diagnoseCycles(
  edges: Map<number, number[]>,
  nodes: Set<number>,
  Code: 'NESTING_CYCLE' | 'VALUE_CYCLE',
  label: string,
  diagnostics: CostDiagnostic[],
): void {
  const state = new Map<number, 1 | 2>();
  const reported = new Set<number>();
  for (const root of nodes) {
    if (state.has(root)) continue;
    const stack: Array<{ id: number; next: number }> = [{ id: root, next: 0 }];
    state.set(root, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const adjacent = edges.get(frame.id) ?? [];
      if (frame.next >= adjacent.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const child = adjacent[frame.next++];
      if (!nodes.has(child)) continue;
      const childState = state.get(child);
      if (childState === 1 && !reported.has(child)) {
        diagnostics.push({ Code, Message: `${label} cycle includes #${child}`, Severity: 'error', expressId: child });
        reported.add(child);
      } else if (childState === undefined) {
        state.set(child, 1);
        stack.push({ id: child, next: 0 });
      }
    }
  }
}
