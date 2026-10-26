/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one reading of a node's Name. The entity table and the spatial
 * hierarchy both name the same node, and used to do it with two copies of
 * this lookup: the table fell back to the edge the node hangs under
 * (`My_Space`), the hierarchy did not, so a space was `My_Space` in the table
 * and unnamed in the tree every room list is read from.
 */

import type { ComposedNode } from './types.js';

/** A node's Name from its attributes; `null` when none says one. */
export function nodeName(node: ComposedNode, incomingEdgeNames: readonly string[]): string | null {
  // Written by the IFCX exporter/writer.
  const ifcName = node.attributes.get('bsi::ifc::name');
  if (typeof ifcName === 'string') return ifcName;

  const name = node.attributes.get('bsi::ifc::prop::Name');
  if (typeof name === 'string') return name;

  const typeName = node.attributes.get('bsi::ifc::prop::TypeName');
  if (typeof typeName === 'string') return typeName;

  const objectName = node.attributes.get('bsi::ifc::prop::ObjectName');
  if (typeof objectName === 'string') return objectName;

  const longName = node.attributes.get('bsi::ifc::prop::LongName');
  if (typeof longName === 'string') return longName;

  // Fall back to a readable edge name (a UUID is not one).
  for (const edgeName of incomingEdgeNames) {
    if (edgeName !== node.path && !edgeName.match(/^[0-9a-f-]{36}$/i)) {
      return edgeName;
    }
  }

  return null;
}
