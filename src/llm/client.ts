/**
 * LLM client — OpenAI-compatible API (Groq, Together, OpenRouter, OpenAI, etc.)
 *
 * Just set LLM_URL, LLM_MODEL, LLM_API_KEY in .env to switch providers.
 */

import { LLM_URL, LLM_MODEL, LLM_API_KEY, LLM_TIMEOUT_MS } from "../config.js";
import { ParsedSchema, CompactSchema, CompactTaskSchema, TaskSchema } from "../schemas.js";
import { extractJson, repairJson } from "../utils/json-utils.js";
import type { ParsedTask } from "../schemas.js";

// ===== Generate =====

/**
 * Call OpenAI-compatible chat completions API (non-streaming).
 * Used by the /parse endpoint for simple request-response.
 */
export async function llmGenerate(prompt: string, maxTokens: number, timeoutMs = LLM_TIMEOUT_MS): Promise<string> {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LLM_API_KEY}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 0,
      max_tokens: maxTokens,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${msg}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// ===== Parse output =====

/**
 * Parse raw LLM output into structured tasks.
 * Handles compact format, full format, single objects, code fences, and prefix forcing.
 */
export function parseLLMOutput(raw: string): { tasks: ParsedTask[] } | null {
  const stripped = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const candidate = stripped.startsWith("{") ? stripped : `{"tasks":[${stripped}`;
  const repaired = repairJson(candidate);
  const obj = extractJson(repaired);

  // Try as {tasks:[...]} wrapper — compact format
  const compact = CompactSchema.safeParse(obj);
  if (compact.success) {
    return {
      tasks: compact.data.tasks.map(ct => ({
        title: ct.t,
        datetime_local: ct.d,
        remind_before_minutes: ct.r,
        repeat: "none" as const,
        confidence: ct.q ? 0.5 : 0.95,
        need_clarification: !!ct.q,
        clarifying_question: ct.q,
        suggestions: ct.s,
        action: ct.a,
        app_name: ct.p,
        action_url: ct.u,
        android_package: ct.pkg,
      })),
    };
  }

  // Try as {tasks:[...]} wrapper — full format
  const full = ParsedSchema.safeParse(obj);
  if (full.success) return full.data;

  // Try as single compact task object
  const singleCompact = CompactTaskSchema.safeParse(obj);
  if (singleCompact.success) {
    const ct = singleCompact.data;
    return {
      tasks: [{
        title: ct.t,
        datetime_local: ct.d,
        remind_before_minutes: ct.r,
        repeat: "none" as const,
        confidence: ct.q ? 0.5 : 0.95,
        need_clarification: !!ct.q,
        clarifying_question: ct.q,
        suggestions: ct.s,
        action: ct.a,
        app_name: ct.p,
        action_url: ct.u,
        android_package: ct.pkg,
      }],
    };
  }

  // Try as single full task object
  const singleFull = TaskSchema.safeParse(obj);
  if (singleFull.success) return { tasks: [singleFull.data] };

  return null;
}
