/**
 * NotificationApp — API server entry point.
 *
 * Routes:
 *  GET  /health        → health check
 *  POST /parse         → parse Vietnamese text into structured tasks
 *  POST /parse/stream  → same as /parse but with SSE streaming
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";

import { PORT, CORS_ORIGIN, LLM_TIMEOUT_MS, LLM_URL, LLM_MODEL, LLM_API_KEY, MAX_INPUT_LENGTH } from "./config.js";
import { enrichTasks } from "./schemas.js";
import { preprocessText } from "./parser/preprocessor.js";
import { tryRuleBased } from "./parser/rule-parser.js";
import { buildPrompt, calcNumPredict } from "./llm/prompt.js";
import { llmGenerate, parseLLMOutput } from "./llm/client.js";
import { cacheGet, cacheSet } from "./utils/cache.js";

export const app = new Hono();

// CORS
app.use("/*", cors({ origin: CORS_ORIGIN }));

// ===== Routes =====

app.get("/health", (c) => c.json({ ok: true }));

app.post("/parse", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const nowLocal = String(body.nowLocal ?? "").trim();
  const tz = String(body.tz ?? "Asia/Ho_Chi_Minh");

  if (!text) return c.json({ error: "Missing text" }, 400);
  if (text.length > MAX_INPUT_LENGTH) {
    return c.json({ error: `Text too long (max ${MAX_INPUT_LENGTH} chars)` }, 400);
  }

  const nowHint = nowLocal || new Date().toLocaleString("sv-SE", { timeZone: tz }).slice(0, 16).replace("T", " ");
  const processed = preprocessText(text);
  const dayKey = (nowHint.match(/^\d{4}-\d{2}-\d{2}/)?.[0]) ?? "unknown";
  const normText = text.toLowerCase().replace(/\s+/g, " ");
  const cacheKey = `${normText}|${dayKey}|${tz}`;

  // Check cache
  const cached = cacheGet(cacheKey);
  if (cached) return c.json(cached);

  // Fast path: rule-based parser
  const ruleResult = tryRuleBased(processed, nowHint);
  if (ruleResult) {
    const enriched = enrichTasks(ruleResult);
    cacheSet(cacheKey, enriched);
    return c.json(enriched);
  }

  // LLM path
  const prompt = buildPrompt(processed, nowHint, tz);
  const numPredict = calcNumPredict(text);

  try {
    let raw = await llmGenerate(prompt, numPredict);
    console.log("[LLM raw]", raw.slice(0, 300));
    let result = parseLLMOutput(raw);

    // Retry once with more tokens if parse fails
    if (!result) {
      console.log("[LLM parse fail - retrying]");
      raw = await llmGenerate(prompt, Math.min(numPredict * 2, 400), Math.min(LLM_TIMEOUT_MS * 1.5, 60_000));
      console.log("[LLM retry raw]", raw.slice(0, 300));
      result = parseLLMOutput(raw);
    }

    if (!result) return c.json({ error: "Invalid response from LLM", raw }, 502);

    const enriched = enrichTasks(result);
    cacheSet(cacheKey, enriched);
    return c.json(enriched);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.name === "AbortError" ? "LLM timeout" : err.message;
    return c.json({ error: msg }, 500);
  }
});

// SSE streaming endpoint
// Events: status → token → progress → result | error
app.post("/parse/stream", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const nowLocal = String(body.nowLocal ?? "").trim();
  const tz = String(body.tz ?? "Asia/Ho_Chi_Minh");

  if (!text) return c.json({ error: "Missing text" }, 400);
  if (text.length > MAX_INPUT_LENGTH) {
    return c.json({ error: `Text too long (max ${MAX_INPUT_LENGTH} chars)` }, 400);
  }

  const nowHint = nowLocal || new Date().toLocaleString("sv-SE", { timeZone: tz }).slice(0, 16).replace("T", " ");
  const processed = preprocessText(text);
  const dayKey = (nowHint.match(/^\d{4}-\d{2}-\d{2}/)?.[0]) ?? "unknown";
  const normText = text.toLowerCase().replace(/\s+/g, " ");
  const cacheKey = `${normText}|${dayKey}|${tz}`;

  // Check cache
  const cached = cacheGet(cacheKey);
  if (cached) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: "status", data: "cached" });
      await stream.writeSSE({ event: "result", data: JSON.stringify(cached) });
    });
  }

  // Fast path: rule-based
  const ruleResult = tryRuleBased(processed, nowHint);
  if (ruleResult) {
    cacheSet(cacheKey, ruleResult);
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: "status", data: "rule-based" });
      await stream.writeSSE({ event: "result", data: JSON.stringify(enrichTasks(ruleResult)) });
    });
  }

  // LLM streaming
  const prompt = buildPrompt(processed, nowHint, tz);
  const numPredict = calcNumPredict(text);

  return streamSSE(c, async (stream) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    const startTime = Date.now();

    try {
      await stream.writeSSE({ event: "status", data: "connecting" });

      const res = await fetch(`${LLM_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LLM_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: true,
          temperature: 0,
          max_tokens: numPredict,
          top_p: 0.9,
        }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        await stream.writeSSE({ event: "error", data: msg || `LLM error ${res.status}` });
        return;
      }

      await stream.writeSSE({ event: "status", data: "generating" });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      let lineBuffer = "";
      let earlyStop = false;
      let tokenCount = 0;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") { earlyStop = true; break; }

            try {
              const obj = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string }> };
              const token = obj.choices?.[0]?.delta?.content;
              if (token) {
                raw += token;
                tokenCount++;
                await stream.writeSSE({ event: "token", data: token });

                if (tokenCount % 5 === 0) {
                  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                  await stream.writeSSE({ event: "progress", data: JSON.stringify({ tokens: tokenCount, elapsed_s: elapsed }) });
                }

                if (parseLLMOutput(raw) !== null) { earlyStop = true; break; }
              }
              if (obj.choices?.[0]?.finish_reason) { earlyStop = true; break; }
            } catch { continue; }
          }
          if (earlyStop) break;
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      // Final result
      await stream.writeSSE({ event: "status", data: "parsing" });
      const result = parseLLMOutput(raw);
      if (result) {
        const enriched = enrichTasks(result);
        cacheSet(cacheKey, enriched);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        await stream.writeSSE({
          event: "result",
          data: JSON.stringify({ ...enriched, _meta: { tokens: tokenCount, elapsed_s: elapsed, early_stop: earlyStop } }),
        });
      } else {
        await stream.writeSSE({ event: "error", data: "Invalid response from LLM" });
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const msg = err.name === "AbortError" ? "LLM timeout" : err.message;
      await stream.writeSSE({ event: "error", data: msg });
    } finally {
      clearTimeout(timer);
    }
  });
});

// ===== Server startup =====
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port: PORT });
  console.log(`BE running on http://localhost:${PORT}`);
  console.log(`LLM: ${LLM_URL} model=${LLM_MODEL}`);
}