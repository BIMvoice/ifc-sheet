/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Text cells on a schedule (#186, section 4): rows the user adds to a joinery
 * schedule that do not come from the IFC model (a manufacturer, a remark, a
 * note per type) and fills in by hand. A row has a label; its cells are keyed
 * by the identity of the TYPE they describe, the schedule entry's `key` (the
 * catalogue id of a configured type, which every occurrence of it in every
 * model shares), never by a column position, which moves whenever a type is
 * added, removed or sorted.
 *
 * A key that the model no longer lists is an ORPHAN: its text is kept (a
 * model update, a model not loaded yet or a wrong file must never destroy what
 * somebody typed), is not printed (there is no column for it), and is listed
 * by `orphanCells` so the user can see it and remove it. Each cell remembers
 * `about`, the type's description at the time it was typed, so an orphan can
 * be recognised once its type is gone.
 *
 * A sub-report prints the text of the schedule it was cut from (`textRowsOf`):
 * one place to edit, and the parts of a split show the cells of their types.
 *
 * Pure and generic over the schedule shape, so the web app and the headless
 * engine read, edit and resolve the text the same way.
 */

export interface ScheduleTextCell {
  text: string;
  /** What the key stood for when the text was typed ("D1 Interior door 900×2100"): how an orphan is recognised. */
  about: string;
}

export interface ScheduleTextRow {
  id: string;
  label: string;
  /** By the schedule entry's key. */
  cells: Record<string, ScheduleTextCell>;
}

/** Rows a schedule may carry: each is a row of every card, so the table's height is bounded. */
export const MAX_TEXT_ROWS = 8;
export const MAX_TEXT_LENGTH = 200;
export const MAX_LABEL_LENGTH = 40;

/** A key that would be written as the object's prototype instead of a cell. */
const unsafe = (key: string): boolean => key === '__proto__';

/** One line: line breaks and control characters become a space, runs of spaces one, and the ends are trimmed. */
export function cleanText(raw: unknown, max = MAX_TEXT_LENGTH): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

const readCell = (raw: unknown): ScheduleTextCell | null => {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  const text = cleanText(o ? o.text : raw);
  return text ? { text, about: cleanText(o?.about, 120) } : null;
};

/** The rows as saved, read back: damaged fields are dropped, empty cells are not kept, and a file with none is `undefined` (an ordinary schedule). */
export function readScheduleTextRows(raw: unknown): ScheduleTextRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: ScheduleTextRow[] = [];
  for (const r of raw) {
    if (rows.length >= MAX_TEXT_ROWS || typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || rows.some((x) => x.id === o.id)) continue;
    const cells: Record<string, ScheduleTextCell> = {};
    const source = typeof o.cells === 'object' && o.cells !== null ? (o.cells as Record<string, unknown>) : {};
    for (const key of Object.keys(source)) {
      const cell = unsafe(key) ? null : readCell(source[key]);
      if (cell) cells[key] = cell;
    }
    rows.push({ id: o.id, label: cleanText(o.label, MAX_LABEL_LENGTH), cells });
  }
  return rows.length ? rows : undefined;
}

/** `rows` with a new empty row; unchanged when the id is taken or the schedule is full. */
export function addTextRow(rows: readonly ScheduleTextRow[] | undefined, id: string, label: string): ScheduleTextRow[] {
  const base = rows ?? [];
  if (base.length >= MAX_TEXT_ROWS || base.some((r) => r.id === id)) return [...base];
  return [...base, { id, label: cleanText(label, MAX_LABEL_LENGTH), cells: {} }];
}

export function renameTextRow(rows: readonly ScheduleTextRow[] | undefined, id: string, label: string): ScheduleTextRow[] {
  return (rows ?? []).map((r) => (r.id === id ? { ...r, label: cleanText(label, MAX_LABEL_LENGTH) } : r));
}

/** `rows` without the row and all its text. */
export function removeTextRow(rows: readonly ScheduleTextRow[] | undefined, id: string): ScheduleTextRow[] {
  return (rows ?? []).filter((r) => r.id !== id);
}

/** `rows` with the cell of `key` in row `rowId` set to `text`; empty text clears the cell. `about` describes the type for later. */
export function setTextCell(rows: readonly ScheduleTextRow[] | undefined, rowId: string, key: string, text: string, about: string): ScheduleTextRow[] {
  return (rows ?? []).map((r) => {
    if (r.id !== rowId || unsafe(key)) return r;
    const clean = cleanText(text);
    const cells = { ...r.cells };
    if (clean) cells[key] = { text: clean, about: cleanText(about, 120) };
    else delete cells[key];
    return { ...r, cells };
  });
}

/** What row `row` prints for the entry `key`: its text, or nothing. */
export const textCellText = (row: Pick<ScheduleTextRow, 'cells'>, key: string): string =>
  (Object.prototype.hasOwnProperty.call(row.cells, key) ? row.cells[key].text : '');

/** The shape `textRowsOf` needs of a schedule. */
export interface TextHolder {
  id: string;
  sub?: { parent: string };
  textRows?: ScheduleTextRow[];
}

/** The schedule whose text `schedule` prints: the one it was cut from while that exists, else itself. */
export function textOwner<S extends TextHolder>(schedules: readonly S[], schedule: Pick<S, 'id' | 'sub'>): S | undefined {
  const parent = schedule.sub ? schedules.find((s) => s.id === schedule.sub!.parent && !s.sub) : undefined;
  return parent ?? schedules.find((s) => s.id === schedule.id);
}

/** The text rows a schedule prints; none when it has none. */
export function textRowsOf(schedules: readonly TextHolder[], schedule: Pick<TextHolder, 'id' | 'sub'>): ScheduleTextRow[] | undefined {
  const rows = textOwner(schedules, schedule)?.textRows;
  return rows?.length ? rows : undefined;
}

export interface OrphanCell {
  rowId: string;
  rowLabel: string;
  key: string;
  text: string;
  about: string;
}

/** The text whose key is not in `liveKeys` (the types the model lists now): kept, not printed, shown to the user to remove. */
export function orphanCells(rows: readonly ScheduleTextRow[] | undefined, liveKeys: ReadonlySet<string>): OrphanCell[] {
  return (rows ?? []).flatMap((r) =>
    Object.keys(r.cells).filter((key) => !liveKeys.has(key)).map((key) => ({ rowId: r.id, rowLabel: r.label, key, text: r.cells[key].text, about: r.cells[key].about })));
}
