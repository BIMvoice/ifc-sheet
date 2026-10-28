/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useMemo } from 'react';
import { Calculator, ChevronDown, FileText, Layers, Tag } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useViewerStore } from '@/store';
import { IfcQuery } from '@ifc-lite/query';
import { extractProjectUnits, ProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import type { EntityRef, FederatedModel } from '@/store/types';
import { getEffectiveGeoreference } from '@/lib/geo/effective-georef';
import { displayStoreyElevationMeters } from '@/lib/geo/storey-elevation';
import { ModelBadge } from '../ModelBadge';
import { AssistantAction } from '../assistant/AssistantAction';
import { PersistentCollapsible } from './PersistentCollapsible';
import { CopyValueButton } from './CopyValueButton';
import { UnitDisplayControl } from './UnitDisplayControl';
import { PropertySetCard } from './PropertySetCard';
import { QuantitySetCard } from './QuantitySetCard';
import type { PropertySet, QuantitySet } from './encodingUtils';

/** Multi-entity panel for unified storeys - shows data from multiple entities stacked */
export function MultiEntityPanel({
  entities,
  models,
  ifcDataStore,
}: {
  entities: EntityRef[];
  models: Map<string, FederatedModel>;
  ifcDataStore: IfcDataStore | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col border-l-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
      {/* Header */}
      <div className="p-3 border-b-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-600" />
          <h2 className="font-bold uppercase tracking-wider text-xs text-zinc-900 dark:text-zinc-100">
            {t('properties.panel.multiEntity.heading')}
          </h2>
          <span className="text-2xs font-mono bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            {t('properties.panel.multiEntity.modelCount', { count: entities.length })}
          </span>
          {/* Display-unit converter (issue #1573 proposal 2) — one control
              for the whole stacked list below, not per-entity section. */}
          <div className="ml-auto flex items-center gap-1"><AssistantAction /><UnitDisplayControl /></div>
        </div>
      </div>

      {/* Scrollable content with each entity's data */}
      <ScrollArea className="flex-1">
        <div className="divide-y-2 divide-zinc-200 dark:divide-zinc-800">
          {entities.map((entityRef) => (
            <EntityDataSection
              key={`${entityRef.modelId}-${entityRef.expressId}`}
              entityRef={entityRef}
              models={models}
              ifcDataStore={ifcDataStore}
              showModelName={true}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Renders data for a single entity (used in multi-entity panel) */
function EntityDataSection({
  entityRef,
  models,
  ifcDataStore,
  showModelName,
}: {
  entityRef: EntityRef;
  models: Map<string, FederatedModel>;
  ifcDataStore: IfcDataStore | null;
  showModelName: boolean;
}) {
  const { t } = useTranslation();
  // Get the appropriate data store and query
  const { dataStore, model } = useMemo(() => {
    if (entityRef.modelId !== 'legacy') {
      const m = models.get(entityRef.modelId);
      if (m) {
        return { dataStore: m.ifcDataStore, model: m };
      }
    }
    return { dataStore: ifcDataStore, model: null };
  }, [entityRef.modelId, models, ifcDataStore]);

  const query = useMemo(() => {
    return dataStore ? new IfcQuery(dataStore) : null;
  }, [dataStore]);

  const entityNode = useMemo(() => {
    if (!query) return null;
    return query.entity(entityRef.expressId);
  }, [query, entityRef.expressId]);

  // Overlay-aware display class: a pending retype (setEntityType) reassigns the
  // class in place, so the header reflects the new class immediately — before
  // the model is re-exported / reloaded. Re-evaluates on `mutationVersion`.
  const headerMutationViews = useViewerStore((s) => s.mutationViews);
  const headerMutationVersion = useViewerStore((s) => s.mutationVersion);
  const displayType = useMemo(() => {
    let mid = entityRef.modelId;
    if (mid === 'legacy') mid = '__legacy__';
    const pending = headerMutationViews.get(mid)?.getEntityTypeMutation?.(entityRef.expressId)?.newType;
    return pending ?? entityNode?.type ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerMutationViews, headerMutationVersion, entityRef.modelId, entityRef.expressId, entityNode]);

  // Get properties and quantities
  const properties: PropertySet[] = useMemo(() => {
    if (!entityNode) return [];
    const rawProps = entityNode.properties();
    return rawProps.map(pset => ({
      name: pset.name,
      properties: pset.properties.map(p => ({ name: p.name, value: p.value, dataType: p.dataType })),
    }));
  }, [entityNode]);

  const quantities: QuantitySet[] = useMemo(() => {
    if (!entityNode) return [];
    return entityNode.quantities();
  }, [entityNode]);

  // The file's declared units, for rendering unit suffixes on property/
  // quantity values (issue #1573). Mirrors the `projectUnits` memo above.
  const projectUnits = useMemo(() => {
    if (!dataStore?.source?.length || !dataStore?.entityIndex) return ProjectUnits.empty();
    return extractProjectUnits(dataStore.source, dataStore.entityIndex);
  }, [dataStore]);

  // Display-unit converter overrides (issue #1573 proposal 2) — this
  // component renders in the multi-entity selection panel, a sibling
  // component to the main PropertiesPanel, so it reads the store directly
  // rather than threading the value through as a prop.
  const unitDisplayOverrides = useViewerStore((s) => s.unitDisplayOverrides);
  const georefMutations = useViewerStore((s) => s.georefMutations);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);

  // Get attributes - uses schema-aware extraction to show ALL string/enum attributes
  // Note: GlobalId is intentionally excluded since it's shown in the dedicated GUID field above
  const attributes = useMemo(() => {
    if (!entityNode) return [];
    return entityNode.allAttributes();
  }, [entityNode]);

  // Get elevation info
  const elevationInfo = useMemo(() => {
    if (!dataStore?.spatialHierarchy) return null;
    const elevation = dataStore.spatialHierarchy.storeyElevations.get(entityRef.expressId);
    if (elevation === undefined) return null;
    const modelId = entityRef.modelId === 'legacy' ? '__legacy__' : entityRef.modelId;
    const effectiveGeoref = getEffectiveGeoreference(
      dataStore,
      model?.geometryResult?.coordinateInfo,
      georefMutations.get(modelId),
    );
    return displayStoreyElevationMeters(elevation, effectiveGeoref, dataStore, entityRef.expressId);
  }, [dataStore, entityRef.modelId, entityRef.expressId, model, georefMutations, mutationVersion]);

  if (!entityNode) {
    return (
      <div className="p-4 text-center text-zinc-500 text-sm">
        {t('properties.panel.multiEntity.loadFailed')}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-black">
      {/* Entity Header with model name */}
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 space-y-2">
        {showModelName && model && (
          <ModelBadge modelId={model.id} className="gap-2 text-2xs max-w-full" />
        )}
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-600" />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate text-zinc-900 dark:text-zinc-100">
              {entityNode.name || `${displayType} #${entityRef.expressId}`}
            </h3>
            <p className="text-xs font-mono text-zinc-500">{displayType}</p>
          </div>
          {elevationInfo !== null && (
            <span className="text-2xs font-mono bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
              {t('properties.panel.multiEntity.elevationMeters', { sign: elevationInfo >= 0 ? '+' : '', value: elevationInfo.toFixed(2) })}
            </span>
          )}
        </div>
      </div>

      {/* Attributes */}
      {attributes.length > 0 && (
        <PersistentCollapsible id="multi-attributes" className="border-b border-zinc-200 dark:border-zinc-800">
          <CollapsibleTrigger className="group/disclosure flex items-center gap-2 w-full p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left text-xs">
            <Tag className="h-3 w-3 text-zinc-400" />
            <span className="font-medium">{t('properties.panel.multiEntity.attributesHeading')}</span>
            <span className="text-2xs text-zinc-400 ml-auto">{attributes.length}</span>
            <ChevronDown className="size-3 transition-transform group-data-[state=closed]/disclosure:-rotate-90" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900 border-t border-zinc-100 dark:border-zinc-900">
              {attributes.map((attr) => (
                <div key={attr.name} className="group/copyrow grid grid-cols-[minmax(60px,1fr)_minmax(0,2fr)] gap-2 px-3 py-1.5 text-xs">
                  <span className="text-zinc-500 truncate" title={attr.name}>{attr.name}</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 min-w-0">
                      <span className="font-medium whitespace-nowrap">{attr.value}</span>
                    </div>
                    <CopyValueButton name={attr.name} value={String(attr.value)} />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </PersistentCollapsible>
      )}

      {/* Properties */}
      {properties.length > 0 && (
        <PersistentCollapsible id="multi-properties" className="border-b border-zinc-200 dark:border-zinc-800">
          <CollapsibleTrigger className="group/disclosure flex items-center gap-2 w-full p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left text-xs">
            <FileText className="h-3 w-3 text-zinc-400" />
            <span className="font-medium">{t('properties.panel.multiEntity.propertiesHeading')}</span>
            <span className="text-2xs text-zinc-400 ml-auto">{t('properties.panel.multiEntity.propertySetsCount', { count: properties.length })}</span>
            <ChevronDown className="size-3 transition-transform group-data-[state=closed]/disclosure:-rotate-90" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-2 pt-0 space-y-2">
              {properties.map((pset, index) => (
                <PropertySetCard key={`${pset.name}-${index}`} pset={pset} projectUnits={projectUnits} unitDisplayOverrides={unitDisplayOverrides} />
              ))}
            </div>
          </CollapsibleContent>
        </PersistentCollapsible>
      )}

      {/* Quantities */}
      {quantities.length > 0 && (
        <PersistentCollapsible id="multi-quantities" className="border-b border-zinc-200 dark:border-zinc-800">
          <CollapsibleTrigger className="group/disclosure flex items-center gap-2 w-full p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left text-xs">
            <Calculator className="h-3 w-3 text-zinc-400" />
            <span className="font-medium">{t('properties.panel.multiEntity.quantitiesHeading')}</span>
            <span className="text-2xs text-zinc-400 ml-auto">{t('properties.panel.multiEntity.quantitySetsCount', { count: quantities.length })}</span>
            <ChevronDown className="size-3 transition-transform group-data-[state=closed]/disclosure:-rotate-90" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-2 pt-0 space-y-2">
              {quantities.map((qset, index) => (
                <QuantitySetCard key={`${qset.name}-${index}`} qset={qset} projectUnits={projectUnits} unitDisplayOverrides={unitDisplayOverrides} />
              ))}
            </div>
          </CollapsibleContent>
        </PersistentCollapsible>
      )}
    </div>
  );
}
