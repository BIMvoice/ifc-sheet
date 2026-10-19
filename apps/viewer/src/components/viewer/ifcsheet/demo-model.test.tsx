/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { EVENT_LOAD_FILE } from '@/lib/tours/events';
import { WallView } from '../wall/WallView.js';
import { DEMO_MODEL } from './demo-model.js';

/**
 * The demo project: the empty Wall offers it, and opening it hands the
 * served block of flats to the ordinary load path, as a picked file is.
 */

const PUBLIC = fileURLToPath(new URL('../../../../public', import.meta.url));

afterEach(() => cleanup());

describe('demo project', () => {
  it('is served with the app: an IFC block of flats on five storeys', () => {
    const text = readFileSync(`${PUBLIC}${DEMO_MODEL.path}`, 'latin1');
    assert.ok(text.startsWith('ISO-10303-21;'));
    assert.equal(text.match(/IFCBUILDINGSTOREY\(/g)?.length, 5);
  });

  it('opens from the empty Wall through the ordinary load path', async () => {
    const realFetch = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = (async (input: string) => {
      asked.push(String(input));
      return new Response('ISO-10303-21;', { status: 200 });
    }) as typeof fetch;
    const loaded: File[] = [];
    const onLoad = (e: Event) => loaded.push((e as CustomEvent<File>).detail);
    window.addEventListener(EVENT_LOAD_FILE, onLoad);
    try {
      const ui = render(<WallView />);
      const demo = [...ui.querySelectorAll('button')].find((b) => /demo project/i.test(b.textContent ?? ''));
      assert.ok(demo, 'the empty Wall offers the demo project');
      click(demo);
      await waitFor(() => loaded.length === 1, 'the demo file reached the load path');
      assert.deepEqual(asked, [DEMO_MODEL.path]);
      assert.equal(loaded[0].name, DEMO_MODEL.name);
    } finally {
      window.removeEventListener(EVENT_LOAD_FILE, onLoad);
      globalThis.fetch = realFetch;
    }
  });
});
