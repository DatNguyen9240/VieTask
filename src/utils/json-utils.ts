/**
 * Utilities for extracting and repairing JSON from raw LLM output.
 *
 * LLMs often produce malformed JSON — truncated, with trailing commas,
 * single-quoted strings, inline comments, or ISO-T date separators.
 * These functions handle all those cases gracefully.
 */

/**
 * Extract a JSON object from arbitrary text.
 *
 * Strategy (in order):
 *  1. Find first `{`, try `JSON.parse` from there to end of string.
 *  2. Try parsing from first `{` to last `}`.
 *  3. Attempt to "close" truncated JSON by:
 *     - Removing the last incomplete object (e.g. `{ "t": "...` without closing `}`)
 *     - Removing trailing commas
 *     - Appending missing `}` and `]}` to balance brackets
 */
export function extractJson(text: string): unknown | null {
  const a = text.indexOf("{");
  if (a < 0) return null;

  let slice = text.slice(a);

  // Strategy 1: parse from first `{` to end of string
  try { return JSON.parse(slice); } catch { /* continue */ }

  // Strategy 2: parse from first `{` to last `}`
  const b = text.lastIndexOf("}");
  if (b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch { /* continue */ }
  }

  // Strategy 3: close truncated JSON
  slice = slice
    .replace(/,?\s*\{[^}]*$/, "")   // remove last incomplete object
    .replace(/,\s*$/, "");           // remove trailing comma

  // Count unmatched brackets and close them
  const openSquare = (slice.match(/\[/g) ?? []).length - (slice.match(/\]/g) ?? []).length;
  const openCurly = (slice.match(/\{/g) ?? []).length - (slice.match(/\}/g) ?? []).length;
  slice += "}".repeat(Math.max(openCurly, 0)) + "]}".repeat(Math.max(openSquare, 0));

  try { return JSON.parse(slice); } catch { return null; }
}

/**
 * Fix common JSON mistakes produced by LLMs before parsing.
 *
 * Fixes:
 *  - ISO date `"2026-03-06T17:00"` → `"2026-03-06 17:00"` (T → space)
 *  - Trailing commas before `}` or `]`
 *  - Single quotes or backtick quotes → double quotes
 *  - Inline `// comments`
 */
export function repairJson(text: string): string {
  return text
    .replace(/"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})"/g, '"$1 $2"')  // ISO T → space
    .replace(/,\s*([}\]])/g, "$1")                                  // trailing commas
    .replace(/(['`])(.*?)\1/g, (_, _q, v) => `"${v}"`)             // single/backtick quotes → double
    .replace(/(?<![":])\/\/[^\n]*/g, "");                           // inline comments (but NOT ://)
}
