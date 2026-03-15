/**
 * Prompt construction and token budget estimation for LLM.
 */

/**
 * Build the LLM prompt for Vietnamese schedule parsing.
 *
 * The prompt ends with `{"tasks":[` to force the model to continue
 * generating the JSON array directly (prefix forcing technique).
 */
export function buildPrompt(text: string, nowHint: string, tz: string): string {
  return `Extract schedule tasks from Vietnamese text. Output ONLY valid JSON, nothing else. No markdown fences.
Now: ${nowHint} (${tz})
Rules:
- Each timed event = 1 task. "rồi/và X" at same time = new task. "trước đó N phút X" = new task at anchor-N min.
- "nhắc trước N phút" = r=N on same task. "N phút sau khi ăn X khoảng T" = d=T+N min.
- "tầm/khoảng T" = time T. "tan làm/học" no time: d=00:00, q="Bạn tan lúc mấy giờ?".
- Hours 6-11=AM, 12=noon, 13-23=PM, 0-5: q=ask AM or PM. sáng/trưa/chiều/tối override. Past time = tomorrow.
- buổi sáng=~09:00, buổi trưa=12:00, buổi chiều=~14:00, buổi tối=~20:00 with q asking exact time.
- Remove tôi/mình from title. báo thức=alarm. mở/bật APP=open_app,p=APP. gọi=call. else=notify.
- t = EXACT Vietnamese task phrase from input (e.g. "gọi khách hàng", "uống thuốc"). NEVER use English words like "alarm","call","notify" as t.
JSON schema per task: {"t":"title","d":"YYYY-MM-DD HH:MM","a":"notify","p":null,"r":0,"q":null}
Examples: "nhắc gọi cho vợ 5 chiều"→{"t":"gọi cho vợ","d":"2026-03-06 17:00","a":"call","p":null,"r":0,"q":null}
          "báo thức 6 sáng"→{"t":"báo thức","d":"2026-03-06 06:00","a":"alarm","p":null,"r":0,"q":null}
          "gọi khách hàng buổi chiều"→{"t":"gọi khách hàng","d":"2026-03-06 14:00","a":"call","p":null,"r":0,"q":"Bạn muốn gọi lúc mấy giờ chiều?"}
Vietnamese text: ${JSON.stringify(text)}
{"tasks":[`;
}

/**
 * Estimate token budget for LLM generation.
 *
 * Heuristic: ~80 tokens per task. Counts potential tasks by looking for:
 *  - Time expressions ("X giờ", "X rưỡi")
 *  - Ambiguous time markers ("tan làm", "tan học", "đến công ty")
 *  - Conjunctions that split tasks ("và", "rồi", "sau đó")
 *
 * Result is clamped to [80, 450] tokens.
 */
export function calcNumPredict(text: string): number {
  const timeCnt = (text.match(/\d{1,2}\s*(?:giờ|rưỡi)/gi) ?? []).length;
  const tanCnt = (text.match(/tan làm|tan học|đến công ty/gi) ?? []).length;
  const conjCnt = (text.match(/\b(?:và|rồi|sau đó)\b/gi) ?? []).length;
  const taskEst = Math.max(timeCnt + tanCnt + conjCnt, 1);
  return Math.min(taskEst * 80, 450);
}
