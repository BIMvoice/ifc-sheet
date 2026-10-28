/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78): the project saves the definition of a list (which elements, which columns, how to group
 * and total them) and the sheet prints what the Lists panel computes for it, so the two cannot show different numbers.
 *
 * What lives here is the part that needs no model, so the app, the command line and the MCP tools read and write it alike:
 *  - the definition as the project saves it (`ListScheduleDef`) and its reader, which drops what is damaged;
 *  - the table a result becomes (`listScheduleTable`): the rows the sheet draws, the CSV and the XLSX write, in one shape.
 *
 * The rows themselves are the Lists engine's (`@ifc-lite/lists`, `executeList` and `summariseListRows`), run by the app over its
 * providers (`apps/viewer/src/lib/lists/list-schedule-run.ts`). Which elements a list keeps is the schedule filter's (`schedule-filter.ts`,
 * #287): `filter.classes` picks the IFC classes, the other dimensions cut the elements those classes give.
 */

import { isOpenFilter, readSubReportFilter, type SubReportFilter } from './schedule-filter.js';
import type { ExportTable } from './schedule-csv.js';
import type { NumberKind } from './units-and-numbers.js';
import { readListOverrides, type ListCellOverride } from './list-overrides.js';

/** Where a column's value comes from (the Lists engine's sources a schedule can read from a model's elements). */
const LIST_COLUMN_SOURCES = ['attribute', 'property', 'quantity', 'material', 'classification', 'officeClassification', 'spatial'] as const;
type ListColumnSource = (typeof LIST_COLUMN_SOURCES)[number];

/** The most columns a list schedule keeps; a damaged file cannot grow the project without bound. */
const MAX_LIST_COLUMNS = 40;

export interface ListScheduleColumn {
  /** Unique among the columns; grouping and sums name it. */
  id: string;
  source: ListColumnSource;
  /** The property set or quantity set (`Qto_WallBaseQuantities`); property and quantity columns. For `officeClassification`: the id of the classification mapping (absent: the project's first). */
  psetName?: string;
  /** The attribute (`Name`, `Type`), property or quantity (`NetSideArea`), the spatial level (`Storey`), or `Code` / `Title` of the office classification (#351). */
  propertyName: string;
  /** The heading, when it is not the property's name. */
  label?: string;
  /** Not printed (the sheet, the CSV and the XLSX leave it out). It still groups and sums. */
  hidden?: true;
}

/** What a list schedule saves. */
export interface ListScheduleDef {
  /** Which elements: `classes` the IFC classes (absent: every element), and the storeys, predefined types and property tests that cut them. Only these four dimensions are read. */
  filter?: SubReportFilter;
  /** The columns, in the order they print. */
  columns: ListScheduleColumn[];
  /** Group by these columns, outermost first: one printed row per combination, with its count and the sums. Absent: a row per element. */
  groupBy?: string[];
  /** Sum these columns per group and in all (needs `groupBy`). */
  sum?: string[];
  /** The totals row under a grouped list. Printed unless `false`. */
  totals?: false;
  /** Cells whose value the user typed over the model's (#446), keyed by the element's GlobalId and the column's property key (`list-overrides.ts`). */
  overrides?: ListCellOverride[];
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function readColumn(raw: unknown): ListScheduleColumn | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const source = LIST_COLUMN_SOURCES.find((s) => s === o.source);
  const id = text(o.id), propertyName = text(o.propertyName);
  if (!source || !id || !propertyName) return null;
  const out: ListScheduleColumn = { id, source, propertyName };
  const pset = text(o.psetName), label = text(o.label);
  if (pset) out.psetName = pset;
  if (label) out.label = label;
  if (o.hidden === true) out.hidden = true;
  return out;
}

/** The filter of a list schedule as saved: the four dimensions a list reads; joinery's `kinds` and `types` have no meaning here. */
function readListFilter(raw: unknown): SubReportFilter | undefined {
  const { classes, levels, predefined, properties } = readSubReportFilter(raw);
  const filter: SubReportFilter = { ...(classes ? { classes } : {}), ...(levels ? { levels } : {}), ...(predefined ? { predefined } : {}), ...(properties ? { properties } : {}) };
  return isOpenFilter(filter) ? undefined : filter;
}

/** Ids from `raw` that name a column, once each, in the order saved; `undefined` when none does. */
function columnIds(raw: unknown, known: ReadonlySet<string>): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter((s): s is string => typeof s === 'string' && known.has(s)))];
  return ids.length > 0 ? ids : undefined;
}

