/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #269: every number a sheet prints for people goes through one formatter and
 * follows the language: dimensions, level marks, label tags,
 * quantities and schedules. The numbers a machine reads (CSV, DXF, SVG
 * coordinates, parsing) do not.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout, formatLevel } from '@/drafting/annotation';
import { formatDimension } from '@/drafting/styles';
import type { AnnotationShape } from '@/drafting/types';
import { formatValue, parseFormatSpec } from '@/labels/label-format';
import { layoutTypeQuantities, typeQuantityTable, type TypeQuantityLabels } from '@/joinery/type-quantities-layout';
import { joineryCsv, tableCsv } from '@/joinery/export-test-util';
import { layoutMaterialTakeoff, takeoffTable } from '@/joinery/material-takeoff-layout';
import { finishTable, layoutRoomFinishes, type RoomFinishLabels, roomFinishes } from '@bimvoice/ifcsheet';
import { layoutSchedule, type ScheduleLabels } from '@/joinery/schedule-layout';
import type { TypeQuantities } from '@/joinery/type-quantities';
import type { ScheduleData } from '@/joinery/schedule-data';
import { defaultWindowSpec } from '@ifc-lite/create';

const textsOf = (prims: readonly { kind: string; text?: string }[]) => prims.flatMap((p) => (p.kind === 'text' && p.text !== undefined ? [p.text] : []));

describe('level marks, dimensions and tags follow the language (#269)', () => {
  it('writes a level mark with the language\'s decimal and ±0 at zero', () => {
    assert.equal(formatLevel('ro', 0), '±0,00');
    assert.equal(formatLevel('ro', 3.06), '+3,06');
    assert.equal(formatLevel('ro', -3.98), '−3,98');
    assert.equal(formatLevel('en', -3.98), '−3.98');
  });

  it('writes a dimension in the style\'s unit and precision, never grouped', () => {
    assert.equal(formatDimension('ro', 3.2456, { unit: 'm', precision: 2 }), '3,25');
    assert.equal(formatDimension('en', 3.2456, { unit: 'm', precision: 2 }), '3.25');
    assert.equal(formatDimension('ro', 12.3456, { unit: 'mm', precision: 0 }), '12346');
    assert.equal(formatDimension('en', 12.3456, { unit: 'mm', precision: 0 }), '12346');
  });

  it('a dimension\'s label follows the language and its geometry does not', () => {
    const shape: Extract<AnnotationShape, { type: 'dimension' }> = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 3.25, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 };
    const ro = dimensionLayout(shape, { format: (m) => formatDimension('ro', m, { unit: 'm', precision: 2 }), locale: 'ro' });
    const en = dimensionLayout(shape, { format: (m) => formatDimension('en', m, { unit: 'm', precision: 2 }), locale: 'en' });
    assert.equal(ro.label, '3,25');
    assert.equal(en.label, '3.25');
    assert.deepEqual({ ...ro, label: '' }, { ...en, label: '' });
  });

  it('writes a label tag\'s numbers in the language, by the pattern the author wrote', () => {
    assert.equal(formatValue(12.3456, parseFormatSpec('0.00 m²'), 'ro'), '12,35 m²');
    assert.equal(formatValue(12.3456, parseFormatSpec('0.00 m²'), 'en'), '12.35 m²');
    assert.equal(formatValue(1234567.891, parseFormatSpec('#,##0.0'), 'ro'), '1.234.567,9');
    assert.equal(formatValue(2.5, undefined, 'ro'), '2,5');
    assert.equal(formatValue('12.5', parseFormatSpec('0.00'), 'ro'), '12,50');
    assert.equal(formatValue(-0.001, parseFormatSpec('0.00'), 'ro'), '0,00');
  });
});

