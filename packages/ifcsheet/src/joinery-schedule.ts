/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a joinery schedule lists, read from IFC models (#186, #260): each configured type (one row per
 * catalogue entry, merged across models) with its occurrences counted per level, with the doors and
 * windows the project's symbol mapping assigns to it, and the rest grouped by class and size, each group
 * marked D1, W1... Levels are merged by name and ordered by elevation, top floor last. Every occurrence is
 * numbered within its type, level by level (`occurrenceMark`: W1.3).
 *
 * This is the one copy of that rule. The web app's `joinery/schedule-data.ts` calls it with the live models
 * (and their edit overlay); `ifcsheet check --project` calls it with parsed models and the catalogue and
 * mapping read from a project file, so both build the same rows. Only what the models are read from differs:
 * `ScheduleModel.view` is the edit overlay (the app's unsaved edits), `nameOf` the app's overlay-aware name read.
 *
 * Its own entry, `@bimvoice/ifcsheet/project`: it loads the modelling library.
 */

import { getModelLengthUnitScale, joineryTypesInStore, occurrencesOfTypeInStore, readJoineryFlips, readJoineryType, type JoinerySpec, type JoineryTypeRead } from '@ifc-lite/create';
import { iterateEffectiveEntityIds, type MutablePropertyView } from '@ifc-lite/mutations';
import type { IfcDataStore } from '@ifc-lite/parser';
import { filterPropertyNames, predefinedTypeText, type PropertyFact } from './schedule-filter.js';
import { applyContent, occurrenceMarkOf, type ScheduleContent } from './schedule-content.js';
import type { ModelRow } from './joinery-model-rows.js';
import { fillTypedValues, markMeasuredTypes, noteMeasured } from './joinery-typed-rows.js';
import { createHeadlessListProvider } from './list-provider.js';
import { readModelRowCells } from './joinery-model-values.js';
import type { ListDataProvider } from '@ifc-lite/lists';
import type { ScheduleTextRow } from './schedule-text.js';
import { doorOperationOf } from './door-operation.js';
import type { JoineryCellOverride } from './joinery-overrides.js';
import { statedOrMeasuredSize } from './element-size.js';
import type { MeshData } from '@ifc-lite/geometry';
import { TYPE_ENTRY_PREFIX, fitToElement, resolveMapping, type ElementFacts, type JoineryMapping, type MappingSource } from './joinery-mapping.js';
import { attributes, readPropertyFacts, storedName, typeIndex } from './joinery-live-reads.js';

export type ScheduleKind = 'door' | 'window' | 'all';

export interface ScheduleOccurrence {
  modelId: string;
  expressId: number;
  globalId: string;
  level: string;
  /** The element's Tag as it is in the model. */
  tag: string | null;
  /** 1-based, within the type, lowest level first. */
  number: number;
  /** The element's IFC class (`IfcDoor`), for the class filter. */
  ifcClass?: string;
  /** The element's PredefinedType without dots (`DOOR`); null when it has none (IFC2X3, or `$`). */
  predefinedType?: string | null;
  /** The properties the schedule was asked to read (`IsExternal`, and those the project's filters name), for the property filter. */
  properties?: PropertyFact[];
  /** The text of the model rows the schedules chose (`ModelRow`), by row id: the element's property or quantity, else its type's. A row the element and its type say nothing for has no entry. */
  modelValues?: Record<string, string>;
  /** The rows of `modelValues` whose value is a number, as the number (`modelRowNumber`): the text is what the sheet prints, the number what a spreadsheet keeps. */
  modelNumbers?: Record<string, number>;
  /** The element's size was measured from its geometry: the IFC states none (#485). */
  measured?: boolean;
  /** Which of the two was measured: only the side the IFC does not state is (#485). */
  measuredWidth?: boolean;
  measuredHeight?: boolean;
}

export interface ScheduleEntry {
  key: string;
  /** The GlobalId of the model's IfcTypeObject this type is, when it has one (a configured type); the first model's when several carry it. A typed cell is kept under it (`typeIdentityOf`). */
  typeGlobalId?: string;
  kind: 'door' | 'window';
  /** The configured type; null for elements without one. */
  spec: JoinerySpec | null;
  mark: string;
  name: string;
  /** Metres. */
  width: number;
  height: number;
  /** Width and height were measured from the elements' geometry in their own frame, not stated by the IFC (#485): every element of this group lacked OverallWidth / OverallHeight. */
  measured?: boolean;
  /** The width / the height alone was measured: every element of the group lacked that side's Overall value. `measured` is true when either is. */
  measuredWidth?: boolean;
  measuredHeight?: boolean;
  /** Count per level name. */
  counts: Record<string, number>;
  total: number;
  occurrences: ScheduleOccurrence[];
  /** A group of doors without a configured type: the distinct swing operations the model states for them (`door-operation.ts`), in the order met. The group's key does not change with them (saved filters name it). */
  operations?: ('swing-left' | 'swing-right' | 'double-acting-left' | 'double-acting-right')[];
}

export interface ScheduleData {
  entries: ScheduleEntry[];
  /** Level names, lowest first. */
  levels: string[];
  /** Rows of text typed in by hand, one cell per type by entry key (#186): not read from the model, attached by the app's `scheduleDataOf`. */
  textRows?: ScheduleTextRow[];
  /** The schedule's content choice, for the layout's row choice (#186): not read from the model, attached by `scheduleOf`. */
  content?: ScheduleContent;
  /** The cells typed over the model's text (#446), by type and row: the project's, attached by `scheduleOf` so every reader prints the same text. */
  overrides?: JoineryCellOverride[];
  /** Every group of the schedule's kind, before a sub-report's cut, attached by `scheduleOf` with `overrides`: a saved cell belongs to the nearest of them (#485, `joineryOverrideOf`). */
  groups?: readonly ScheduleEntry[];
}

/** An occurrence's mark: its type's mark and its number (`W1.3`); the type's name and the number for an untyped element. */
export const occurrenceMark: (entry: Pick<ScheduleEntry, 'mark' | 'name'>, o: Pick<ScheduleOccurrence, 'number'>) => string = occurrenceMarkOf;

/** A model as the reads see it: the parsed store and, in the app, the edit overlay on top of it. */
export interface Live { dataStore: IfcDataStore; view: MutablePropertyView | null }

export interface ScheduleModel extends Live {
  modelId: string;
  /** The model's name, as the list provider labels it ("used in"). Default: none. */
  name?: string;
  /** An entity's Name. Default: the one the store holds (`storedName`); the app passes its overlay-aware read. */
  nameOf?: (id: number) => string;
  /** The Lists engine's provider over the model, for the model rows. Default: the headless one over the store; the app passes its own, which sees the edit overlay. */
  listProvider?: () => ListDataProvider;
  /** An element's meshes (viewer frame, metres), for measuring the size of a door or window whose IFC states none (#485); without it such an element has no size. */
  meshesOf?: (expressId: number) => readonly MeshData[] | undefined;
}

/** What the project contributes to a joinery schedule. */
export interface JoineryProject {
  /** The project's joinery catalogue. */
  joineryTypes: readonly JoinerySpec[];
  joineryMapping: JoineryMapping;
  /** Flips per element GlobalId, for the app's drawings; absent in a headless read. */
  symbolFlips?: Record<string, number>;
  /** The project's opening-line convention in elevation (`handle`: apex at the handle; `hinge`: at the hinges); absent: `handle`. */
  openingLines?: 'handle' | 'hinge';
}

export { attributes, propertySetsOf, readPropertyFacts, storedName, typeIndex } from './joinery-live-reads.js';

const real = (v: unknown): number => (typeof v === 'number' ? v : v && typeof v === 'object' && 'real' in v ? Number((v as { real: number }).real) : NaN);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

const CLASS_NAMES: Record<string, string> = { IFCDOOR: 'IfcDoor', IFCDOORSTANDARDCASE: 'IfcDoorStandardCase', IFCWINDOW: 'IfcWindow', IFCWINDOWSTANDARDCASE: 'IfcWindowStandardCase' };

/** A configured element: its type, and how it is turned in its opening. */
export interface JoineryElement extends JoineryTypeRead {
  flips: number;
}

/** The configured joinery type behind a door or window, or null when its type carries none. */
export function joineryOfElement(live: Live, expressId: number, types: ReadonlyMap<number, number | null>): JoineryElement | null {
  try {
    const typeId = types.get(expressId) ?? null;
    const type = typeId === null ? null : readJoineryType(live.dataStore, typeId, live.view);
    return type ? { ...type, flips: readJoineryFlips(live.dataStore, expressId, live.view) } : null;
  } catch {
    return null;
  }
}

/**
 * What the mapping matches a door or window by; null for anything else. `typeIdOf` finds the element's type; a
 * caller reading many elements passes one backed by a `typeIndex`, so the model's types are read once.
 */
export function elementFacts(live: Live, expressId: number, typeIdOf: (live: Live, expressId: number) => number | null): ElementFacts | null {
  const { dataStore, view } = live;
  const entity = view?.getNewEntity(expressId) ?? dataStore.getEntity(expressId);
  const cls = String(entity?.type ?? '').toUpperCase();
  if (!/^IFC(DOOR|WINDOW)(STANDARDCASE)?$/.test(cls)) return null;
  const attrs = attributes(live, expressId);
  if (!attrs) return null;
  const unit = getModelLengthUnitScale(dataStore) || 1;
  const height = real(attrs[8]) * unit, width = real(attrs[9]) * unit;
  let typeId: number | null = null;
  try { typeId = typeIdOf(live, expressId); } catch { typeId = null; }
  const typeAttrs = typeId === null ? null : attributes(live, typeId);
  const names = [text(typeAttrs?.[2]), text(attrs[4]), text(attrs[2])].filter((n): n is string => n !== null);
  return {
    kind: cls.startsWith('IFCDOOR') ? 'door' : 'window',
    globalId: text(attrs[0]),
    typeGlobalId: text(typeAttrs?.[0]),
    names,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

export interface DrawnJoinery {
  spec: JoinerySpec;
  /** How the body is turned in its opening (the model's own flips, or the project's per-element flips for a mapped one). */
  flips: number;
  /** 'model': the IFC's configured type; otherwise how the mapping found the entry. */
  source: 'model' | MappingSource;
  /** The catalogue entry (mapped elements), unfitted. */
  entry?: JoinerySpec;
}

/**
 * The joinery a door or window is DRAWN with: the configured type the model gives it, else the catalogue entry the
 * project's symbol mapping picks, fitted to the element's size. `types` is the model's `typeIndex`.
 */
export function drawnJoineryOf(live: Live, expressId: number, project: JoineryProject, types: ReadonlyMap<number, number | null>): DrawnJoinery | null {
  const own = joineryOfElement(live, expressId, types);
  if (own) return { spec: own.spec, flips: own.flips, source: 'model' };
  const facts = elementFacts(live, expressId, (_, id) => types.get(id) ?? null);
  const match = facts ? resolveMapping(project.joineryMapping, [...project.joineryTypes], facts) : null;
  if (!facts || !match) return null;
  const flips = facts.globalId ? project.symbolFlips?.[facts.globalId] ?? 0 : 0;
  return { spec: fitToElement(match.entry, facts), flips, source: match.source, entry: match.entry };
}

/**
 * The groups of doors and windows the model gives no type (class and size) have no mark to read, so the Mark row would
 * be blank for every column. Mark each D1, D2... / W1, W2... in schedule order, skipping a mark a configured type holds.
 */
function markUntyped(entries: ScheduleEntry[]): void {
  const taken = new Set(entries.filter((e) => e.spec).map((e) => e.mark));
  const last = { door: 0, window: 0 };
  for (const e of entries) {
    if (e.spec) continue;
    const prefix = e.kind === 'door' ? 'D' : 'W';
    let mark: string;
    do mark = `${prefix}${++last[e.kind]}`; while (taken.has(mark));
    e.mark = mark;
  }
}

/**
 * The rows of the joinery schedule of `kind` over `models`, the project's catalogue and mapping applied; with `content`, sorted and numbered
 * as that choice says (`applyContent`, the one rule), which a schedule saved with a choice prints and a project without one does not.
 */
export function joineryScheduleData(models: Iterable<ScheduleModel>, project: JoineryProject, kind: ScheduleKind = 'all', content?: ScheduleContent, propertyNames: readonly string[] = [], modelRows: readonly ModelRow[] = []): ScheduleData {
  // The properties read are the ones a filter names (the project's, given by the caller, and this content's own) and IsExternal.
  const names = new Set(filterPropertyNames([content?.filter]).concat(propertyNames.map((n) => n.toLowerCase())));
  // The model rows read are those the caller names (all the project's schedules') and this content's own.
  const rows = [...new Map([...modelRows, ...(content?.properties ?? [])].map((r) => [r.id, r] as const)).values()];
  return applyContent(readRows(models, project, kind, names, rows), content);
}

/** The model's rows, in the order and with the marks the models give them. */
function readRows(models: Iterable<ScheduleModel>, project: JoineryProject, kind: ScheduleKind, propertyNames: ReadonlySet<string>, modelRows: readonly ModelRow[]): ScheduleData {
  const byKey = new Map<string, ScheduleEntry>(), measuredOf = new Map<string, { width: number; height: number }>();
  const levelElevation = new Map<string, number>();
  const wanted = (k: 'door' | 'window') => kind === 'all' || kind === k;
  const fromCatalogue = new Map(project.joineryTypes.map((spec) => [spec.id, spec]));

  for (const model of models) {
    const { modelId, dataStore, view } = model;
    const live: Live = { dataStore, view };
    const nameOf = model.nameOf ?? ((id: number) => storedName(dataStore, id));
    const hierarchy = dataStore.spatialHierarchy;
    const levelOf = (id: number): string => {
      const storey = hierarchy?.elementToStorey.get(id);
      if (storey === undefined) return '—';
      const name = nameOf(storey) || `#${storey}`;
      levelElevation.set(name, hierarchy?.storeyElevations.get(storey) ?? 0);
      return name;
    };
    const count = (entry: ScheduleEntry, id: number) => {
      const level = levelOf(id);
      entry.counts[level] = (entry.counts[level] ?? 0) + 1;
      entry.total++;
      const attrs = attributes(live, id);
      const tag = attrs?.[7];
      const cls = String(dataStore.getEntity(id)?.type ?? view?.getNewEntity(id)?.type ?? '').toUpperCase();
      // PredefinedType follows OverallWidth in both classes (IFC4 and later); IFC2X3 has none.
      const predefined = dataStore.schemaVersion === 'IFC2X3' ? null : predefinedTypeText(attrs?.[10]);
      entry.occurrences.push({
        modelId, expressId: id, globalId: String(attrs?.[0] ?? ''), level, tag: typeof tag === 'string' ? tag : null, number: 0,
        ifcClass: CLASS_NAMES[cls] ?? cls, predefinedType: predefined, properties: readPropertyFacts(live, id, propertyNames),
      });
    };
    const typed = new Set<number>();
    let configured: ReturnType<typeof joineryTypesInStore> = [];
    try { configured = joineryTypesInStore(dataStore, view); } catch { configured = []; }
    for (const type of configured) {
      if (!wanted(type.spec.kind)) continue;
      // The catalogue's current entry wins over the copy stored in the model.
      const spec = (type.spec.id && fromCatalogue.get(type.spec.id)) || type.spec;
      const key = spec.id ?? `${modelId}:${type.typeId}`;
      const entry = byKey.get(key) ?? { key, kind: spec.kind, spec, mark: spec.mark, name: spec.name, width: spec.width, height: spec.height, counts: {}, total: 0, occurrences: [] };
      if (!entry.typeGlobalId && type.globalId) entry.typeGlobalId = type.globalId;
      byKey.set(key, entry);
      for (const id of occurrencesOfTypeInStore(dataStore, type.typeId, view)) {
        if (view?.isDeleted(id)) continue;
        typed.add(id);
        count(entry, id);
      }
    }
    // Doors and windows without a configured type, by class and size.
    const unit = getModelLengthUnitScale(dataStore) || 1;
    let types: Map<number, number | null> | undefined;
    for (const { expressId: id, type } of iterateEffectiveEntityIds(dataStore, view, ['IFCDOOR', 'IFCWINDOW', 'IFCDOORSTANDARDCASE', 'IFCWINDOWSTANDARDCASE'])) {
      if (typed.has(id)) continue;
      const k: 'door' | 'window' = String(type).toUpperCase().startsWith('IFCDOOR') ? 'door' : 'window';
      if (!wanted(k)) continue;
      const attrs = attributes(live, id);
      if (!attrs) continue;
      // Mapped to a catalogue entry by the project (`joinery-mapping.ts`): listed with that entry.
      types ??= typeIndex(live);
      const mapped = drawnJoineryOf(live, id, project, types)?.entry;
      const mappedSpec = mapped?.id ? fromCatalogue.get(mapped.id) : undefined;
      if (mappedSpec?.id) {
        const entry = byKey.get(mappedSpec.id) ?? { key: mappedSpec.id, kind: mappedSpec.kind, spec: mappedSpec, mark: mappedSpec.mark, name: mappedSpec.name, width: mappedSpec.width, height: mappedSpec.height, counts: {}, total: 0, occurrences: [] };
        byKey.set(mappedSpec.id, entry);
        count(entry, id);
        if (mappedSpec.id.startsWith(TYPE_ENTRY_PREFIX)) noteMeasured(entry, measuredOf, statedOrMeasuredSize(real(attrs[9]) * unit, real(attrs[8]) * unit, () => model.meshesOf?.(id)));
        continue;
      }
      // No OverallWidth / OverallHeight (a non-parametric window): the side the IFC does not state is measured from its body, in its own frame (#485).
      const { width, height, measuredWidth, measuredHeight } = statedOrMeasuredSize(real(attrs[9]) * unit, real(attrs[8]) * unit, () => model.meshesOf?.(id));
      const size = Number.isFinite(width) && Number.isFinite(height) ? `${Math.round(width * 1000)}×${Math.round(height * 1000)}` : '?';
      const stated = k === 'door' ? doorOperationOf(live, id, (types ??= typeIndex(live)).get(id) ?? null) : null;
      const operation = stated?.hinge ? (`${stated.doubleActing ? 'double-acting' : 'swing'}-${stated.hinge}` as NonNullable<ScheduleEntry['operations']>[number]) : undefined;
      const key = `untyped:${k}:${size}`;
      const entry = byKey.get(key) ?? {
        key, kind: k, spec: null, mark: '—', name: k === 'door' ? 'Door' : 'Window',
        width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0, counts: {}, total: 0, occurrences: [],
      };
      byKey.set(key, entry);
      if (operation && !entry.operations?.includes(operation)) (entry.operations ??= []).push(operation);
      count(entry, id);
      if (measuredWidth || measuredHeight) Object.assign(entry.occurrences[entry.occurrences.length - 1], { measured: true, measuredWidth, measuredHeight });
    }
    // The model rows the schedules chose, read for this model's occurrences in one pass.
    if (modelRows.length > 0) {
      const mine = [...byKey.values()].flatMap((e) => e.occurrences.filter((o) => o.modelId === modelId));
      const values = readModelRowCells({ modelId, dataStore, provider: model.listProvider ?? (() => createHeadlessListProvider(dataStore)) }, mine.map((o) => o.expressId), modelRows);
      for (const o of mine) {
        const v = values.get(o.expressId);
        if (!v) continue;
        o.modelValues = v.texts;
        if (Object.keys(v.numbers).length > 0) o.modelNumbers = v.numbers;
      }
    }
  }
  fillTypedValues(byKey.values(), modelRows);
  // Catalogue types not placed yet still belong in the schedule (with no count).
  for (const spec of fromCatalogue.values()) {
    if (!spec.id || byKey.has(spec.id) || !wanted(spec.kind)) continue;
    byKey.set(spec.id, { key: spec.id, kind: spec.kind, spec, mark: spec.mark, name: spec.name, width: spec.width, height: spec.height, counts: {}, total: 0, occurrences: [] });
  }
  const entries = [...byKey.values()]
    .filter((e) => e.total > 0 || e.spec)
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'window' ? -1 : 1) || (a.spec ? 0 : 1) - (b.spec ? 0 : 1)
      || a.mark.localeCompare(b.mark, undefined, { numeric: true }) || a.width - b.width);
  markUntyped(entries); markMeasuredTypes(entries, measuredOf);
  for (const e of entries) if (!e.spec && e.occurrences.length > 0 && e.occurrences.every((o) => o.measured)) {
    e.measuredWidth = e.occurrences.every((o) => o.measuredWidth);
    e.measuredHeight = e.occurrences.every((o) => o.measuredHeight);
    e.measured = e.measuredWidth || e.measuredHeight;
  }
  const levels = [...levelElevation.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  if (entries.some((e) => e.counts['—'])) levels.push('—');
  // Number each type's occurrences: lowest level first, then by model and id, so the numbering is stable.
  const order = new Map(levels.map((l, i) => [l, i]));
  for (const e of entries) {
    e.occurrences.sort((a, b) => (order.get(a.level) ?? 99) - (order.get(b.level) ?? 99) || a.modelId.localeCompare(b.modelId) || a.expressId - b.expressId);
    e.occurrences.forEach((o, i) => { o.number = i + 1; });
  }
  return { entries, levels };
}
