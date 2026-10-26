/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit project mode (`pacMode`, #364) as a project field the command line reads, and the scope findings of the simplified
 * PAC (Legea 169/2026 Anexa 3: P + M, 150 m² Sd) as readiness findings. The expectations are written out from the text of Anexa 3.
 */

import { describe, expect, it } from 'vitest';
import { run } from './cli.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { READINESS_EN, describeReadiness, modelReadiness, ruralReadiness, type ModelFacts } from './readiness.js';

const file = (extra: Record<string, unknown>) => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Casa', ...extra });
const COMPLETE: ModelFacts = { storeys: 2, spaces: 5, elements: 100, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };
const say = (r: Parameters<typeof ruralReadiness>[0]) => ruralReadiness(r).map((f) => [f.kind, describeReadiness(f).missing]);

describe('the project file\'s pacMode', () => {
  it('reads rural and full, and drops anything else; absent stays absent', () => {
    expect(readProjectFile(file({ pacMode: 'rural' })).pacMode).toBe('rural');
    expect(readProjectFile(file({ pacMode: 'full' })).pacMode).toBe('full');
    expect(readProjectFile(file({ pacMode: 'urban' })).pacMode).toBeUndefined();
    expect(readProjectFile(file({ pacMode: true })).pacMode).toBeUndefined();
    expect('pacMode' in readProjectFile(file({}))).toBe(false);
  });

  it('reads the urban settings the indicators are read with', () => {
    expect(readProjectFile(file({ urbanSettings: { zeroElevation: 2.5, terrainLevel: 'x', cutExcluded: { Subsol: true, Parter: 1 } } })).urbanSettings).toEqual({ zeroElevation: 2.5, cutExcluded: { Subsol: true } });
    expect(readProjectFile(file({ urbanSettings: {} })).urbanSettings).toBeUndefined();
  });
});

describe('the scope findings of the simplified PAC', () => {
  it('say nothing for P + M at exactly 150 m²', () => {
    expect(ruralReadiness({ levels: 2, sd: 150, sdAtLeast: false })).toEqual([]);
    expect(ruralReadiness({ levels: 1, sd: null, sdAtLeast: false })).toEqual([]);
  });

  it('name a third level, an area over 150 m², and an area that is at least that', () => {
    expect(say({ levels: 3, sd: 100, sdAtLeast: false })).toEqual([['ruralLevels', 'The model has 3 levels above ground; the simplified PAC (Anexa 3) covers at most ground floor + attic.']]);
    expect(say({ levels: 2, sd: 170.04, sdAtLeast: false })).toEqual([['ruralArea', 'The model\'s built gross area (Sd) is 170 m²; the simplified PAC (Anexa 3) covers at most 150 m².']]);
    expect(say({ levels: 2, sd: 151, sdAtLeast: true })).toEqual([['ruralAreaAtLeast', 'The model\'s built gross area (Sd) is at least 151 m² (some elements gave no outline); the simplified PAC (Anexa 3) covers at most 150 m².']]);
  });

  it('come last in the model\'s readiness, and only when the scope was measured', () => {
    expect(modelReadiness({ ...COMPLETE, elementsWithoutMaterial: 4 }, [], undefined, { levels: 3, sd: 200, sdAtLeast: false }).map((f) => f.kind)).toEqual(['noMaterials', 'ruralLevels', 'ruralArea']);
    expect(modelReadiness({ ...COMPLETE, elementsWithoutMaterial: 4 }).map((f) => f.kind)).toEqual(['noMaterials']);
    for (const kind of ['ruralLevels', 'ruralArea', 'ruralAreaAtLeast'] as const) {
      expect(READINESS_EN[`ready.${kind}`]).toBeTruthy();
      expect(READINESS_EN[`ready.${kind}.effect`]).toBeTruthy();
    }
  });
});

describe('ifcsheet build --pac-mode', () => {
  const capture = () => {
    const err: string[] = [];
    return { io: { stdout: () => undefined, stderr: (t: string) => void err.push(t) }, err: () => err.join('') };
  };

  it('is one of full, rural, and only with --pac', async () => {
    const a = capture();
    expect(await run(['build', 'm.ifc', '--pac', '--pac-mode', 'urban', '--out', 'a.pdf'], a.io)).toBe(2);
    expect(a.err()).toBe('ifcsheet build --pac-mode is one of full, rural.\n');
    const b = capture();
    expect(await run(['build', 'm.ifc', '--pac-mode', 'rural', '--out', 'a.pdf'], b.io)).toBe(2);
    expect(b.err()).toBe('ifcsheet build has --pac-mode only with --pac.\n');
  });

  it('is accepted with --pac', async () => {
    const c = capture();
    expect(await run(['build', '/nonexistent/m.ifc', '--pac', '--pac-mode', 'rural', '--out', 'a.pdf'], c.io)).toBe(1);
    expect(c.err()).toMatch(/cannot read/);
  });
});

