import { describe, test, expect } from "bun:test";
import { preprocessText } from "./preprocessor.js";

describe("preprocessText", () => {
  test("resolves 'N phút sau khi ăn sáng khoảng T rưỡi' to absolute time", () => {
    const result = preprocessText("30 phút sau khi ăn sáng khoảng 7 rưỡi");
    // 7:30 + 30min = 08:00
    expect(result).toContain("08 giờ 00 phút");
  });

  test("resolves 'N phút sau khi ăn sáng khoảng T giờ M phút'", () => {
    const result = preprocessText("15 phút sau khi ăn sáng khoảng 7 giờ 30 phút");
    // 7:30 + 15min = 07:45
    expect(result).toContain("07 giờ 45 phút");
  });

  test("strips 'tầm/khoảng' before time expression", () => {
    expect(preprocessText("tầm 8 giờ")).toBe("8 giờ");
    expect(preprocessText("khoảng 9 giờ rưỡi")).toBe("9 giờ rưỡi");
  });

  test("strips 'tầm/khoảng' before standalone rưỡi", () => {
    expect(preprocessText("tầm 7 rưỡi")).toBe("7 rưỡi");
  });

  test("expands 'buổi sáng' to default clock time with ₁ marker", () => {
    const result = preprocessText("buổi sáng");
    expect(result).toContain("9 giờ sáng₁");
  });

  test("expands 'buổi chiều' to default clock time with ₁ marker", () => {
    const result = preprocessText("buổi chiều");
    expect(result).toContain("14 giờ chiều₁");
  });

  test("expands 'buổi tối' to default clock time with ₁ marker", () => {
    const result = preprocessText("buổi tối");
    expect(result).toContain("20 giờ tối₁");
  });

  test("inserts clock time for standalone period after conjunction", () => {
    const result = preprocessText("rồi tối nhắc");
    expect(result).toContain("20 giờ tối₁");
  });

  test("does NOT expand 'sáng mai' (date keyword, not period)", () => {
    const result = preprocessText("rồi sáng mai nhắc");
    // Should NOT insert clock time — "sáng mai" is excluded
    expect(result).not.toContain("9 giờ");
    expect(result).toContain("sáng mai");
  });
});
