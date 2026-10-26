/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where an element sits in the spatial structure (site, building, immediate container, project), read from a built spatial hierarchy.
 * Moved from the app's `utils/spatialHierarchy.ts` (#78) so the Lists provider of the app and the headless one answer the Site, Building,
 * Container and Project columns from one function.
 */

import { IfcTypeEnum, isBuildingLikeSpatialType, type SpatialHierarchy, type SpatialNode } from '@ifc-lite/data';

/**
 * Classify a spatial node into the federation-identity container level it
 * represents, or null when it is none of those. The single home for the
 * site / building-like / project rules (building-like spans IFC4X3 facilities),
 * shared by `buildSpatialAncestryIndex` and `collectSpatialContainerNames` so
 * the classification can never drift between them.
 */
function spatialContainerLevel(node: SpatialNode): 'site' | 'building' | 'project' | null {
  if (node.type === IfcTypeEnum.IfcSite) return 'site';
  if (isBuildingLikeSpatialType(node.type)) return 'building';
  if (node.type === IfcTypeEnum.IfcProject) return 'project';
  return null;
}

/**
 * Collect the distinct REAL IFC names of every IfcSite / building-like /
 * IfcProject container in a hierarchy (unnamed containers contribute nothing,
 * matching the column values). `getName` resolves an entity's real Name.
 * `containers` gathers the name of every node that DIRECTLY contains elements
 * at any level — the immediate-Container column's possible values (storeys,
 * spaces / zones, IfcBridgePart / IfcRoadPart, …). Powers the spatial-filter
 * value suggestions, sharing node classification with `buildSpatialAncestryIndex`.
 */
export function collectSpatialContainerNames(
  hierarchy: SpatialHierarchy | undefined | null,
  getName: (expressId: number) => string,
): { sites: string[]; buildings: string[]; projects: string[]; containers: string[] } {
  const sites = new Set<string>();
  const buildings = new Set<string>();
  const projects = new Set<string>();
  const containers = new Set<string>();
  const root = hierarchy?.project;
  if (root) {
    const walk = (node: SpatialNode): void => {
      const name = getName(node.expressId);
      if (name) {
        const level = spatialContainerLevel(node);
        if (level === 'site') sites.add(name);
        else if (level === 'building') buildings.add(name);
        else if (level === 'project') projects.add(name);
        // Any node that directly lists elements is an immediate Container.
        if (node.elements.length > 0) containers.add(name);
      }
      for (const child of node.children) walk(child);
    };
    walk(root);
  }
  const sorted = (s: Set<string>) => Array.from(s).sort();
  return {
    sites: sorted(sites),
    buildings: sorted(buildings),
    projects: sorted(projects),
    containers: sorted(containers),
  };
}

/**
 * Nearest-ancestor spatial identity for an element, resolved from a built
 * spatial hierarchy. `siteOf` / `buildingOf` return the containing IfcSite /
 * IfcBuilding name (or '' when the element is unplaced, or the nearest such
 * container is unnamed); `projectName` is the model's single IfcProject name.
 */
export interface SpatialAncestryIndex {
  projectName: string;
  siteOf(elementId: number): string;
  buildingOf(elementId: number): string;
  /**
   * Name of the element's IMMEDIATE spatial container — the direct
   * IfcRelContainedInSpatialStructure parent (the node that lists it in its
   * `elements`), which may be a storey OR a non-storey container such as an
   * IfcBridgePart / IfcRoadPart / IfcSpatialZone / IfcSpace. Falls back to the
   * container's IFC class when it is unnamed (via `getClass`), and to '' when
   * the element is uncontained. Spaces and aggregated parts, which are not
   * directly contained, resolve to their storey (their nearest container).
   */
  containerOf(elementId: number): string;
}

