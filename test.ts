const BASE = "http://localhost:3000";

const tests = [
  { label: "1. tan lam + gio cu the (rule-based)", text: "nh\u1eafc u\u1ed1ng thu\u1ed1c 30 ph\u00fat sau khi \u0103n s\u00e1ng kho\u1ea3ng 7 r\u01b0\u1ee1i r\u1ed3i tan l\u00e0m nh\u1eafc g\u1ecdi cho v\u1ee3", now: "2026-03-06 09:00" },
  { label: "2. bao thuc + truoc do (rule-based)", text: "8 gi\u1edd s\u00e1ng b\u00e1o th\u1ee9c, 8 r\u01b0\u1ee1i nh\u1eafc pha c\u00e0 ph\u00ea, tr\u01b0\u1edbc \u0111\u00f3 15 ph\u00fat nh\u1eafc chu\u1ea9n b\u1ecb", now: "2026-03-06 07:00" },
  { label: "3. sang mai nhieu task + tan lam (rule-based)", text: "s\u00e1ng mai 6 gi\u1edd b\u00e1o th\u1ee9c r\u1ed3i 7 gi\u1edd nh\u1eafc pha c\u00e0 ph\u00ea r\u1ed3i 8 gi\u1edd h\u1ecdp v\u1edbi team sau \u0111\u00f3 tan l\u00e0m nh\u1eafc g\u1ecdi cho v\u1ee3", now: "2026-03-06 07:00" },
  { label: "4. buoi chieu khong gio (LLM)", text: "nh\u1eafc t\u00f4i g\u1ecdi kh\u00e1ch h\u00e0ng v\u00e0o bu\u1ed5i chi\u1ec1u", now: "2026-03-06 09:00" },
  { label: "5. mo app Spotify (rule-based)", text: "7 gi\u1edd t\u1ed1i m\u1edf app Spotify", now: "2026-03-06 09:00" },
  { label: "6. cau dai nguoi that (rule-based now)", text: "h\u00f4m nay anh b\u1eadn l\u1eafm nh\u1eafc anh kho\u1ea3ng bu\u1ed5i s\u00e1ng g\u1ecdi cho kh\u00e1ch \u0110\u1ee9c r\u1ed3i bu\u1ed5i tr\u01b0a nh\u1eafc \u0103n thu\u1ed1c huy\u1ebft \u00e1p xong xu\u00f4i r\u1ed3i nh\u1eafc chu\u1ea9n b\u1ecb \u0111i h\u1ed9i ngh\u1ecb v\u1edbi v\u1ee3 l\u00fac 3 r\u01b0\u1ee1i chi\u1ec1u r\u1ed3i t\u1ed1i nh\u1eafc b\u1eadt Netflix xem phim", now: "2026-03-06 07:00" },
  { label: "7. thu Hai tuan sau (rule-based)", text: "nh\u1eafc t\u00f4i th\u1ee9 Hai tu\u1ea7n sau g\u1ecdi cho s\u1ebfp", now: "2026-03-07 09:00" },
  { label: "8. ngay kia co gio (rule-based)", text: "ng\u00e0y kia l\u00fac 3 gi\u1edd chi\u1ec1u nh\u1eafc n\u1ed9p b\u00e1o c\u00e1o", now: "2026-03-07 09:00" },
  { label: "9. ngay DD thang MM (rule-based)", text: "ng\u00e0y 15 th\u00e1ng 3 nh\u1eafc sinh nh\u1eadt v\u1ee3 l\u00fac 8 gi\u1edd s\u00e1ng", now: "2026-03-07 09:00" },
];

for (const t of tests) {
  try {
    const res = await fetch(`${BASE}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t.text, nowLocal: t.now, tz: "Asia/Ho_Chi_Minh" }),
    });
    const json = await res.json() as any;
    console.log(`\n=== ${t.label} ===`);
    for (const task of json.tasks ?? []) {
      const q = task.clarifying_question ? ` | q: ${task.clarifying_question}` : "";
      console.log(`  [${task.action}] "${task.title}" @ ${task.datetime_local} clarify=${task.need_clarification}${q}`);
    }
    if (json.error) console.log(`  ERROR: ${json.error} | raw: ${json.raw?.slice(0, 100)}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`\n=== ${t.label} === FETCH ERROR: ${msg}`);
  }
}
