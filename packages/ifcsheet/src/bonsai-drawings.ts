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
 *   the camera: a rectangle (the view's crop) extruded along -Z by the view depth. A plan's camera sits at the cut plane looking down;
 *   an elevation's or section's is placed as `tool.Drawing.generate_drawing_matrix` does: local -Z the way it looks (horizontal),
 *   local Y up (world Z), local X to the right (`look` x Z), at the middle of the crop on the cut plane;
 * - the property set `EPset_Drawing`: `TargetView` (`PLAN_VIEW`, `ELEVATION_VIEW` or `SECTION_VIEW`), `Scale` (`1/100`), `HumanScale`
 *   (`1:100`), and the switches it reads;
 * - an `IfcGroup` of `ObjectType` `DRAWING` that the drawing and its annotations are assigned to (`IfcRelAssignsToGroup`), itself
 *   assigned to the parent `IfcGroup` named and typed `DRAWINGS`;
 * - an `IfcDocumentInformation` (`Scope` `DRAWING`) under the parent one named and scoped `DRAWINGS`, whose `IfcDocumentReference`
 *   (`Description` `DRAWING`, `Location` the drawing's SVG) is associated to the drawing (`IfcRelAssociatesDocument`).
 *
 * A SHEET (`core.drawing.add_sheet`, `add_drawing_to_sheet`): an `IfcDocumentInformation` with `Scope` `SHEET`, `Identification` and
 * `Name`, associated to the project, with one `IfcDocumentReference` of `Description` `LAYOUT` and one per drawing of `Description`
 * `DRAWING`, `Identification` its running number and the same `Location` as the drawing's own reference (that equality is how
 * Bonsai finds the sheets of a drawing). The files those Locations name are the caller's SVGs when it gives them (`annotated-ifc.ts`,
 * `svg-export.ts`); without, Bonsai makes the drawing and sheet files itself. It finds its own
 * stylesheet, markers, symbols, patterns and shading styles through the `EPset_Drawing` paths written with its defaults.
 *
 * IFC4 and IFC4X3 only: Bonsai's IFC2X3 document attributes differ and are not written.
 */

import { generateIfcGuid } from '@ifc-lite/encoding';
import type { StoreEditor } from '@ifc-lite/mutations';
import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';
import { toNativeLength, type SpatialAnchor } from '@ifc-lite/create';

export interface Pt2 { x: number; y: number }

export type BonsaiTargetView = 'PLAN_VIEW' | 'ELEVATION_VIEW' | 'SECTION_VIEW';

/** An elevation's or section's camera in the storey's local frame, metres. */
export interface BonsaiVerticalCamera {
  /** Unit horizontal direction the camera looks along. */
  look: Pt2;
  /** The middle of the crop on the cut plane; `z` above the storey's origin. */
  centre: Pt2 & { z: number };
  /** The crop across (along local X) and up (along Z). */
  width: number;
  height: number;
}

