// ===== Application configuration =====
// All values can be overridden via environment variables.

// --- LLM (OpenAI-compatible API: Groq, Together, OpenRouter, OpenAI, etc.) ---
// Groq:       LLM_URL=https://api.groq.com/openai/v1       LLM_MODEL=llama-3.1-8b-instant
// Together:   LLM_URL=https://api.together.xyz/v1           LLM_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
// OpenRouter: LLM_URL=https://openrouter.ai/api/v1          LLM_MODEL=meta-llama/llama-3.1-8b-instruct:free
// OpenAI:     LLM_URL=https://api.openai.com/v1             LLM_MODEL=gpt-4o-mini
export const LLM_URL = process.env.LLM_URL ?? "https://api.groq.com/openai/v1";
export const LLM_MODEL = process.env.LLM_MODEL ?? "llama-3.1-8b-instant";
export const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30_000);

// --- Server ---
export const PORT = Number(process.env.PORT ?? 3000);
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
export const MAX_INPUT_LENGTH = Number(process.env.MAX_INPUT_LENGTH ?? 500);

// --- Cache ---
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 5 * 60 * 1000);
export const CACHE_MAX_SIZE = Number(process.env.CACHE_MAX_SIZE ?? 1000);
export const CACHE_CLEANUP_INTERVAL_MS = 60_000;