/** A list schedule's definition as saved, read back: a damaged column is dropped, a grouping or sum that names no column is dropped, so an old or damaged file loads as a plainer list. */
export function readListScheduleDef(raw: unknown): ListScheduleDef {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const columns: ListScheduleColumn[] = [];
  for (const c of Array.isArray(o.columns) ? o.columns : []) {
    const column = readColumn(c);
    if (column && !seen.has(column.id) && columns.length < MAX_LIST_COLUMNS) { seen.add(column.id); columns.push(column); }
  }
  const out: ListScheduleDef = { columns };
  const filter = readListFilter(o.filter);
  if (filter) out.filter = filter;
  const groupBy = columnIds(o.groupBy, seen);
  if (groupBy) out.groupBy = groupBy;
  // Sums belong to a grouping: a list of elements has no group to sum.
  const sum = groupBy ? columnIds(o.sum, seen) : undefined;
  if (sum) out.sum = sum;
  if (o.totals === false) out.totals = false;
  const overrides = readListOverrides(o.overrides);
  if (overrides) out.overrides = overrides;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------------------------------

/** What a figure column measures. The sheet writes a length, an area and a volume with the project's decimals (#88); a count is whole. */
export type ListFigureKind = NumberKind | 'count';

/** The id of the Count column a grouped list gets (the Lists engine's own). */
export const LIST_COUNT_ID = '__count';

/** The `QuantityType` numbers (`@ifc-lite/data`) a quantity column resolves to. */
const QUANTITY_KIND: Record<number, ListFigureKind> = { 0: 'length', 1: 'area', 2: 'volume', 3: 'count', 6: 'count' };

/** What a quantity column measures, from the `quantityType` the Lists engine annotates it with; `undefined` for weight, time and anything else. */
export const listFigureKind = (quantityType: number | undefined): ListFigureKind | undefined => (quantityType === undefined ? undefined : QUANTITY_KIND[quantityType]);

export type ListCell = string | number | boolean | null;

/** A list as the Lists engine's export model holds it, in the part the schedule reads: the columns as shown, the rows, the totals row. */
export interface ListTableSource {
  columns: readonly { id: string; label: string; numeric: boolean; kind?: ListFigureKind }[];
  rows: readonly (readonly ListCell[])[];
  /** The totals row, aligned with `columns`; `null` for none. */
  totals: readonly ListCell[] | null;
  /** The GlobalId of each row, when a row is an element (not a group). */
  guids?: readonly string[];
  /** Per row, the indexes of the columns whose cell is an override (#446). */
  overridden?: readonly (readonly number[])[];
  /** The summed columns that some rows state no value for (their totals leave those rows out), and the sentences saying so (`listTableSourceOf`). */
  missing?: readonly ListMissing[];
  notes?: readonly string[];
}

/** A summed column over rows that do not all state it: `missing` of the `rows` rows are left out of its total. */
export interface ListMissing {
  column: string;
  missing: number;
  rows: number;
}

export interface ListTableWords {
  yes: string;
  no: string;
}

/** The table in the shape the app's export writer takes (`ExportTable`), with the kind of every figure column. */
export interface ListScheduleTable {
  name: string;
  header: string[];
  rows: (string | number | null)[][];
  bold: number[];
  numeric: number[];
  kinds: Record<number, ListFigureKind>;
  /** The id of each printed column, in order (a table built by hand may omit it). */
  columnIds?: string[];
  /** The GlobalId of each row that is an element (the totals row has none); absent for a grouped list. */
  guids?: string[];
  /** Per row, the printed columns whose cell is an override (#446): the editor marks them, the print does not. */
  overridden?: number[][];
  /** The totals that leave rows out because they state no value, and the lines saying so; empty when every row states every summed value. */
  missing: ListMissing[];
  notes: string[];
}

/** A figure without the float noise of a long sum (`0.30000000000000004`): six decimals are far below any quantity a schedule states. */
const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * The table of a list: its columns without the hidden ones, a row each, the totals row last and bold. Figures are plain numbers (the
 * sheet formats them, the files keep them), text and booleans are cells of text. The one table behind the sheet, the CSV and the XLSX.
 */
export function listScheduleTable(source: ListTableSource, def: Pick<ListScheduleDef, 'columns'>, name: string, words: ListTableWords): ListScheduleTable {
  const hidden = new Set(def.columns.filter((c) => c.hidden).map((c) => c.id));
  const keep = source.columns.map((c, i) => (hidden.has(c.id) ? -1 : i)).filter((i) => i >= 0);
  const cell = (v: ListCell | undefined): string | number | null => (v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? words.yes : words.no) : typeof v === 'number' ? (Number.isFinite(v) ? tidy(v) : null) : v);
  const row = (values: readonly ListCell[]) => keep.map((i) => cell(values[i]));
  const rows = source.rows.map(row);
  const bold: number[] = [];
  if (source.totals) { bold.push(rows.length); rows.push(row(source.totals)); }
  const kinds: Record<number, ListFigureKind> = {};
  keep.forEach((i, c) => { const kind = source.columns[i].kind; if (kind) kinds[c] = kind; });
  const at = new Map(keep.map((i, c) => [i, c] as const));
  return {
    name, header: keep.map((i) => source.columns[i].label), rows, bold,
    numeric: keep.flatMap((i, c) => (source.columns[i].numeric ? [c] : [])), kinds, columnIds: keep.map((i) => source.columns[i].id),
    ...(source.guids ? { guids: [...source.guids] } : {}),
    ...(source.overridden ? { overridden: source.overridden.map((cols) => cols.flatMap((i) => at.get(i) ?? [])) } : {}),
    missing: [...(source.missing ?? [])], notes: [...(source.notes ?? [])],
  };
}

/** The table in the shape the CSV and XLSX writers take (`ExportTable`): a count has no decimals of its own, so it names no kind. */
export function listExportTable(table: ListScheduleTable): ExportTable {
  const kinds: Record<number, NumberKind> = {};
  for (const [column, kind] of Object.entries(table.kinds)) if (kind !== 'count') kinds[Number(column)] = kind;
  return { name: table.name, header: table.header, rows: table.rows, bold: table.bold, numeric: table.numeric, kinds, ...(table.notes.length ? { notes: table.notes } : {}) };
}
