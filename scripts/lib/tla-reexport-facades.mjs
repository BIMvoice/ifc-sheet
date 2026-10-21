/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Re-export facades that drop the top-level-await wait, for
 * scripts/check-tla-chunk-await.mjs.
 *
 * A facade is `export{r as loadDemoLayerStack}from"./A.js"`. A
 * re-exported binding is A's own live `var`, still unassigned until A's
 * `__tla` resolves, so the facade must hand that wait on: export a `__tla`
 * of its own that waits for A's (the shape the plugin prints when the
 * bundler emits the facade as import + local export), or re-export A's.
 * Dynamic importers of the facade do `await m.__tla`; if the facade exports
 * none, that await is `await undefined`, the caller reads the binding before
 * A has assigned it, and calling it throws the same TypeError as #2246.
 * rolldown 1.2.14 (vite 8.3.4) emits facades in this pure re-export form
 * and the plugin then wraps them without exporting `__tla` -- so this is
 * checked directly rather than left to the gate's import scan, which never
 * sees an `export ... from`. `export * from` re-exports `__tla` with
 * everything else, so it is not a violation and is not matched.
 */

const RE_EXPORT = /export\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+\.js)["']/g;

/**
 * @param {string} file the chunk's filename
 * @param {string} text the chunk's source
 * @param {Set<string>} tlaExporters filenames that export a literal `__tla`
 * @returns {{ facade: string, reExported: string, bindings: string }[]}
 */
export function unsafeReExports(file, text, tlaExporters) {
  if (tlaExporters.has(file)) return [];
  const found = [];
  for (const m of text.matchAll(RE_EXPORT)) {
    const [, clause, reExported] = m;
    if (!tlaExporters.has(reExported)) continue;
    const bindings = clause.split(',').map((e) => e.trim()).filter(Boolean).join(', ');
    found.push({ facade: file, reExported, bindings });
  }
  return found;
}

/** Prints the failure for the facades `unsafeReExports` found. */
export function reportUnsafeReExports(found) {
  console.error(
    `\n❌ ${found.length} chunk(s) re-export bindings of a __tla-wrapped chunk ` +
      `without exporting a __tla of their own:\n`,
  );
  for (const v of found.slice(0, 20)) {
    console.error(`   ${v.facade}  re-exports { ${v.bindings} }  from  ${v.reExported}  (exports __tla)`);
  }
  if (found.length > 20) console.error(`   ... and ${found.length - 20} more`);
  console.error(
    `\nA dynamic importer awaits the facade's \`__tla\`; with none exported it awaits\n` +
      `undefined and reads the re-exported bindings before the wrapped chunk has\n` +
      `assigned them -- the #2246 TypeError, behind an import(). The bundler emitted\n` +
      `these facades as pure re-exports (rolldown 1.2.14 / vite 8.3.4 does) and\n` +
      `vite-plugin-top-level-await@1.6.0 does not propagate __tla through that form.\n` +
      `Keep vite/rolldown at the versions pinned in package.json pnpm.overrides.\n`,
  );
}
