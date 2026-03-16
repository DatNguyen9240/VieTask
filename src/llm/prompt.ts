/**
 * Prompt construction and token budget estimation for LLM.
 */

/**
 * Build the LLM prompt for Vietnamese schedule parsing.
 *
 * The prompt ends with `{"tasks":[` to force the model to continue
 * generating the JSON array directly (prefix forcing technique).
 */
export function buildPrompt(text: string, nowHint: string, tz: string, contacts?: Record<string, string>): string {
  // Build contacts context if available
  const contactsSection = contacts && Object.keys(contacts).length > 0
    ? `\nUser contacts (name→phone): ${JSON.stringify(contacts)}. When user mentions a contact name in call/zalo/message actions, use their phone number for deep links (e.g. zalo://conversation?phone=PHONE, tel:PHONE).`
    : '';

  return `Extract schedule tasks from Vietnamese text. Output ONLY valid JSON, nothing else. No markdown fences.
Now: ${nowHint} (${tz})${contactsSection}
Rules:
- Each timed event = 1 task. "rồi/và X" at same time = new task. "trước đó N phút X" = new task at anchor-N min.
- "nhắc trước N phút" = r=N on same task. "N phút sau khi ăn X khoảng T" = d=T+N min.
- "tầm/khoảng T" = time T. "tan làm/học" no time: d=00:00, q="Bạn tan lúc mấy giờ?", s=["5 giờ chiều","6 giờ chiều"].
- IMPORTANT: If the user does NOT specify a time (e.g. "nhắc tôi họp", "gọi cho mẹ", "uống thuốc"), set d=today 00:00, q="Bạn muốn nhắc lúc mấy giờ?", s=["8 giờ sáng","12 giờ trưa","3 giờ chiều","8 giờ tối"]. NEVER guess a time when none is given.
- CLARIFICATION REPLIES: If input has comma-separated parts (e.g. "nhắc tôi họp, 3 giờ chiều"), the parts after the comma are the user's ANSWERS to clarification questions. Use them directly to fill in missing info — DO NOT ask again. Example: "nhắc tôi họp, 3 giờ chiều"→d=15:00, q=null, s=null.
- Hours 6-11=AM, 12=noon, 13-23=PM, 0-5: q=ask AM or PM, s=["X giờ sáng","X giờ chiều"]. sáng/trưa/chiều/tối override. Past time = tomorrow.
- buổi sáng=~09:00, buổi trưa=12:00, buổi chiều=~14:00, buổi tối=~20:00 with q asking exact time, s with 2-4 likely times.
- Remove tôi/mình from title. báo thức=alarm. mở/bật APP=open_app,p=APP. gọi=call. else=notify.
- t = EXACT Vietnamese task phrase from input (e.g. "gọi khách hàng", "uống thuốc"). NEVER use English words like "alarm","call","notify" as t.
- u = for open_app: use native deep link scheme (e.g. fb://, zalo://, youtube://, instagram://, spotify://, tiktok://, telegram://, whatsapp://, ms-word://, canva://). When user specifies content, use content URL (e.g. youtube://results?search_query=..., https://www.youtube.com/results?search_query=...). For zalo with known contact, use zalo://conversation?phone=PHONE. null for non open_app actions.
- pkg = REQUIRED for open_app: the REAL Android package name (e.g. com.zing.zalo, com.facebook.katana, com.google.android.youtube, com.microsoft.office.word, com.discord, com.canva.editor). You MUST provide the correct package for ANY app the user mentions — use your knowledge of real Android package names. null for non open_app actions.
- s = when q is set, provide 2-4 short Vietnamese reply options the user can pick. null when q is null.
JSON schema per task: {"t":"title","d":"YYYY-MM-DD HH:MM","a":"notify","p":null,"u":null,"pkg":null,"r":0,"q":null,"s":null}
Examples: "nhắc gọi cho vợ 5 chiều"→{"t":"gọi cho vợ","d":"2026-03-06 17:00","a":"call","p":null,"u":null,"r":0,"q":null,"s":null}
          "báo thức 6 sáng"→{"t":"báo thức","d":"2026-03-06 06:00","a":"alarm","p":null,"u":null,"r":0,"q":null,"s":null}
          "nhắc tôi họp"→{"t":"họp","d":"2026-03-06 00:00","a":"notify","p":null,"u":null,"r":0,"q":"Bạn muốn nhắc lúc mấy giờ?","s":["8 giờ sáng","12 giờ trưa","3 giờ chiều","8 giờ tối"]}
          "3 giờ gọi khách hàng"→{"t":"gọi khách hàng","d":"2026-03-06 03:00","a":"call","p":null,"u":null,"r":0,"q":"Bạn muốn 3 giờ sáng hay 3 giờ chiều?","s":["3 giờ sáng","3 giờ chiều"]}
          "7 giờ tối mở facebook"→{"t":"mở facebook","d":"2026-03-06 19:00","a":"open_app","p":"facebook","u":"fb://","pkg":"com.facebook.katana","r":0,"q":null,"s":null}
          "8 giờ mở zalo"→{"t":"mở zalo","d":"2026-03-06 20:00","a":"open_app","p":"zalo","u":"zalo://","pkg":"com.zing.zalo","r":0,"q":null,"s":null}
          "7 giờ tối mở youtube nghe nhạc sơn tùng"→{"t":"mở youtube nghe nhạc sơn tùng","d":"2026-03-06 19:00","a":"open_app","p":"youtube","u":"https://www.youtube.com/results?search_query=nh%E1%BA%A1c+s%C6%A1n+t%C3%B9ng","pkg":"com.google.android.youtube","r":0,"q":null,"s":null}
          "9 giờ mở word"→{"t":"mở word","d":"2026-03-06 09:00","a":"open_app","p":"word","u":"ms-word://","pkg":"com.microsoft.office.word","r":0,"q":null,"s":null}
          "10 giờ mở canva"→{"t":"mở canva","d":"2026-03-06 10:00","a":"open_app","p":"canva","u":"canva://","pkg":"com.canva.editor","r":0,"q":null,"s":null}
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
