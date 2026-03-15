/**
 * Rule-based fast parser for Vietnamese schedule text.
 *
 * Handles simple, unambiguous inputs in <10ms without calling the LLM.
 * Falls back to null when the input is too complex or ambiguous.
 */

import type { ParsedTask } from "../schemas.js";

// ===== Action detection regex patterns =====

/** Alarm keywords: "báo thức", "gọi dậy", etc. */
const ALARM_RX = /báo thức|gọi dậy|gọi tôi dậy|đánh thức|thức dậy/i;

/** Phone call keywords: "gọi điện", "gọi cho", etc. */
const CALL_RX = /gọi điện|gọi cho|điện thoại cho/i;

/** Open app trigger: "mở/bật [app] X" */
const OPEN_TRIGGER_RX = /(?:mở|bật)\s+(?:app\s+|[uUư][nN]g [dD][uU][nN]g\s+)?[\w]+/i;

/** Truly ambiguous inputs (time is fully unknown) */
const AMBIGUOUS_RX = /tan làm|tan học|đến công ty/i;

/** Tomorrow patterns */
const TOMORROW_RX = /\b(?:sáng mai|ngày mai|tối mai|chiều mai|mai này|ngay mai)\b/i;

/** Day-of-week mapping: Vietnamese → JS getDay() value (0=Sunday) */
const DOW_MAP: Record<string, number> = {
  hai: 1, ba: 2, 'tư': 3, năm: 4, sáu: 5, bảy: 6, 'chủ nhật': 0, cn: 0,
};

/**
 * Detect the action type from a task title.
 * Returns the action enum and app_name (for open_app action).
 */
export function detectAction(title: string): { action: ParsedTask["action"]; app_name: string | null } {
  if (ALARM_RX.test(title)) return { action: "alarm", app_name: null };
  if (CALL_RX.test(title)) return { action: "call", app_name: null };
  if (OPEN_TRIGGER_RX.test(title)) {
    const m = title.match(/(?:mở|bật)\s+(?:app\s+|web\s+|trang\s+web\s+|trang\s+|[uư]ng dụng\s+)?(.+)/i);
    return { action: "open_app", app_name: m ? m[1]!.replace(/[,;]\s*$/, "").trim() : null };
  }
  return { action: "notify", app_name: null };
}

/** Zero-pad a number to 2 digits. */
const pad = (n: number) => String(n).padStart(2, "0");

/** Strip personal pronouns and filler words from a text segment. */
function stripPronouns(text: string): string {
  return text
    .replace(/\bcho\s+(?:tôi|mình|em|anh|chị|mày)\b/gi, "")
    .replace(/\b(?:tôi|mình|em|anh|chị|mày)\b/gi, "")
    .replace(/[,;]\s*$/, "")
    .replace(/\s+/g, " ").trim();
}

/** Strip time expressions, filler words, and pronouns to extract a clean task title. */
function cleanTitle(segment: string): string {
  return segment
    // Remove relative-date phrases
    .replace(/\b(?:sáng mai|ngày mai|tối mai|chiều mai|mai này|ngay mai|hôm nay|hôm qua|sáng nay|chiều nay|tối nay)\b/gi, "")
    // Remove day-of-week phrases
    .replace(/\bthứ\s+(?:hai|ba|tư|năm|sáu|bảy|chủ\s+nhật|cn)\s*(?:tuần\s+(?:sau|tới|này))?\b/gi, "")
    // Remove "ngày kia"
    .replace(/\bngày\s+kia\b/gi, "")
    // Remove "ngày DD tháng MM [năm YYYY]"
    .replace(/\bngày\s+\d{1,2}\s+tháng\s+\d{1,2}(?:\s+năm\s+\d{4})?\b/gi, "")
    // Remove "nhắc trước N phút/giờ"
    .replace(/nhắc trước\s*\d+\s*(phút|tiếng|giờ)/gi, "")
    // Remove time expressions: "X giờ [Y phút|rưỡi] [sáng|trưa|chiều|tối]"
    .replace(/\b\d{1,2}\s*(?:giờ(?:\s*\d{1,2}\s*phút|\s*rưỡi)?|rưỡi)(?:\s*(?:sáng|trưa|chiều|tối))?\b/gi, "")
    // Remove "buổi X"
    .replace(/\bbuổi\s+(?:sáng|trưa|chiều|tối)\b/gi, "")
    // Remove ₁ markers
    .replace(/₁/g, "")
    // Strip pronouns and filler words
    .replace(/\bcho\s+(?:tôi|mình|em|anh|chị|mày)\b/gi, "")
    .replace(/\b(?:tôi|mình|em|anh|chị|mày)\b/gi, "")
    .replace(/\b(?:khoảng|tầm|lúc|vào)\b/gi, "")
    // Strip leading "nhắc"
    .replace(/^(?:nhắc\s+)+/i, "")
    .replace(/[,;]/g, " ")
    // Strip trailing conjunctions
    .replace(/\s+(?:và|rồi|sau đó|xong|rồi thì)\s*$/i, "")
    // Strip trailing filler words
    .replace(/\b(?:dậy|đi|nào|nhé|nha|đây|lên|xuống|ra|vào)\s*$/gi, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * Calculate the next day's date string (YYYY-MM-DD) from a base date.
 */
function getNextDay(baseDate: string): string {
  const [y, mo, d] = baseDate.split("-").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d! + 1)).toISOString().slice(0, 10);
}

