/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Element tags follow their elements: when the model changes (an edit, a
 * load), every tag (`params.tagOf`, a GlobalId) re-reads its element's label
 * and takes it. The text is derived data, so it changes without an undo step.
 * A tag whose element is gone keeps its last text, and a tag with a written-over text keeps that.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { elementLabel, TAG_FIELDS, type TagField } from '@/tagfields/element-tag';
import { tagTextNow } from '@/drafting/tag-override';

export function refreshElementTags(): void {
  const { drafts } = useProjectStore.getState();
  let changed = false;
  const next = drafts.map((d) => {
    const guid = d.params.tagOf;
    if (typeof guid !== 'string' || d.shape.type !== 'leader') return d;
    const field = (TAG_FIELDS as readonly string[]).includes(String(d.params.tagField)) ? (d.params.tagField as TagField) : 'mark';
    // A tag the person has written over keeps their text (#445); only the model's is refreshed.
    const text = tagTextNow(d, elementLabel(guid, field));
    if (text === null || text === d.shape.text) return d;
    changed = true;
    return { ...d, shape: { ...d.shape, text } };
  });
  if (changed) useProjectStore.setState({ drafts: next, dirty: true });
}

export function useElementTagSync(): void {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  // The sources of the tag fields too: a tag takes the text the new sources give.
  const tagFields = useProjectStore((s) => s.tagFields);
  // The classification mappings too (#89): a tag that shows a code takes a changed one.
  const classificationMappings = useProjectStore((s) => s.classificationMappings);
  const tagCount = useProjectStore((s) => s.drafts.filter((d) => d.params.tagOf !== undefined).length);
  useEffect(() => {
    if (tagCount > 0) refreshElementTags();
  }, [mutationVersion, models, tagCount, tagFields, classificationMappings]);
}
