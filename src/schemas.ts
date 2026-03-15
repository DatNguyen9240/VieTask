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
  action_label?: string;
  action_icon?: string;
  action_url?: string | null;
  app_name: string | null;
}

// ===== Action display info =====
const ACTION_INFO: Record<string, { label: string; icon: string }> = {
  notify:   { label: "Nhắc nhở", icon: "🔔" },
  alarm:    { label: "Báo thức", icon: "⏰" },
  open_app: { label: "Mở app",  icon: "📱" },
  call:     { label: "Gọi điện", icon: "📞" },
};

/** Enrich tasks with action_label, action_icon, and action_url fallback */
export function enrichTasks(result: { tasks: ParsedTask[] }): { tasks: ParsedTask[] } {
  return {
    tasks: result.tasks.map(t => ({
      ...t,
      action_label: ACTION_INFO[t.action]?.label ?? t.action,
      action_icon: ACTION_INFO[t.action]?.icon ?? "🔔",
      // If LLM didn't return a URL, generate fallback for open_app
      action_url: t.action_url ?? (t.action === 'open_app' && t.app_name
        ? `https://www.${t.app_name.toLowerCase().replace(/\s+/g, '')}.com`
        : null),
    })),
  };
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
  u: z.string().nullable().catch(null),                        // action_url
  r: z.coerce.number().min(0).max(1440).catch(0),             // remind_before_minutes
  q: z.string().nullable().catch(null),                        // clarifying_question
});

export const CompactSchema = z.object({
  tasks: z.array(CompactTaskSchema).min(1),
});
