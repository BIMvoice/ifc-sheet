/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { elementShown, hiddenLineEntry, lineHidden, lineKey, orphanElements, resolveElementGraphics, withoutElements } from './element-graphics.js';
import { resolveViewGraphics, type ProjectViewTemplate } from './view-templates.js';
import type { ViewGraphics } from './view-graphics-types.js';

const WALL = 'IfcWall';
const A = '2O2Fr$t4X7Zf8NOew3FLOH';
const B = '3cUkl32yn9qRSPvBJVyWYp';

describe('resolveElementGraphics: template < category < element', () => {
  const template: ProjectViewTemplate = { id: 't', name: 'Plans', kind: 'plan', graphics: { categories: { walls: { lineColor: '#111111', lineWeight: 'light', cutHatch: 'ANSI31' } } } };
  const own: ViewGraphics = {
    categories: { walls: { lineColor: '#222222', lineWeight: 'heavy' } },
    elements: { [A]: { lineColor: '#888888', lineStyle: 'dashed', projectionWeight: 'hairline' } },
  };

  it('is null for an element the view says nothing about', () => {
    expect(resolveElementGraphics(own, B, WALL)).toBeNull();
    expect(resolveElementGraphics(undefined, A, WALL)).toBeNull();
    expect(resolveElementGraphics({}, A, WALL)).toBeNull();
  });

  it('lets the element override win over the category, and the category over the template', () => {
    const resolved = resolveViewGraphics({ graphics: own, templateId: 't' }, [template]);
    const style = resolveElementGraphics(resolved, A, WALL)!;
    // The element's colour beats the view's category colour, which beats the template's.
    expect(style.lineColor).toBe('#888888');
    expect(resolveViewGraphics({ graphics: own, templateId: 't' }, [template])?.categories?.walls?.lineColor).toBe('#222222');
    // A field the element leaves out keeps what the category (over the template) gives.
    expect(style.cutWeight).toBe('heavy');
    expect(style.cutHatch).toBe('ANSI31');
    // The element's own projection weight beats the category's heavy.
    expect(style.projectionWeight).toBe('hairline');
    expect(style.lineStyle).toBe('dashed');
  });

  it('the template beats nothing above it: it is the lowest layer', () => {
    const viewOnly: ViewGraphics = { elements: { [A]: { fillColor: '#abcdef' } } };
    const resolved = resolveViewGraphics({ graphics: viewOnly, templateId: 't' }, [template])!;
    const style = resolveElementGraphics(resolved, A, WALL)!;
    expect(style.lineColor).toBe('#111111');
    expect(style.fillColor).toBe('#abcdef');
  });

  it('rides through a template: the elements are the view\'s own, a template cannot carry them', () => {
    const graphics: ViewGraphics = { hiddenElements: [A], elements: { [B]: { lineColor: '#123456' } }, hiddenLines: [`${A}|0,0,1000,0`] };
    const resolved = resolveViewGraphics({ graphics, templateId: 't' }, [template])!;
    expect(resolved.hiddenElements).toEqual([A]);
    expect(resolved.elements).toEqual({ [B]: { lineColor: '#123456' } });
    expect(resolved.hiddenLines).toEqual([`${A}|0,0,1000,0`]);
  });
});

describe('hiding', () => {
  it('hides an element listed in hiddenElements, and only that one', () => {
    const g: ViewGraphics = { hiddenElements: [A] };
    expect(elementShown(g, A, WALL)).toBe(false);
    expect(elementShown(g, B, WALL)).toBe(true);
    expect(elementShown(g, undefined, WALL)).toBe(true);
  });

  it('keeps the category rule for elements the view does not name', () => {
    const g: ViewGraphics = { categories: { walls: { visible: false } }, elements: { [A]: { lineColor: '#000000' } } };
    expect(elementShown(g, B, WALL)).toBe(false);
    expect(elementShown(g, A, WALL)).toBe(false);
  });

  it('lets an element override show one element of a hidden category', () => {
    const g: ViewGraphics = { categories: { walls: { visible: false } }, elements: { [A]: { visible: true } } };
    expect(elementShown(g, A, WALL)).toBe(true);
    expect(elementShown(g, B, WALL)).toBe(false);
  });

  it('hiddenElements wins over an override that says visible', () => {
    const g: ViewGraphics = { hiddenElements: [A], elements: { [A]: { visible: true } } };
    expect(elementShown(g, A, WALL)).toBe(false);
  });
});

describe('lineKey: a line by where it lies, not by its place in the drawing', () => {
  const line = { start: { x: 1.2344, y: 5 }, end: { x: 3, y: 5.0004 } };

  it('is the same for the same geometry, either way round, and across a rounding of less than a millimetre', () => {
    expect(lineKey({ start: line.end, end: line.start })).toBe(lineKey(line));
    expect(lineKey({ start: { x: 1.23441, y: 5 }, end: { x: 3, y: 5.00041 } })).toBe(lineKey(line));
  });

  it('differs for a line that moved by a millimetre or more', () => {
    expect(lineKey({ start: { x: 1.2364, y: 5 }, end: line.end })).not.toBe(lineKey(line));
  });

  it('hides a line of one element and no other line, and not the same line of another element', () => {
    const g: ViewGraphics = { hiddenLines: [hiddenLineEntry(A, line)] };
    expect(lineHidden(g, A, line)).toBe(true);
    expect(lineHidden(g, B, line)).toBe(false);
    expect(lineHidden(g, A, { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } })).toBe(false);
  });

  it('never reads -0 as a different key', () => {
    expect(lineKey({ start: { x: -0.0001, y: 0 }, end: { x: 1, y: 0 } })).toBe(lineKey({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }));
  });
});

describe('orphans and clean-up', () => {
  const g: ViewGraphics = { hiddenElements: [A, B], elements: { [A]: { lineColor: '#000000', about: 'IfcWall Basement wall' } }, hiddenLines: [`${A}|0,0,1,1`, `${A}|2,2,3,3`] };

  it('lists what the view says about elements the model no longer has, keeping it', () => {
    expect(orphanElements(g, (id) => id === B)).toEqual([{ globalId: A, hidden: true, overridden: true, lines: 2, about: 'IfcWall Basement wall' }]);
    expect(orphanElements(g, () => true)).toEqual([]);
    expect(orphanElements(undefined, () => false)).toEqual([]);
  });

  it('takes an element off every list at once', () => {
    expect(withoutElements(g, [A])).toEqual({ hiddenElements: [B] });
    expect(withoutElements(g, [A, B])).toEqual({});
  });
});
