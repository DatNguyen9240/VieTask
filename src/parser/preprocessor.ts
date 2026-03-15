/**
 * Pre-processor for Vietnamese text.
 *
 * Resolves relative time expressions (e.g. "30 phút sau khi ăn sáng khoảng 7 rưỡi")
 * into absolute clock times before feeding to the parser or LLM.
 */

/** Zero-pad a number to 2 digits. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Convert an anchor time expression to total minutes since midnight.
 * Handles: "7 giờ rưỡi" | "7 rưỡi" | "7 giờ 30 phút" | "7 giờ"
 */
function anchorMinutes(h: string, min?: string, ruoi?: string): number {
  return Number(h) * 60 + (ruoi ? 30 : (min ? Number(min) : 0));
}

/** Default clock hours for Vietnamese period words. */
const PERIOD_HOURS: Record<string, number> = {
  "sáng": 9,
  "trưa": 12,
  "chiều": 14,
  "tối": 20,
};

/**
 * Rewrite relative/fuzzy time expressions in Vietnamese text to absolute clock times.
 *
 * Transformations performed:
 * 1. "N phút/giờ sau khi ăn [sáng|trưa|tối] khoảng T" → absolute time (T + N)
 * 2. "tầm/khoảng X giờ [rưỡi]" → "X giờ [rưỡi]"  (strip filler words)
 * 3. "tầm/khoảng X rưỡi" → "X rưỡi"
 * 4. "buổi sáng/trưa/chiều/tối" → default clock time + ₁ marker (signals need_clarification)
 * 5. standalone period after conjunction ("rồi tối nhắc X") → insert clock time
 */
export function preprocessText(text: string): string {
  // 1. "N phút/giờ sau khi ăn [sáng|trưa|tối] khoảng T giờ [M phút|rưỡi]" → absolute time
  //    e.g. "30 phút sau khi ăn sáng khoảng 7 rưỡi" → "08 giờ 00 phút"
  //    Regex groups: (1)amount (2)unit (3)hour (4)minutes (5)rưỡi-after-giờ (6)rưỡi-standalone
  text = text.replace(
    /(\d+)\s*(phút|tiếng|giờ)\s+sau khi\s+ăn\s+(?:sáng|trưa|tối)\s+khoảng\s+(\d{1,2})\s*(?:giờ(?:\s*(?:(\d{1,2})\s*phút|(rưỡi)))?|(rưỡi))/gi,
    (_: string, amt: string, unit: string, h: string, min: string, ruoi1: string, ruoi2: string) => {
      const offset = Number(amt) * (/^phút$/i.test(unit) ? 1 : 60);
      const total = anchorMinutes(h, min, ruoi1 || ruoi2) + offset;
      return `${pad2(Math.floor(total / 60))} giờ ${pad2(total % 60)} phút`;
    }
  );

  // 2. "tầm/khoảng X giờ [rưỡi]" → "X giờ [rưỡi]"
  text = text.replace(/(?:tầm|khoảng)\s+(\d{1,2}\s*giờ(?:\s*rưỡi)?)/gi, "$1");

  // 3. "tầm/khoảng X rưỡi" → "X rưỡi"
  text = text.replace(/(?:tầm|khoảng)\s+(\d{1,2}\s*rưỡi)/gi, "$1");

  // 4. "buổi sáng/trưa/chiều/tối" → default clock time + ₁ marker
  //    The ₁ marker tells the rule parser that clarification is needed
  for (const [period, h] of Object.entries(PERIOD_HOURS)) {
    text = text.replace(new RegExp(`\\bbuổi\\s+${period}\\b`, "gi"), `${h} giờ ${period}₁`);
  }

  // 5. Standalone period word after conjunction → insert clock time
  //    e.g. "rồi tối nhắc X" → "rồi 20 giờ tối₁ nhắc X"
  //    Excludes "sáng mai", "chiều mai", "tối mai", "sáng nay" etc.
  text = text.replace(
    /\b(rồi|và|sau đó|xong xuôi|xong|,)\s+(sáng(?!\s+(?:mai|nay))|trưa|chiều(?!\s+(?:mai|nay))|tối(?!\s+(?:mai|nay)))\s+/gi,
    (_, conj: string, period: string) => `${conj} ${PERIOD_HOURS[period.toLowerCase()]} giờ ${period}₁ `
  );

  return text;
}
