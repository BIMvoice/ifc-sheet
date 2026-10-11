/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #4764: an element known to have no geometry — and the "Other" bucket that
 * holds it — must render grayed out, using the SAME `opacity-50 grayscale`
 * convention a hidden-in-3D row already uses (never a new colour). The class
 * pair is a CSS filter/opacity, not a colour token, so it renders identically
 * in both themes; this only has to prove the class is applied, not repeat a
 * dark-mode snapshot.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';

installLayout();

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup } from '@/test/render.js';
import { HierarchyNode } from './HierarchyNode.js';
import type { TreeNode } from './types.js';

afterEach(cleanup);

const virtualRow = { size: 28, start: 0 };

function baseNode(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: 'n1',
    expressIds: [1],
    globalIds: [1],
    modelIds: ['legacy'],
    name: 'Row',
    type: 'element',
    depth: 1,
    hasChildren: false,
    isExpanded: false,
    isVisible: true,
    ...overrides,
  };
}

function mountRow(node: TreeNode, nodeHidden = false): HTMLElement {
  return render(
    <HierarchyNode
      node={node}
      virtualRow={virtualRow}
      isSelected={false}
      nodeHidden={nodeHidden}
      isMultiModel={false}
      modelsCount={1}
      onNodeClick={() => {}}
      onToggleExpand={() => {}}
      onVisibilityToggle={() => {}}
      onModelVisibilityToggle={() => {}}
      onRemoveModel={() => {}}
      onModelHeaderClick={() => {}}
    />,
  );
}

function rowEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.hierarchy-item');
  assert.ok(el, 'row element renders');
  return el as HTMLElement;
}

describe('HierarchyNode — no-geometry rows are grayed out (#4764)', () => {
  it('grays an element row flagged noGeometry', () => {
    const el = rowEl(mountRow(baseNode({ ifcType: 'IfcBuildingElementProxy', noGeometry: true })));
    assert.ok(el.className.includes('opacity-50'), 'opacity-50 applied');
    assert.ok(el.className.includes('grayscale'), 'grayscale applied');
  });

  it('grays the "Other" bucket header itself', () => {
    const el = rowEl(mountRow(baseNode({ type: 'other-group', name: 'Other', depth: 0, hasChildren: true, elementCount: 3 })));
    assert.ok(el.className.includes('opacity-50'));
    assert.ok(el.className.includes('grayscale'));
  });

  it('leaves an ordinary element row un-grayed', () => {
    const el = rowEl(mountRow(baseNode({ ifcType: 'IfcWall' })));
    assert.ok(!el.className.includes('opacity-50'), 'a normal row must not gray out');
    assert.ok(!el.className.includes('grayscale'));
  });

  it('a hidden-in-3D row still grays too — the two reasons share one convention', () => {
    const el = rowEl(mountRow(baseNode({ ifcType: 'IfcWall' }), true));
    assert.ok(el.className.includes('opacity-50'));
    assert.ok(el.className.includes('grayscale'));
  });
});