const TQ: TypeQuantities = {
  levels: ['EG'],
  rows: [{ typeName: 'W1', className: 'IfcWall', byLevel: { EG: { count: 2, length: 12.5, area: 1234.5, volume: 3.25, noQto: 0 } }, total: { count: 2, length: 12.5, area: 1234.5, volume: 3.25, noQto: 0 } }],
  classTotals: [],
} as unknown as TypeQuantities;
const TQ_LABELS = (locale: string): TypeQuantityLabels => ({
  locale, title: 'T', type: 'Type', class: 'Class', level: 'Level', count: 'Count', length: 'Length', area: 'Area', volume: 'Volume', noQto: 'None', total: 'Total', noType: 'no type', noLevel: 'no level', classification: 'Classification', classificationTitle: 'Title', unclassified: 'No classification',
});
const FIN_LABELS = (locale: string): RoomFinishLabels => ({ locale, title: 'T', number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'Area', sharedNote: '*' });

describe('schedules and quantities follow the language, their CSV does not (#269)', () => {
  it('type quantities', () => {
    const ro = textsOf(layoutTypeQuantities(TQ, TQ_LABELS('ro')).prims);
    assert.ok(ro.includes('12,50') && ro.includes('1.234,50') && ro.includes('3,25'), ro.join(' | '));
    const en = textsOf(layoutTypeQuantities(TQ, TQ_LABELS('en')).prims);
    assert.ok(en.includes('12.50') && en.includes('1,234.50'), en.join(' | '));
    // A file for a machine: plain numbers, the same in both.
    const csv = (locale: string) => tableCsv(typeQuantityTable(TQ, TQ_LABELS(locale)));
    assert.equal(csv('ro'), csv('en'));
    assert.match(csv('ro'), /,12\.5,1234\.5,3\.25,/);
  });

  it('material takeoff', () => {
    const rows = [{ material: 'Beton', elements: 3, volume: 12.5, area: 1234.5, classes: ['IfcWall'] }];
    const labels = (locale: string) => ({ locale, title: 'T', material: 'M', elements: 'E', volume: 'V', area: 'A', usedIn: 'U', total: 'Tot' });
    assert.ok(textsOf(layoutMaterialTakeoff(rows, labels('ro')).prims).includes('1.234,50'));
    assert.ok(textsOf(layoutMaterialTakeoff(rows, labels('en')).prims).includes('1,234.50'));
    assert.equal(tableCsv(takeoffTable(rows, labels('ro'))), tableCsv(takeoffTable(rows, labels('en'))));
  });

  it('room finishes', () => {
    const rooms = roomFinishes([{ number: '101', name: 'Living', level: 'EG', elevation: 0, covers: [{ id: 'm#1', name: 'Parquet', predefinedType: 'FLOORING', area: 24.5 }], boundary: [], contained: [], properties: {} }]);
    const ro = textsOf(layoutRoomFinishes(rooms, FIN_LABELS('ro')).prims);
    const en = textsOf(layoutRoomFinishes(rooms, FIN_LABELS('en')).prims);
    assert.ok(ro.includes('24,50'), ro.join(' | '));
    assert.ok(en.includes('24.50'), en.join(' | '));
    assert.equal(tableCsv(finishTable(rooms, FIN_LABELS('ro'))), tableCsv(finishTable(rooms, FIN_LABELS('en'))));
  });

  it('the joinery schedule\'s U value, and nothing else on it changes', () => {
    const labels = (locale: string): ScheduleLabels => ({ locale, title: 'S', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Op', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (o) => o });
    const data: ScheduleData = {
      levels: ['EG'],
      entries: [{ key: 'w1', kind: 'window', spec: defaultWindowSpec('W'), mark: 'W1', name: 'W', width: 1.2, height: 1.5, counts: { EG: 3 }, total: 3, occurrences: [] }],
    };
    const ro = textsOf(layoutSchedule(data, labels('ro')).prims);
    const en = textsOf(layoutSchedule(data, labels('en')).prims);
    assert.ok(ro.includes('1,1'), ro.join(' | '));
    assert.ok(en.includes('1.1'), en.join(' | '));
    // Sizes and counts are whole numbers: the same text in both.
    assert.ok(ro.includes('1200 × 1500') && en.includes('1200 × 1500'));
    assert.equal(joineryCsv(data, labels('ro')), joineryCsv(data, labels('en')));
    assert.match(joineryCsv(data, labels('ro')), /,1\.1,/);
  });
});
