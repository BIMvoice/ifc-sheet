/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Recover valid sheet fields independently from damaged browser storage (#4836). */
import type { DrawingSheet, TitleBlockField, TitleBlockLogo, RevisionEntry } from '@ifc-lite/drawing-2d';
import { calculateViewportBounds } from '@ifc-lite/drawing-2d';
import { createDefaultSheet } from './sheetSlice';

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

const text = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback;
const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const num = (value: unknown, fallback: number, min = 0): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
const integer = (value: unknown, fallback: number, min = 0): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : fallback;
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function field(value: unknown): TitleBlockField | null {
  const f = record(value);
  if (typeof f.id !== 'string' || !f.id || typeof f.value !== 'string') return null;
  return {
    id: f.id, value: f.value, label: text(f.label, ''),
    editable: bool(f.editable, true), autoPopulate: bool(f.autoPopulate, false),
    fontSize: num(f.fontSize, 3, 0.01), fontWeight: choice(f.fontWeight, ['normal', 'bold'], 'normal'),
    ...(typeof f.autoPopulateSource === 'string' ? { autoPopulateSource: f.autoPopulateSource } : {}),
    ...(typeof f.maxWidth === 'number' ? { maxWidth: num(f.maxWidth, 1, 0.01) } : {}),
    ...(typeof f.row === 'number' ? { row: integer(f.row, 0) } : {}),
    ...(typeof f.col === 'number' ? { col: integer(f.col, 0) } : {}),
    ...(typeof f.rowSpan === 'number' ? { rowSpan: integer(f.rowSpan, 1, 1) } : {}),
    ...(typeof f.colSpan === 'number' ? { colSpan: integer(f.colSpan, 1, 1) } : {}),
  };
}

function logo(value: unknown): TitleBlockLogo | null {
  const l = record(value);
  if (typeof l.source !== 'string' || !l.source) return null;
  return {
    source: l.source, widthMm: num(l.widthMm, 30, 0.01), heightMm: num(l.heightMm, 15, 0.01),
    position: choice(l.position, ['top-left', 'top-right', 'bottom-left'], 'top-left'),
  };
}

function revision(value: unknown): RevisionEntry | null {
  const r = record(value);
  if (typeof r.revision !== 'string') return null;
  return { revision: r.revision, description: text(r.description, ''), date: text(r.date, ''), author: text(r.author, '') };
}

export function restoreSheet(value: unknown): DrawingSheet | null {
  const s = record(value);
  if (typeof s.id !== 'string' || !s.id || typeof s.name !== 'string') return null;
  const d = createDefaultSheet();
  const p = record(s.paper);
  const f = record(s.frame);
  const m = record(f.margins);
  const b = record(f.border);
  const t = record(s.titleBlock);
  const bar = record(s.scaleBar);
  const scale = record(s.scale);
  const north = record(s.northArrow);
  const paper: DrawingSheet['paper'] = {
    id: text(p.id, d.paper.id), name: text(p.name, d.paper.name),
    category: choice(p.category, ['ISO', 'ANSI', 'ARCH', 'custom'], d.paper.category),
    orientation: choice(p.orientation, ['portrait', 'landscape'], d.paper.orientation),
    widthMm: num(p.widthMm, d.paper.widthMm, 0.01), heightMm: num(p.heightMm, d.paper.heightMm, 0.01),
    defaultMarginMm: num(p.defaultMarginMm, d.paper.defaultMarginMm),
  };
  const frame: DrawingSheet['frame'] = {
    style: choice(f.style, ['simple', 'professional', 'minimal', 'iso', 'custom'], d.frame.style),
    margins: {
      top: num(m.top, d.frame.margins.top), right: num(m.right, d.frame.margins.right),
      bottom: num(m.bottom, d.frame.margins.bottom), left: num(m.left, d.frame.margins.left),
      bindingMargin: num(m.bindingMargin, d.frame.margins.bindingMargin),
    },
    border: {
      outerLineWeight: num(b.outerLineWeight, d.frame.border.outerLineWeight),
      innerLineWeight: num(b.innerLineWeight, d.frame.border.innerLineWeight),
      borderGap: num(b.borderGap, d.frame.border.borderGap),
      showFoldMarks: bool(b.showFoldMarks, d.frame.border.showFoldMarks),
      showTrimMarks: bool(b.showTrimMarks, d.frame.border.showTrimMarks),
    },
    showZoneReferences: bool(f.showZoneReferences, d.frame.showZoneReferences),
    horizontalZones: integer(f.horizontalZones, d.frame.horizontalZones),
    verticalZones: integer(f.verticalZones, d.frame.verticalZones),
    zoneFontSize: num(f.zoneFontSize, d.frame.zoneFontSize, 0.01),
  };
  const titleBlock: DrawingSheet['titleBlock'] = {
    layout: choice(t.layout, ['compact', 'standard', 'extended', 'custom'], d.titleBlock.layout),
    position: choice(t.position, ['bottom-right', 'bottom-full', 'right-strip'], d.titleBlock.position),
    widthMm: num(t.widthMm, d.titleBlock.widthMm), heightMm: num(t.heightMm, d.titleBlock.heightMm),
    borderWeight: num(t.borderWeight, d.titleBlock.borderWeight), gridWeight: num(t.gridWeight, d.titleBlock.gridWeight),
    ...(typeof t.backgroundColor === 'string' ? { backgroundColor: t.backgroundColor } : {}),
    fields: Array.isArray(t.fields) ? t.fields.map(field).filter((v) => v !== null) : d.titleBlock.fields,
    logo: logo(t.logo), showRevisionHistory: bool(t.showRevisionHistory, d.titleBlock.showRevisionHistory),
    maxRevisionEntries: integer(t.maxRevisionEntries, d.titleBlock.maxRevisionEntries),
  };
  return {
    id: s.id, name: s.name, paper, frame, titleBlock,
    scale: { name: text(scale.name, d.scale.name), factor: num(scale.factor, d.scale.factor, 0.000001), useCase: text(scale.useCase, d.scale.useCase) },
    scaleBar: {
      visible: bool(bar.visible, d.scaleBar.visible), totalLengthM: num(bar.totalLengthM, d.scaleBar.totalLengthM),
      primaryDivisions: integer(bar.primaryDivisions, d.scaleBar.primaryDivisions, 1),
      heightMm: num(bar.heightMm, d.scaleBar.heightMm), lineWeight: num(bar.lineWeight, d.scaleBar.lineWeight),
      fillColor: text(bar.fillColor, d.scaleBar.fillColor), strokeColor: text(bar.strokeColor, d.scaleBar.strokeColor),
    },
    northArrow: {
      style: choice(north.style, ['simple', 'compass', 'decorative', 'none'], d.northArrow.style),
      rotation: num(north.rotation, d.northArrow.rotation, -Infinity), sizeMm: num(north.sizeMm, d.northArrow.sizeMm),
    },
    viewportBounds: calculateViewportBounds(paper, frame, titleBlock),
    revisions: Array.isArray(s.revisions) ? s.revisions.map(revision).filter((v) => v !== null) : [],
  };
}
