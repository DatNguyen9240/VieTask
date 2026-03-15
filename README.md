# NotificationApp

Vietnamese natural language → structured task/reminder API.

## Setup

```bash
bun install
cp .env.example .env    # edit .env to add your API key
bun run dev
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/parse` | POST | Parse text → tasks (JSON) |
| `/parse/stream` | POST | Parse text → tasks (SSE streaming) |

### POST `/parse`

```json
{
  "text": "8 giờ sáng báo thức",
  "nowLocal": "2026-03-15 10:00",
  "tz": "Asia/Ho_Chi_Minh"
}
```

## LLM Provider

Any OpenAI-compatible API works — just change 3 lines in `.env`:

```env
LLM_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.1-8b-instant
LLM_API_KEY=your_key
```

See `.env.example` for more providers (Together.ai, OpenRouter, OpenAI).

## Architecture

```
src/
├── index.ts           # Routes + server startup
├── config.ts          # Environment config
├── schemas.ts         # Zod validation schemas
├── llm/
│   ├── client.ts      # LLM API client + output parser
│   └── prompt.ts      # Prompt builder + token estimator
├── parser/
│   ├── preprocessor.ts    # Vietnamese text normalization
│   └── rule-parser.ts     # Fast rule-based parser (no LLM)
└── utils/
    ├── cache.ts           # In-memory cache with TTL
    └── json-utils.ts      # JSON extraction + repair
```

Dual-parser: tries **rule-based** first (instant), falls back to **LLM** for complex inputs.

## Tests

```bash
bun test src
```
