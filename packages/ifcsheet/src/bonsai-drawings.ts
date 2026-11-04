/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bonsai drawings and sheets (#548): what Bonsai (`bonsai/core/drawing.py`, `tool/drawing.py`) reads to list a view as a drawing and
 * a set of views as a sheet, written next to the annotations of `annotated-ifc.ts`. Read from Bonsai v0.8.0's source, not from a run
 * of Bonsai (see the PR for what was checked).
 *
 * A DRAWING (`core.drawing.add_drawing`, `tool.Drawing.import_drawings`):
 * - an `IfcAnnotation`, `ObjectType` `DRAWING`, whose `Body` representation in the model's `Model` / `Body` / `MODEL_VIEW` context is
 *   the camera: a rectangle (the view's extent) extruded along -Z by the view depth, placed at the cut plane looking down;
 * - the property set `EPset_Drawing`: `TargetView` (`PLAN_VIEW`), `Scale` (`1/100`), `HumanScale` (`1:100`), and the switches it reads;
 * - an `IfcGroup` of `ObjectType` `DRAWING` that the drawing and its annotations are assigned to (`IfcRelAssignsToGroup`), itself
 *   assigned to the parent `IfcGroup` named and typed `DRAWINGS`;
 * - an `IfcDocumentInformation` (`Scope` `DRAWING`) under the parent one named and scoped `DRAWINGS`, whose `IfcDocumentReference`
 *   (`Description` `DRAWING`, `Location` the drawing's SVG) is associated to the drawing (`IfcRelAssociatesDocument`).
 *
 * A SHEET (`core.drawing.add_sheet`, `add_drawing_to_sheet`): an `IfcDocumentInformation` with `Scope` `SHEET`, `Identification` and
 * `Name`, associated to the project, with one `IfcDocumentReference` of `Description` `LAYOUT` and one per drawing of `Description`
 * `DRAWING`, `Identification` its running number and the same `Location` as the drawing's own reference (that equality is how
 * Bonsai finds the sheets of a drawing). IfcSheet writes no SVG: Bonsai makes the drawing and sheet files itself.
 *
 * IFC4 and IFC4X3 only: Bonsai's IFC2X3 document attributes differ and are not written.
 */

import { generateIfcGuid } from '@ifc-lite/encoding';
import type { StoreEditor } from '@ifc-lite/mutations';
import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';
import { toNativeLength, type SpatialAnchor } from '@ifc-lite/create';

export interface Pt2 { x: number; y: number }

export interface BonsaiDrawingParams {
  name: string;
  /** The "N" of 1:N. */
  scale: number;
  /** The camera's rectangle in the storey's local frame, metres. */
  extent: { min: Pt2; max: Pt2 };
  /** The cut plane's height above the storey's origin, metres; the camera sits there looking down. */
  cutHeight: number;
  /** How far below the cut plane the view sees, metres. */
  depth: number;
  /** The view's annotation(s) that Bonsai shows with the drawing. */
  annotationIds: readonly number[];
}

export interface BonsaiDrawingResult {
  drawingId: number;
  groupId: number;
  /** The drawing's `IfcDocumentReference.Location`: what a sheet's reference repeats. */
  location: string;
  /** The `IfcDocumentInformation` of the drawing. */
  informationId: number;
}

export interface BonsaiSheetParams {
  identification: string;
  name: string;
  /** The drawings on the sheet, in order (`location` of each `BonsaiDrawingResult`). */
  locations: readonly string[];
}

const ref = (id: number): string => `#${id}`;
const fileSafe = (name: string): string => [...name].filter((c) => /[\p{L}\p{N}._ -]/u.test(c)).join('');

/** The Bonsai side of one export: finds or makes the shared parents once, then adds each drawing and sheet. */
export class BonsaiWriter {
  private parentGroup: number | null = null;
  private parentDocument: number | null = null;
  private readonly names = new Set<string>();
  /** The drawings' documents: one `IfcDocumentInformationRelationship` from the parent holds them all (`IsPointer` is at most one), written by `finish`. */
  private readonly drawingDocuments: number[] = [];
  private readonly extractor: EntityExtractor | null;

  constructor(
    private readonly editor: StoreEditor,
    private readonly store: IfcDataStore,
    private readonly owner: number | null,
    private readonly random?: SpatialAnchor['guidRandom'],
  ) {
    this.extractor = store.source.byteLength > 0 ? new EntityExtractor(store.source) : null;
  }

  private guid(): string { return generateIfcGuid(this.random); }

  private owned(): string | null { return this.owner === null ? null : ref(this.owner); }

  /** An entity of the source by type whose attribute `at[i]` equals `want[i]`, or null. */
  private findInSource(type: string, at: readonly number[], want: readonly string[]): number | null {
    for (const id of this.store.entityIndex.byType.get(type) ?? []) {
      const entry = this.store.entityIndex.byId.get(id);
      const attrs = entry && this.extractor ? this.extractor.extractEntity(entry)?.attributes : null;
      if (attrs && at.every((a, i) => attrs[a] === want[i])) return id;
    }
    return null;
  }

  private ensureParentGroup(): number {
    this.parentGroup ??= this.findInSource('IFCGROUP', [2, 4], ['DRAWINGS', 'DRAWINGS'])
      ?? this.editor.addEntity('IfcGroup', [this.guid(), this.owned(), 'DRAWINGS', null, 'DRAWINGS']).expressId;
    return this.parentGroup;
  }

  private ensureParentDocument(): number {
    if (this.parentDocument !== null) return this.parentDocument;
    const found = this.findInSource('IFCDOCUMENTINFORMATION', [0, 1, 6], ['DRAWINGS', 'DRAWINGS', 'DRAWINGS']);
    if (found !== null) { this.parentDocument = found; return found; }
    this.parentDocument = this.information('DRAWINGS', 'DRAWINGS', 'DRAWINGS');
    this.associateToProject(this.parentDocument);
    return this.parentDocument;
  }

  /** `IfcDocumentInformation` of IFC4 / IFC4X3: Identification, Name, Description, Location, Purpose, IntendedUse, Scope, then the rest open. */
  private information(identification: string, name: string, scope: string): number {
    const attrs: (string | null)[] = [identification, name, null, null, null, null, scope];
    while (attrs.length < 17) attrs.push(null);
    return this.editor.addEntity('IfcDocumentInformation', attrs).expressId;
  }

  private reference(location: string, identification: string | null, description: string | null, information: number): number {
    return this.editor.addEntity('IfcDocumentReference', [location, identification, null, description, ref(information)]).expressId;
  }

  private associate(objects: readonly number[], document: number): void {
    this.editor.addEntity('IfcRelAssociatesDocument', [this.guid(), this.owned(), null, null, objects.map(ref), ref(document)]);
  }

  private associateToProject(information: number): void {
    const project = this.store.entityIndex.byType.get('IFCPROJECT')?.[0];
    if (project !== undefined) this.associate([project], information);
  }

  private assignToGroup(objects: readonly number[], group: number): void {
    this.editor.addEntity('IfcRelAssignsToGroup', [this.guid(), this.owned(), null, null, objects.map(ref), null, ref(group)]);
  }

  private uniqueName(name: string): string {
    let out = name;
    for (let n = 2; this.names.has(out.toLowerCase()); n++) out = `${name} (${n})`;
    this.names.add(out.toLowerCase());
    return out;
  }

  /** One view as a Bonsai drawing: its camera, `EPset_Drawing`, group and document. `anchor` is the view's storey. */
  addDrawing(anchor: SpatialAnchor & { storeyId: number }, params: BonsaiDrawingParams): BonsaiDrawingResult {
    const n = (metres: number): number => toNativeLength(anchor, metres);
    const { min, max } = params.extent;
    const name = this.uniqueName(params.name);
    const point3 = (x: number, y: number, z: number): number => this.editor.addEntity('IfcCartesianPoint', [[x, y, z]]).expressId;

    // The camera: placed on the storey's placement at the centre of the extent and at the cut height; its local -Z is the way it looks.
    const centre = point3(n((min.x + max.x) / 2), n((min.y + max.y) / 2), n(params.cutHeight));
    const axes = this.editor.addEntity('IfcAxis2Placement3D', [ref(centre), null, null]).expressId;
    const placement = this.editor.addEntity('IfcLocalPlacement', [ref(anchor.storeyPlacementId), ref(axes)]).expressId;
    const origin2 = this.editor.addEntity('IfcCartesianPoint', [[0, 0]]).expressId;
    const profilePlace = this.editor.addEntity('IfcAxis2Placement2D', [ref(origin2), null]).expressId;
    const profile = this.editor.addEntity('IfcRectangleProfileDef', ['.AREA.', null, ref(profilePlace), n(max.x - min.x), n(max.y - min.y)]).expressId;
    const solidPlace = this.editor.addEntity('IfcAxis2Placement3D', [ref(point3(0, 0, 0)), null, null]).expressId;
    const down = this.editor.addEntity('IfcDirection', [[0, 0, -1]]).expressId;
    const solid = this.editor.addEntity('IfcExtrudedAreaSolid', [ref(profile), ref(solidPlace), ref(down), n(params.depth)]).expressId;
    const shape = this.editor.addEntity('IfcShapeRepresentation', [ref(anchor.bodyContextId), 'Body', 'SweptSolid', [ref(solid)]]).expressId;
    const productShape = this.editor.addEntity('IfcProductDefinitionShape', [null, null, [ref(shape)]]).expressId;
    const drawingId = this.editor.addEntity('IfcAnnotation', [this.guid(), this.owned(), name, null, 'DRAWING', ref(placement), ref(productShape)]).expressId;
    this.editor.addEntity('IfcRelContainedInSpatialStructure', [this.guid(), this.owned(), null, null, [ref(drawingId)], ref(anchor.storeyId)]);

    this.editor.addPropertySet(drawingId, 'EPset_Drawing', [
      { name: 'TargetView', value: 'PLAN_VIEW', type: 'LABEL' },
      { name: 'Scale', value: `1/${params.scale}`, type: 'LABEL' },
      { name: 'HumanScale', value: `1:${params.scale}`, type: 'LABEL' },
      { name: 'HasUnderlay', value: false, type: 'BOOLEAN' },
      { name: 'HasLinework', value: true, type: 'BOOLEAN' },
      { name: 'HasAnnotation', value: true, type: 'BOOLEAN' },
      { name: 'GlobalReferencing', value: true, type: 'BOOLEAN' },
    ]);

    const groupId = this.editor.addEntity('IfcGroup', [this.guid(), this.owned(), name, null, 'DRAWING']).expressId;
    this.assignToGroup([drawingId, ...params.annotationIds], groupId);
    this.assignToGroup([groupId], this.ensureParentGroup());

    const location = `drawings/${fileSafe(name)}.svg`;
    const informationId = this.information('X', name, 'DRAWING');
    const reference = this.reference(location, null, null, informationId);
    this.drawingDocuments.push(informationId);
    this.associate([drawingId], reference);
    return { drawingId, groupId, location, informationId };
  }

  /** After the last drawing: the parent document's one relationship to the drawings' documents. */
  finish(): void {
    if (this.drawingDocuments.length === 0) return;
    this.editor.addEntity('IfcDocumentInformationRelationship', [null, null, ref(this.ensureParentDocument()), this.drawingDocuments.map(ref), null]);
  }

  /** One sheet: the document, its layout reference and a reference to each drawing placed on it. */
  addSheet(params: BonsaiSheetParams): number {
    const sheet = this.information(params.identification, params.name, 'SHEET');
    this.associateToProject(sheet);
    this.reference(`layouts/${fileSafe(params.identification)} - ${fileSafe(params.name)}.svg`, null, 'LAYOUT', sheet);
    params.locations.forEach((location, i) => this.reference(location, String(i + 1), 'DRAWING', sheet));
    return sheet;
  }
}