/**
 * Precompute each element's containing IfcSite / IfcBuilding name from a spatial
 * hierarchy in a single depth-first pass, so a per-element lookup is O(1) and
 * never re-walks the tree. Used by federated views (Lists columns, panels) to
 * label which project / site / building an element belongs to.
 *
 * `getName` resolves an entity's real IFC `Name` — pass the store's
 * `entities.getName` so an UNNAMED container resolves to '' (matching how the
 * storey column behaves). The hierarchy builder no longer synthesizes an
 * `Entity #N` placeholder for `SpatialNode.name` (#3530). `getClass` (optional) resolves an
 * entity's IFC class name, used only as the `containerOf` fallback for an
 * unnamed immediate container. "Building" spans every
 * building-like spatial type (IFC4X3 IfcFacility / IfcBridge / IfcRoad / …), so
 * infrastructure federations resolve too.
 *
 * Coverage: elements listed directly under a container node (`node.elements`)
 * resolve via that node; a spatial container queried by its own id resolves to
 * its own site/building; parts and other aggregated descendants reachable only
 * through the storey reverse index (`elementToStorey`) resolve via their
 * storey. Elements the hierarchy doesn't place resolve to ''.
 */
export function buildSpatialAncestryIndex(
  hierarchy: SpatialHierarchy | undefined | null,
  getName: (expressId: number) => string,
  getClass?: (expressId: number) => string,
): SpatialAncestryIndex {
  // container node id -> nearest {site, building} name (self-inclusive).
  const ancestry = new Map<number, { site: string; building: string }>();
  // element id -> the container node that directly lists it in `elements`.
  const elementToContainer = new Map<number, number>();
  let projectName = '';

  if (hierarchy?.project) {
    const root = hierarchy.project;
    projectName = getName(root.expressId) || '';
    const walk = (node: SpatialNode, site: string, building: string): void => {
      // A site / building-like node takes its OWN name (or '' when unnamed). It
      // does NOT inherit the ancestor's name across same-type nesting: an
      // unnamed IfcSite nested in a named IfcSite is a different, unnamed site,
      // so it resolves to '' (consistent with the storey column), not the outer
      // name. Non-container nodes (storeys, spaces) propagate the parent's.
      const level = spatialContainerLevel(node);
      const nextSite = level === 'site' ? getName(node.expressId) : site;
      const nextBuilding = level === 'building' ? getName(node.expressId) : building;
      ancestry.set(node.expressId, { site: nextSite, building: nextBuilding });
      for (const el of node.elements) {
        if (!elementToContainer.has(el)) elementToContainer.set(el, node.expressId);
      }
      for (const child of node.children) walk(child, nextSite, nextBuilding);
    };
    walk(root, '', '');
  }

  const containerFor = (elementId: number): number | undefined => {
    if (ancestry.has(elementId)) return elementId; // the element IS a spatial container
    const direct = elementToContainer.get(elementId);
    if (direct !== undefined) return direct;
    return hierarchy?.elementToStorey.get(elementId); // parts/aggregated descendants
  };

  // Immediate container: the node that DIRECTLY lists the element in its
  // `elements` (IfcRelContainedInSpatialStructure), at whatever spatial level.
  // Unlike `containerFor`, the element itself is never its own container.
  // Aggregated parts (e.g. an IfcBeam nested through an IfcElementAssembly) are
  // not directly contained, so they resolve via the builder's
  // `elementToContainer` map — their nearest containing spatial node at any
  // level (a storey, but also an IfcBridgePart / IfcRoadPart / IfcSpatialZone).
  // Spaces (child nodes) fall back to their storey. `elementToStorey` remains
  // the final fallback so hierarchies that predate `elementToContainer` still
  // resolve parts under a storey.
  const immediateContainerFor = (elementId: number): number | undefined => {
    const direct = elementToContainer.get(elementId);
    if (direct !== undefined) return direct;
    const aggregated = hierarchy?.elementToContainer?.get(elementId);
    if (aggregated !== undefined) return aggregated;
    return hierarchy?.elementToStorey.get(elementId);
  };

  return {
    projectName,
    siteOf(elementId: number): string {
      const c = containerFor(elementId);
      return c === undefined ? '' : (ancestry.get(c)?.site ?? '');
    },
    buildingOf(elementId: number): string {
      const c = containerFor(elementId);
      return c === undefined ? '' : (ancestry.get(c)?.building ?? '');
    },
    containerOf(elementId: number): string {
      const c = immediateContainerFor(elementId);
      if (c === undefined) return '';
      // Real IFC Name, else the container's IFC class (e.g. "IfcBridgePart").
      return getName(c) || (getClass ? getClass(c) : '');
    },
  };
}