export interface BonsaiDrawingParams {
  name: string;
  /** The "N" of 1:N. */
  scale: number;
  /** `EPset_Drawing.TargetView`; absent `PLAN_VIEW`. */
  targetView?: BonsaiTargetView;
  /** The camera's rectangle in the storey's local frame, metres (a plan). */
  extent: { min: Pt2; max: Pt2 };
  /** The cut plane's height above the storey's origin, metres; the plan camera sits there looking down. */
  cutHeight: number;
  /** An elevation's or section's camera; absent: a plan's, from `extent` and `cutHeight`. */
  vertical?: BonsaiVerticalCamera;
  /** How far the camera sees, metres (below the cut plane for a plan, along `look` for the others). */
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

/**
 * The resource paths `core.drawing.add_drawing` writes into `EPset_Drawing` and `svgwriter.py` reads (Stylesheet, Markers, Symbols,
 * Patterns, ShadingStyles), with the defaults of the add-on's document preferences (`bim/ui.py`), relative to the IFC file and with
 * forward slashes as Bonsai stores them. Bonsai copies its own `shading_styles.json` there; the others it finds in its own data.
 */
export const BONSAI_DRAWING_RESOURCES: readonly (readonly [string, string])[] = [
  ['Stylesheet', 'drawings/assets/default.css'],
  ['Markers', 'drawings/assets/markers.svg'],
  ['Symbols', 'drawings/assets/symbols.svg'],
  ['Patterns', 'drawings/assets/patterns.svg'],
  ['ShadingStyles', 'drawings/assets/shading_styles.json'],
];
export const BONSAI_DEFAULT_SHADING_STYLE = 'Blender Default';

const ref = (id: number): string => `#${id}`;
const fileSafe = (name: string): string => [...name].filter((c) => /[\p{L}\p{N}._ -]/u.test(c)).join('');

/** The Bonsai side of one export: finds or makes the shared parents once, then adds each drawing and sheet. */
export class BonsaiWriter {
  private parentGroup: number | null = null;
  private parentDocument: number | null = null;
  private readonly names = new Set<string>();
  /** The drawings' documents: one `IfcDocumentInformationRelationship` from the parent holds them all (`IsPointer` is at most one), written by `finish`. */
  private readonly drawingDocuments: number[] = [];
  private readonly drawingGroups: number[] = [];
  private sourceDrawings: Set<string> | null = null;
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
      const attrs = this.sourceAttributes(id);
      if (attrs && at.every((a, i) => attrs[a] === want[i])) return id;
    }
    return null;
  }

  private sourceAttributes(id: number): readonly unknown[] | null {
    const entry = this.store.entityIndex.byId.get(id);
    return entry && this.extractor ? this.extractor.extractEntity(entry)?.attributes ?? null : null;
  }

  /** A reference as the parser gives it (a number or `#n`) as its express id. */
  private static idOf(v: unknown): number | null {
    if (typeof v === 'number') return v;
    return typeof v === 'string' && /^#\d+$/.test(v) ? Number(v.slice(1)) : null;
  }

  /** The source's one relationship of `type` whose attribute `at` is `target` (Bonsai keeps one per parent, and `IsGroupedBy` / `IsPointer` allow no more), with its list. */
  private sourceRelationOf(type: string, at: number, target: number, list: number): { id: number; members: string[] } | null {
    for (const id of this.store.entityIndex.byType.get(type) ?? []) {
      const attrs = this.sourceAttributes(id);
      if (attrs && BonsaiWriter.idOf(attrs[at]) === target && Array.isArray(attrs[list])) {
        return { id, members: attrs[list].map((v) => BonsaiWriter.idOf(v)).filter((n): n is number => n !== null).map(ref) };
      }
    }
    return null;
  }

  /** True when the source already has a Bonsai drawing of this name: IfcSheet writes none beside it. */
  hasDrawing(name: string): boolean {
    this.sourceDrawings ??= new Set((this.store.entityIndex.byType.get('IFCANNOTATION') ?? [])
      .map((id) => this.sourceAttributes(id))
      .filter((a): a is readonly unknown[] => a !== null && a[4] === 'DRAWING')
      .map((a) => String(a[2]).toLowerCase()));
    return this.sourceDrawings.has(name.toLowerCase());
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

    // The camera: placed on the storey's placement; its local -Z is the way it looks.
    const { vertical } = params;
    const width = vertical ? vertical.width : max.x - min.x;
    const height = vertical ? vertical.height : max.y - min.y;
    const centre = vertical
      ? point3(n(vertical.centre.x), n(vertical.centre.y), n(vertical.centre.z))
      : point3(n((min.x + max.x) / 2), n((min.y + max.y) / 2), n(params.cutHeight));
    const direction = (x: number, y: number, z: number): number => this.editor.addEntity('IfcDirection', [[x, y, z]]).expressId;
    const axes = this.editor.addEntity('IfcAxis2Placement3D', [ref(centre), vertical ? ref(direction(-vertical.look.x, -vertical.look.y, 0)) : null, vertical ? ref(direction(vertical.look.y, -vertical.look.x, 0)) : null]).expressId;
    const placement = this.editor.addEntity('IfcLocalPlacement', [ref(anchor.storeyPlacementId), ref(axes)]).expressId;
    const origin2 = this.editor.addEntity('IfcCartesianPoint', [[0, 0]]).expressId;
    const profilePlace = this.editor.addEntity('IfcAxis2Placement2D', [ref(origin2), null]).expressId;
    const profile = this.editor.addEntity('IfcRectangleProfileDef', ['.AREA.', null, ref(profilePlace), n(width), n(height)]).expressId;
    const solidPlace = this.editor.addEntity('IfcAxis2Placement3D', [ref(point3(0, 0, 0)), null, null]).expressId;
    const down = direction(0, 0, -1);
    const solid = this.editor.addEntity('IfcExtrudedAreaSolid', [ref(profile), ref(solidPlace), ref(down), n(params.depth)]).expressId;
    const shape = this.editor.addEntity('IfcShapeRepresentation', [ref(anchor.bodyContextId), 'Body', 'SweptSolid', [ref(solid)]]).expressId;
    const productShape = this.editor.addEntity('IfcProductDefinitionShape', [null, null, [ref(shape)]]).expressId;
    const drawingId = this.editor.addEntity('IfcAnnotation', [this.guid(), this.owned(), name, null, 'DRAWING', ref(placement), ref(productShape)]).expressId;
    this.editor.addEntity('IfcRelContainedInSpatialStructure', [this.guid(), this.owned(), null, null, [ref(drawingId)], ref(anchor.storeyId)]);

    this.editor.addPropertySet(drawingId, 'EPset_Drawing', [
      { name: 'TargetView', value: params.targetView ?? 'PLAN_VIEW', type: 'LABEL' },
      { name: 'Scale', value: `1/${params.scale}`, type: 'LABEL' },
      { name: 'HumanScale', value: `1:${params.scale}`, type: 'LABEL' },
      { name: 'HasUnderlay', value: false, type: 'BOOLEAN' },
      { name: 'HasLinework', value: true, type: 'BOOLEAN' },
      { name: 'HasAnnotation', value: true, type: 'BOOLEAN' },
      { name: 'GlobalReferencing', value: true, type: 'BOOLEAN' },
      ...BONSAI_DRAWING_RESOURCES.map(([name, value]) => ({ name, value, type: 'LABEL' as const })),
      { name: 'CurrentShadingStyle', value: BONSAI_DEFAULT_SHADING_STYLE, type: 'LABEL' },
    ]);

    const groupId = this.editor.addEntity('IfcGroup', [this.guid(), this.owned(), name, null, 'DRAWING']).expressId;
    this.assignToGroup([drawingId, ...params.annotationIds], groupId);
    this.ensureParentGroup();
    this.drawingGroups.push(groupId);

    const location = `drawings/${fileSafe(name)}.svg`;
    const informationId = this.information('X', name, 'DRAWING');
    const reference = this.reference(location, null, null, informationId);
    this.drawingDocuments.push(informationId);
    this.associate([drawingId], reference);
    return { drawingId, groupId, location, informationId };
  }

  /** After the last drawing: the parent document's one relationship to the drawings' documents. */
  finish(): void {
    if (this.drawingGroups.length > 0) {
      const parent = this.ensureParentGroup();
      const existing = this.sourceRelationOf('IFCRELASSIGNSTOGROUP', 6, parent, 4);
      if (existing) this.editor.setPositionalAttribute(existing.id, 4, [...existing.members, ...this.drawingGroups.map(ref)]);
      else this.assignToGroup(this.drawingGroups, parent);
    }
    if (this.drawingDocuments.length === 0) return;
    const parent = this.ensureParentDocument();
    const existing = this.sourceRelationOf('IFCDOCUMENTINFORMATIONRELATIONSHIP', 2, parent, 3);
    if (existing) this.editor.setPositionalAttribute(existing.id, 3, [...existing.members, ...this.drawingDocuments.map(ref)]);
    else this.editor.addEntity('IfcDocumentInformationRelationship', [null, null, ref(parent), this.drawingDocuments.map(ref), null]);
  }

  /** One sheet: the document, its layout reference and a reference to each drawing placed on it. */
  addSheet(params: BonsaiSheetParams): { id: number; layout: string } {
    const sheet = this.information(params.identification, params.name, 'SHEET');
    this.associateToProject(sheet);
    const layout = `layouts/${fileSafe(params.identification)} - ${fileSafe(params.name)}.svg`;
    this.reference(layout, null, 'LAYOUT', sheet);
    params.locations.forEach((location, i) => this.reference(location, String(i + 1), 'DRAWING', sheet));
    return { id: sheet, layout };
  }
}
