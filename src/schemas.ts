import { z } from "zod";

// ===== ParsedTask interface =====
export interface ParsedTask {
  title: string;
  datetime_local: string;
  remind_before_minutes: number;
  repeat: "none" | "daily" | "weekly" | "weekdays";
  confidence: number;
  need_clarification: boolean;
  clarifying_question: string | null;
  action: "notify" | "alarm" | "open_app" | "call";
  app_name: string | null;
}

// ===== Full JSON schema (used for LLM output validation) =====
export const TaskSchema = z.object({
  title: z.string().min(1),
  datetime_local: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  remind_before_minutes: z.coerce.number().min(0).max(24 * 60),
  repeat: z.enum(["none", "daily", "weekly", "weekdays"]).catch("none"),
  confidence: z.coerce.number().min(0).max(1),
  need_clarification: z.boolean(),
  clarifying_question: z.string().nullable(),
  action: z.enum(["notify", "alarm", "open_app", "call"]).catch("notify"),
  app_name: z.string().nullable().catch(null),
});

export const ParsedSchema = z.object({
  tasks: z.array(TaskSchema).min(1),
});

// ===== Compact JSON schema (short keys for smaller LLM output) =====
export const CompactTaskSchema = z.object({
  t: z.string().min(1),                                       // title
  d: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),    // datetime_local
  a: z.enum(["notify", "alarm", "open_app", "call"]).catch("notify"), // action
  p: z.string().nullable().catch(null),                        // app_name
  r: z.coerce.number().min(0).max(1440).catch(0),             // remind_before_minutes
  q: z.string().nullable().catch(null),                        // clarifying_question
});

export const CompactSchema = z.object({
  tasks: z.array(CompactTaskSchema).min(1),
});
