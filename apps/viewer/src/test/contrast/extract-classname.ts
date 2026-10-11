/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pulls a literal `className="..."` string out of a component's SOURCE by
 * matching the surrounding text (not a hardcoded expected value), so the
 * contrast tests in this directory measure whatever class the component
 * actually ships today — the same class a future edit could silently
 * change back to something unreadable, the way #4767 did to #4783's three
 * components. If the class becomes a `cn(...)` call, this throws instead
 * of silently matching nothing.
 *
 * A `className={\`...\`}` TEMPLATE LITERAL is also supported, but only when
 * it is statically analysable — its class tokens are all literal text, with
 * no `${...}` expression at all (e.g. a component that uses backticks for
 * no functional reason). The moment an actual `${...}` interpolation is
 * present, the resulting string depends on a runtime value this static
 * extractor cannot resolve, so it throws loudly rather than guessing a
 * branch or returning a partial string — the same "throw, don't silently
 * mismatch" property this file has always had for `cn(...)`. See
 * `CoordinateDisplay.tsx` (#4825) for a real component whose template
 * literal genuinely interpolates (`${primary ? 'a' : 'b'}`) and therefore
 * still throws here.
 */

import { readFileSync } from 'node:fs';

/**
 * Bounds a post-anchor slice of source to the anchor's own JSX opening-tag
 * boundary — up to and including the next `>` — so a scan cannot fall
 * through past the tag it is meant to read and match a `className` (or
 * other literal) belonging to unrelated markup further down the file. This
 * covers both shapes the anchors in this directory use:
 *  - the anchor already closed its own tag (e.g. `<TooltipContent ...>`),
 *    in which case the next `>` is the end of the immediately-following
 *    child element's opening tag;
 *  - the anchor ends mid-tag, right before the attribute we want (e.g.
 *    `{prop.description && <p `), in which case the next `>` is that same
 *    tag's own close.
 * Either way, "the next `>`" is exactly the boundary of the one tag the
 * anchor identifies. If no `>` follows, the scan is left unbounded (the
 * existing "not found" error below still fires).
 */
function boundToNextTagClose(rest: string): string {
  const tagEnd = rest.indexOf('>');
  return tagEnd < 0 ? rest : rest.slice(0, tagEnd + 1);
}

/** True when `anchor` ends right at (or inside) a JSX opening tag start,
 *  e.g. `<TooltipContent` or `<TooltipPrimitive.Content` possibly followed
 *  by trailing whitespace — as opposed to a generic anchor into plain
 *  JS/TSX code, where a `>` boundary would be wrong (an arrow function's
 *  `=>` contains `>` too, and a multi-line `cn(...)` call outside JSX has
 *  no enclosing tag to bound against). */
function anchorIsJsxTagStart(anchor: string): boolean {
  return /<[A-Za-z][\w.]*\s*$/.test(anchor);
}

/**
 * @param filePath Absolute path to the component source file.
 * @param anchor A literal substring that appears once, immediately before
 *   the `className="..."` to extract (e.g. a distinctive piece of JSX text
 *   or a preceding attribute).
 */
export function extractClassNameAfter(filePath: string, anchor: string): string {
  const src = readFileSync(filePath, 'utf-8');
  const anchorIndex = src.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(`Anchor not found in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  const rest = boundToNextTagClose(src.slice(anchorIndex + anchor.length));
  const m = rest.match(/className=(["'])(.*?)\1/s);
  if (m) {
    return m[2];
  }
  const t = rest.match(/className=\{`(.*?)`\}/s);
  if (t) {
    if (t[1].includes('${')) {
      throw new Error(
        `className is a template literal with runtime interpolation in ${filePath} after anchor ` +
          `${JSON.stringify(anchor)}: \`${t[1]}\`. This extractor only handles a template literal whose class ` +
          `tokens are literal text (no \${...} expression) — it cannot know which branch of a runtime-dependent ` +
          `expression a real render would pick, and refuses to guess one or return a partial string. Either give ` +
          `this className a literal value, or extend this extractor for the specific statically-analysable shape ` +
          `this expression is (e.g. a ternary between two string-literal branches), which is a design decision ` +
          `about what the extractor's result type should be for multiple possible classNames — do not hardcode ` +
          `the expected class here instead, that reintroduces the untestable-string problem.`,
      );
    }
    return t[1];
  }
  throw new Error(
    `No literal className="..." found after anchor in ${filePath}: ${JSON.stringify(anchor)}, within its ` +
      `own JSX opening tag. If this component switched to a cn(...) call, this extractor needs updating — do ` +
      `not hardcode the expected class instead, that reintroduces the untestable-string problem. If the ` +
      `className moved to a different tag than the anchor's, widen the anchor instead of removing this ` +
      `boundary — it exists to stop matching unrelated markup further down the file.`,
  );
}

/**
 * Like {@link extractClassNameAfter}, but for the first quoted string literal
 * after `anchor` — for a `cn('...', className)` call (`tooltip.tsx`'s
 * `TooltipContent`) rather than a plain JSX `className="..."` attribute.
 *
 * The tag-boundary restriction only applies when `anchor` itself identifies
 * a JSX opening tag (e.g. `<TooltipContent` / `<TooltipPrimitive.Content`).
 * `cn(...)` calls routinely span multiple lines — that's fine, the boundary
 * is the tag's closing `>`, not a newline. For a non-JSX anchor (a plain
 * string/array/object literal elsewhere in the file) there is no enclosing
 * tag to bound against, and a `>` boundary would misfire on an arrow
 * function's `=>`, so the scan stays unbounded in that case.
 */
export function extractFirstStringLiteralAfter(filePath: string, anchor: string): string {
  const src = readFileSync(filePath, 'utf-8');
  const anchorIndex = src.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(`Anchor not found in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  let rest = src.slice(anchorIndex + anchor.length);
  if (anchorIsJsxTagStart(anchor)) {
    rest = boundToNextTagClose(rest);
  }
  const m = rest.match(/(['"`])(.*?)\1/s);
  if (!m) {
    throw new Error(`No string literal found after anchor in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  return m[2];
}
