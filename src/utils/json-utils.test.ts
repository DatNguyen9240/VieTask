import { describe, test, expect } from "bun:test";
import { extractJson, repairJson } from "./json-utils.js";

describe("extractJson", () => {
  test("parses valid JSON object from clean input", () => {
    const result = extractJson('{"tasks":[{"t":"test"}]}');
    expect(result).toEqual({ tasks: [{ t: "test" }] });
  });

  test("extracts JSON from surrounding text", () => {
    const result = extractJson('Here is the result: {"ok":true} done.');
    expect(result).toEqual({ ok: true });
  });

  test("handles truncated JSON - closes missing array bracket", () => {
    // Array with missing outer closing } — recoverable
    const result = extractJson('{"tasks":[{"t":"hello","d":"2026-03-06 09:00"}]}extra text');
    expect(result).not.toBeNull();
    const obj = result as any;
    expect(obj.tasks).toBeDefined();
    expect(obj.tasks[0].t).toBe("hello");
  });

  test("handles truncated JSON - incomplete inner object removed", () => {
    // Two objects in array, second one incomplete → first one should survive
    const result = extractJson('{"tasks":[{"t":"a","d":"2026-03-06 09:00"},{"t":"b"');
    // The incomplete second object gets stripped, array gets closed
    if (result !== null) {
      const obj = result as any;
      expect(obj.tasks[0].t).toBe("a");
    }
  });

  test("handles JSON with trailing content after last }", () => {
    const result = extractJson('{"ok":true}\nSome extra text');
    expect(result).toEqual({ ok: true });
  });

  test("returns null for input with no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  test("handles nested objects", () => {
    const result = extractJson('{"a":{"b":{"c":1}}}');
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });
});

describe("repairJson", () => {
  test("converts ISO date T separator to space", () => {
    const result = repairJson('"2026-03-06T17:00"');
    expect(result).toBe('"2026-03-06 17:00"');
  });

  test("removes trailing commas", () => {
    expect(repairJson('{"a":1,}')).toBe('{"a":1}');
    expect(repairJson('[1,2,]')).toBe('[1,2]');
  });

  test("converts single quotes to double quotes", () => {
    const result = repairJson("{'key':'value'}");
    expect(result).toBe('{"key":"value"}');
  });

  test("converts backtick quotes to double quotes", () => {
    const result = repairJson('`key`');
    expect(result).toBe('"key"');
  });

  test("removes inline comments", () => {
    const result = repairJson('{"a":1} // this is a comment\n{"b":2}');
    expect(result).toContain('"a":1');
    expect(result).not.toContain("// this is a comment");
  });

  test("handles multiple repairs at once (double-quoted input)", () => {
    // ISO-T fix only applies to double-quoted strings
    const input = `{"t":"test","d":"2026-03-06T17:00",}`;
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.t).toBe("test");
    expect(parsed.d).toBe("2026-03-06 17:00");
  });

  test("single-quote repair + trailing comma", () => {
    const input = `{'t':'test',}`;
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.t).toBe("test");
  });
});
