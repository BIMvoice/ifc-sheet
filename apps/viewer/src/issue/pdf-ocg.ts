/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Optional content (the layers a PDF reader lists) for a jsPDF document.
 * jsPDF has no layer API, so this writes the three pieces the format needs
 * through its own events: one `/OCG` object per layer, the page resources'
 * `/Properties` names the content stream marks refer to, and the catalog's
 * `/OCProperties` with the layers panel's tree. `inLayer` brackets whatever
 * is drawn meanwhile as `/OC /name BDC ... EMC`, so a reader that hides the
 * layer hides exactly that.
 *
 * A layer is one object for the whole document: "Cut" on page 3 is the same
 * switch as "Cut" on page 1.
 */

import type { jsPDF } from 'jspdf';

/** Everything this needs of jsPDF that its typings leave out. */
type Writer = jsPDF['internal'] & { newObject(): number; write(...parts: string[]): void };

export interface LayerName {
  /** The layer's name in the layers panel. */
  name: string;
  /** The heading it is listed under. */
  group: string;
}

/** A PDF text string: plain when ASCII, else UTF-16BE in hex. */
export function pdfText(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, '\\$&')})`;
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
}

export interface OptionalContent {
  /** Draw `draw` into `layer`; the layer exists in the document from the first call. */
  inLayer<T>(layer: LayerName, draw: () => Promise<T> | T): Promise<T>;
  /** The layers made so far, in the order they were first used. */
  layers(): readonly LayerName[];
}

export function optionalContent(doc: jsPDF): OptionalContent {
  const internal = doc.internal as Writer;
  const made = new Map<string, { key: string; layer: LayerName; object: number }>();
  const key = (layer: LayerName) => `${layer.group}\u0000${layer.name}`;

  internal.events.subscribe('putResources', () => {
    for (const entry of made.values()) {
      entry.object = internal.newObject();
      internal.write(`<< /Type /OCG /Name ${pdfText(entry.layer.name)} /Intent /View >>`, 'endobj');
    }
  });
  // The resource dictionary closes the /XObject dictionary after this event: close it here and open /Properties in its place.
  internal.events.subscribe('putXobjectDict', () => {
    internal.write('>>', '/Properties <<');
    for (const { key: name, object } of made.values()) internal.write(`/${name} ${object} 0 R`);
  });
  internal.events.subscribe('putCatalog', () => {
    if (made.size === 0) return;
    const groups = new Map<string, number[]>();
    for (const { layer, object } of made.values()) groups.set(layer.group, [...(groups.get(layer.group) ?? []), object]);
    const refs = [...made.values()].map((e) => `${e.object} 0 R`).join(' ');
    const order = [...groups].map(([group, objects]) => `[${pdfText(group)} ${objects.map((o) => `${o} 0 R`).join(' ')}]`).join(' ');
    internal.write(`/OCProperties << /OCGs [${refs}] /D << /Name (Layers) /BaseState /ON /Order [${order}] >> >>`);
  });

  return {
    async inLayer(layer, draw) {
      const k = key(layer);
      let entry = made.get(k);
      if (!entry) {
        entry = { key: `OC${made.size + 1}`, layer, object: 0 };
        made.set(k, entry);
      }
      internal.write(`/OC /${entry.key} BDC`);
      try {
        return await draw();
      } finally {
        internal.write('EMC');
      }
    },
    layers: () => [...made.values()].map((e) => e.layer),
  };
}
