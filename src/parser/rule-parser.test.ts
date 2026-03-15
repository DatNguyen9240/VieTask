import { describe, test, expect } from "bun:test";
import { detectAction, tryRuleBased } from "./rule-parser.js";

describe("detectAction", () => {
  test("detects alarm", () => {
    expect(detectAction("báo thức")).toEqual({ action: "alarm", app_name: null });
    expect(detectAction("gọi dậy")).toEqual({ action: "alarm", app_name: null });
  });

  test("detects call", () => {
    expect(detectAction("gọi cho vợ")).toEqual({ action: "call", app_name: null });
    expect(detectAction("gọi điện cho sếp")).toEqual({ action: "call", app_name: null });
  });

  test("detects open_app", () => {
    const result = detectAction("mở app Spotify");
    expect(result.action).toBe("open_app");
    expect(result.app_name).toBe("Spotify");
  });

  test("detects notify as default", () => {
    expect(detectAction("uống thuốc")).toEqual({ action: "notify", app_name: null });
    expect(detectAction("họp với team")).toEqual({ action: "notify", app_name: null });
  });
});

describe("tryRuleBased", () => {
  const NOW = "2026-03-06 09:00";

  test("simple single task with time", () => {
    const result = tryRuleBased("7 giờ tối mở app Spotify", NOW);
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0]!.title).toContain("Spotify");
    expect(result!.tasks[0]!.action).toBe("open_app");
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-06 19:00");
  });

  test("báo thức sáng", () => {
    const result = tryRuleBased("8 giờ sáng báo thức", "2026-03-06 07:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.action).toBe("alarm");
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-06 08:00");
  });

  test("multiple tasks with rồi conjunction", () => {
    const result = tryRuleBased("8 giờ sáng báo thức rồi 8 rưỡi pha cà phê", "2026-03-06 07:00");
    expect(result).not.toBeNull();
    expect(result!.tasks.length).toBeGreaterThanOrEqual(2);
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-06 08:00");
  });

  test("'trước đó N phút' creates extra earlier task", () => {
    const result = tryRuleBased("8 rưỡi nhắc pha cà phê, trước đó 15 phút nhắc chuẩn bị", "2026-03-06 07:00");
    expect(result).not.toBeNull();
    const tasks = result!.tasks;
    // Should have tasks at 8:30 and 8:15
    const times = tasks.map(t => t.datetime_local);
    expect(times).toContain("2026-03-06 08:30");
    expect(times).toContain("2026-03-06 08:15");
  });

  test("'sáng mai' forces tasks to tomorrow", () => {
    const result = tryRuleBased("sáng mai 6 giờ báo thức", "2026-03-06 07:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-07 06:00");
  });

  test("'tan làm' creates clarification task", () => {
    const result = tryRuleBased("tan làm nhắc gọi cho vợ", NOW);
    expect(result).not.toBeNull();
    const tanTask = result!.tasks.find(t => t.need_clarification);
    expect(tanTask).toBeDefined();
    expect(tanTask!.clarifying_question).toContain("tan làm");
    expect(tanTask!.action).toBe("call");
  });

  test("past time auto-shifts to tomorrow", () => {
    // nowHint is 09:00, task at 08:00 → should shift to tomorrow
    const result = tryRuleBased("8 giờ sáng báo thức", "2026-03-06 09:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-07 08:00");
  });

  test("'thứ Hai tuần sau' resolves to correct date", () => {
    // 2026-03-07 is Saturday (DOW=6). Next Monday = 2026-03-09, next-week Monday = 2026-03-16
    const result = tryRuleBased("thứ Hai tuần sau gọi cho sếp", "2026-03-07 09:00");
    expect(result).not.toBeNull();
    // Should ask for time since no time given, but should have the correct date
    expect(result!.tasks[0]!.need_clarification).toBe(true);
  });

  test("'ngày kia' resolves to day after tomorrow", () => {
    const result = tryRuleBased("ngày kia lúc 3 giờ chiều nộp báo cáo", "2026-03-07 09:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-09 15:00");
  });

  test("'ngày DD tháng MM' resolves to specific date", () => {
    const result = tryRuleBased("ngày 15 tháng 3 lúc 8 giờ sáng sinh nhật vợ", "2026-03-07 09:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-15 08:00");
  });

  test("returns null for purely ambiguous input", () => {
    // No time expression, no date keyword → can't parse
    expect(tryRuleBased("nhắc tôi uống thuốc", NOW)).toBeNull();
  });

  test("handles rưỡi (half past)", () => {
    const result = tryRuleBased("7 rưỡi uống thuốc", "2026-03-06 06:00");
    expect(result).not.toBeNull();
    expect(result!.tasks[0]!.datetime_local).toBe("2026-03-06 07:30");
  });
});