/**
 * Try to parse Vietnamese schedule text using rules only (no LLM).
 *
 * Returns structured tasks if the input is unambiguous enough,
 * or null if the LLM should handle it.
 *
 * @param text - Pre-processed Vietnamese text
 * @param nowHint - Current time as "YYYY-MM-DD HH:MM"
 */
export function tryRuleBased(text: string, nowHint: string): { tasks: ParsedTask[] } | null {
  // --- Handle "tan làm/học/đến công ty" as a time-reference marker ---
  const tanLamRx = /\b(tan làm|tan học|đến công ty)\b/i;
  const tanLamMatch = text.match(tanLamRx);
  if (tanLamMatch) {
    const tanLamIdx = tanLamMatch.index!;
    const keyword = tanLamMatch[1]!;
    const beforeTanLam = text.slice(0, tanLamIdx).trimEnd();
    const afterTanLam = text.slice(tanLamIdx + keyword.length).trimStart()
      .replace(/^[,;]\s*/, "")
      .replace(/^(?:và|rồi|sau đó)\s+/gi, "")
      .trim();

    const tasks: ParsedTask[] = [];

    if (beforeTanLam) {
      const before = tryRuleBased(beforeTanLam, nowHint);
      if (!before) return null; // can't parse before-part → fall back to LLM
      tasks.push(...before.tasks);
    }

    if (afterTanLam) {
      const title = stripPronouns(afterTanLam);
      if (title) {
        const { action, app_name } = detectAction(title);
        const dateStr = nowHint.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "2026-01-01";
        tasks.push({
          title,
          datetime_local: `${dateStr} 00:00`,
          remind_before_minutes: 0,
          repeat: "none",
          confidence: 0.5,
          need_clarification: true,
          clarifying_question: `Bạn ${keyword} lúc mấy giờ?`,
          action,
          app_name,
        });
      }
    }

    return tasks.length > 0 ? { tasks } : null;
  }

  // --- Parse current time from nowHint ---
  const dm = nowHint.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!dm) return null;
  const nowH = Number(dm[4]!), nowMin = Number(dm[5]!);
  const baseDate = `${dm[1]!}-${dm[2]!}-${dm[3]!}`;

  // --- Detect "sáng mai/ngày mai/..." → force all tasks to tomorrow ---
  const forceNextDay = TOMORROW_RX.test(text);
  const nextDay = getNextDay(baseDate);

  // --- Resolve day-of-week / relative-date keywords → forced date ---
  let workText = text;
  let dowForcedDate: string | null = null;

  // "thứ Hai [tuần sau]"
  const doWRx = /\bthứ\s+(hai|ba|tư|năm|sáu|bảy|chủ\s+nhật|cn)\s*(?:tuần\s+(?:sau|tới))?\b/i;
  const doWM = workText.match(doWRx);
  if (doWM) {
    const dayKey = doWM[1]!.toLowerCase().replace(/\s+/g, ' ');
    const isNextWeek = /tuần\s+(?:sau|tới)/i.test(doWM[0]);
    const targetDow = DOW_MAP[dayKey];
    if (targetDow !== undefined) {
      const [y2, mo2, d2] = baseDate.split('-').map(Number);
      const nowDow = new Date(Date.UTC(y2!, mo2! - 1, d2!)).getUTCDay();
      let diff = (targetDow - nowDow + 7) % 7 || 7; // always next occurrence, not today
      if (isNextWeek) diff += 7;
      dowForcedDate = new Date(Date.UTC(y2!, mo2! - 1, d2! + diff)).toISOString().slice(0, 10);
      workText = workText.replace(doWRx, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // "ngày kia" (day after tomorrow)
  if (!dowForcedDate) {
    const ngayKiaM = workText.match(/\bngày\s+kia\b/i);
    if (ngayKiaM) {
      const [y2, mo2, d2] = baseDate.split('-').map(Number);
      dowForcedDate = new Date(Date.UTC(y2!, mo2! - 1, d2! + 2)).toISOString().slice(0, 10);
      workText = workText.replace(/\bngày\s+kia\b/gi, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // "ngày DD tháng MM [năm YYYY]"
  if (!dowForcedDate) {
    const ngayM = workText.match(/\bngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?\b/i);
    if (ngayM) {
      const dd = ngayM[1]!.padStart(2, '0');
      const mm = ngayM[2]!.padStart(2, '0');
      const yy = ngayM[3] ?? baseDate.slice(0, 4);
      dowForcedDate = `${yy}-${mm}-${dd}`;
      workText = workText.replace(ngayM[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // --- Match all time expressions in the text ---
  // Groups: (1)hour (2)minutes (3)rưỡi-after-giờ (4)rưỡi-standalone (5)period
  const timeRx = /(\d{1,2})\s*(?:giờ(?:\s*(\d{1,2})(?:\s*phút)?|\s*(rưỡi))?|(rưỡi))(?:\s*(sáng|trưa|chiều|tối))?/gi;
  const matches = [...workText.matchAll(timeRx)];

  if (matches.length === 0) {
    if (dowForcedDate) {
      // Day resolved but no time → placeholder 00:00, ask user for time
      const taskTitle = workText
        .replace(/\b(?:nhắc(?:\s+(?:tôi|mình|anh|em|chị))?)\b/gi, '')
        .replace(/\b(?:tôi|mình|anh|em|chị|mày)\b/gi, '')
        .replace(/\b(?:khoảng|tầm|lúc|vào)\b/gi, '')
        .replace(/\s+/g, ' ').trim();
      const { action, app_name } = detectAction(taskTitle || workText.trim());
      return {
        tasks: [{
          title: taskTitle || workText.trim(),
          datetime_local: `${dowForcedDate} 00:00`,
          remind_before_minutes: 0,
          repeat: "none" as const,
          confidence: 0.5,
          need_clarification: true,
          clarifying_question: "Bạn muốn nhắc lúc mấy giờ?",
          action,
          app_name,
        }],
      };
    }
    return null;
  }

  // --- Build tasks from matched time expressions ---
  const tasks: ParsedTask[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const segStart = i === 0 ? 0 : m.index!;
    const segEnd = matches[i + 1]?.index ?? workText.length;
    const segment = workText.slice(segStart, segEnd);

    let hour = Number(m[1]!);
    const minute = (m[3] === "rưỡi" || m[4] === "rưỡi") ? 30 : (m[2] ? Number(m[2]) : 0);
    const period = m[5]?.toLowerCase();

    let need_clarification = false, clarifying_question: string | null = null;

    // --- Resolve AM/PM from period word or heuristic ---
    if (period) {
      if (period === "sáng") { if (hour === 12) hour = 0; }
      else if (period === "trưa") { hour = 12; }
      else { if (hour < 12) hour += 12; }
    } else if (hour < 13) {
      // No period word → smart AM/PM resolution
      const amPast = hour < nowH || (hour === nowH && minute <= nowMin);
      const pmHour = hour + 12;
      const pmFuture = pmHour < 24 && (pmHour > nowH || (pmHour === nowH && minute > nowMin));

      if (amPast && pmFuture) {
        // AM already passed, PM is in the future → clearly meant PM
        // e.g., "6 giờ 50" at 18:49 → 18:50
        hour = pmHour;
      } else if (!amPast) {
        // AM is still in the future → keep as morning
        // e.g., "8 giờ" at 07:30 → 08:00
      } else if (hour >= 4 && hour < 6 && ALARM_RX.test(segment)) {
        // 4-5 AM alarm context → keep as morning (shifted to tomorrow by date logic)
      } else if (!(hour >= 6 && hour <= 11)) {
        // 1-3 → ambiguous, ask user
        need_clarification = true;
        clarifying_question = `Bạn muốn ${hour} giờ sáng hay ${hour} giờ chiều/tối?`;
      }
      // hours 6-11 where AM is past and PM is also past → will be shifted to tomorrow by date logic
    }

    // ₁ marker from preprocessor → ask exact time
    if (!need_clarification && segment.includes('₁')) {
      need_clarification = true;
      clarifying_question = `Bạn muốn nhắc lúc mấy giờ${period ? " " + period : ""}?`;
    }

    // --- Detect "nhắc trước N phút/giờ" → remind_before_minutes ---
    let remind_before_minutes = 0;
    const rm = segment.match(/nhắc trước\s*(\d+)\s*(phút|tiếng|giờ)/i);
    if (rm) remind_before_minutes = Number(rm[1]!) * (rm[2]! === "phút" ? 1 : 60);

    // --- Resolve date ---
    let dateStr = dowForcedDate ?? baseDate;
    if (!dowForcedDate) {
      if (forceNextDay) {
        dateStr = nextDay;
      } else if (!need_clarification && (hour < nowH || (hour === nowH && minute <= nowMin))) {
        // Time already passed today → auto-shift to tomorrow
        dateStr = nextDay;
      }
    }

    const title = cleanTitle(segment) || segment.trim();

    // --- Handle "trước đó N phút/giờ ACTION" → extra task at earlier time ---
    const truocDoRx = /trước đó\s*(\d+)\s*(phút|tiếng|giờ)\s+(.+)/i;
    const tdm = !need_clarification ? segment.match(truocDoRx) : null;

    if (tdm) {
      const offset = Number(tdm[1]!) * (tdm[2]! === "phút" ? 1 : 60);
      const subTitle = stripPronouns(tdm[3]!)
        .replace(/\s+(?:và|rồi|sau đó|xong|rồi thì)\s*$/i, "")
        .replace(/\b(?:dậy|đi|nào|nhé|nha|đây|lên|xuống|ra|vào)\s*$/gi, "")
        .replace(/\s+/g, " ").trim();
      const mainTitle = title.replace(/trước đó\s*\d+\s*(phút|tiếng|giờ)\s+.+/i, "").replace(/\s+/g, " ").trim() || title;
      const totalMin = hour * 60 + minute - offset;
      const normalizedMin = ((totalMin % 1440) + 1440) % 1440;
      const subHour = Math.floor(normalizedMin / 60);
      const subMin = normalizedMin % 60;
      let subDateStr = dateStr;
      if (totalMin < 0) {
        const [y, mo, d] = dateStr.split("-").map(Number);
        subDateStr = new Date(Date.UTC(y!, mo! - 1, d! - 1)).toISOString().slice(0, 10);
      }
      const mainParts = mainTitle.split(/\s+(?:và|rồi|sau đó|xong|rồi thì|tiếp theo)\s+/i).map(p => p.trim()).filter(Boolean);
      for (const part of mainParts) {
        const mainAction = detectAction(part);
        tasks.push({ title: part, datetime_local: `${dateStr} ${pad(hour)}:${pad(minute)}`, remind_before_minutes, repeat: "none", confidence: 0.95, need_clarification: false, clarifying_question: null, ...mainAction });
      }
      const subAction = detectAction(subTitle);
      tasks.push({ title: subTitle, datetime_local: `${subDateStr} ${pad(subHour)}:${pad(subMin)}`, remind_before_minutes: 0, repeat: "none", confidence: 0.95, need_clarification: false, clarifying_question: null, ...subAction });
    } else {
      // Split on conjunctions if different actions detected
      const parts = title.split(/\s+(?:và|rồi|sau đó|xong|rồi thì|tiếp theo)\s+/i).map(p => p.trim()).filter(Boolean);
      const shouldSplit = parts.length > 1 && parts.some(p => detectAction(p).action !== "notify");
      if (shouldSplit) {
        for (const part of parts) {
          const { action, app_name } = detectAction(part);
          tasks.push({ title: part, datetime_local: `${dateStr} ${pad(hour)}:${pad(minute)}`, remind_before_minutes: 0, repeat: "none", confidence: 0.95, need_clarification: false, clarifying_question: null, action, app_name });
        }
      } else {
        const { action, app_name } = detectAction(title);
        tasks.push({ title, datetime_local: `${dateStr} ${pad(hour)}:${pad(minute)}`, remind_before_minutes, repeat: "none", confidence: need_clarification ? 0.5 : 0.95, need_clarification, clarifying_question, action, app_name });
      }
    }
  }

  if (tasks.length === 0) return null;

  // --- Post-process: borrow title from previous task for empty-title tasks ---
  // Handles patterns like "TASK lúc TIME1 rồi TIME2" where the 2nd task
  // captures only the time expression with no meaningful title.
  const CLAUSE_SPLIT_RX = /\s+(?:rồi(?!\s+thì)|và|sau đó|xong xuôi rồi|xong xuôi|xong(?!\s+xuôi))\s+/i;
  for (let i = 1; i < tasks.length; i++) {
    const t = tasks[i]!;
    const meaningful = t.title
      .replace(/\b\d{1,2}\s*(?:giờ(?:\s*\d{1,2}\s*phút|\s*rưỡi)?|rưỡi)(?:\s*(?:sáng|trưa|chiều|tối))?\b/gi, "")
      .replace(/\b(?:rồi|lúc|vào|và)\b/gi, "").trim();
    if (!meaningful) {
      const prev = tasks[i - 1]!;
      const parts = prev.title.split(CLAUSE_SPLIT_RX);
      if (parts.length > 1) {
        const borrowed = parts.pop()!
          .replace(/^\s*(?:nhắc\s+)+/i, "")
          .replace(/^\s*(?:rồi|và|sau đó)\s+/i, "").trim();
        if (borrowed.length > 2) {
          prev.title = parts.join(" ").replace(/\s+/g, " ").trim();
          t.title = borrowed;
          const { action, app_name } = detectAction(t.title);
          t.action = action; t.app_name = app_name;
        }
      }
    }
  }

  return { tasks };
}
