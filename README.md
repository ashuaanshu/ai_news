# AI News

A local-first news reader with a Next.js frontend and a Python/FastAPI backend
managed by [uv](https://docs.astral.sh/uv/). It collects configurable RSS/Atom
feeds, persists headlines in SQLite, and includes separate technology, stock,
and Indian market views with search and date filters. An optional Groq or local
OpenAI-compatible AI provider powers article summaries, news-aware chat, and
learning tools. Story cards offer summaries in English or Hinglish and a
browser-based text-to-speech button for listening to the story or its summary.

The **Notepad** tab stores multiple notes and a task list in the local SQLite
database. In **AI Chat**, say “Create note titled Briefing with content…” or
“Add task: review the market” to save them. General questions include current
headlines from the selected news view as context.

## Requirements

- Node.js 20 or newer
- [uv](https://docs.astral.sh/uv/)

## Configure

Copy `backend/.env.example` to `backend/.env`. The app works without an AI
provider; add a provider endpoint and key to enable AI features.

```powershell
Copy-Item backend\.env.example backend\.env
```

Never put API keys in frontend environment variables or commit `backend/.env`.

## Run locally on Windows

In one terminal:

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The backend API is at http://localhost:8000 and
its interactive API docs are at http://localhost:8000/docs.

## Run on Ubuntu

Install Node.js/npm and uv, then run from the project directory:

```bash
chmod +x run.sh
./run.sh
```

The script creates `backend/.env` from the example when needed, starts both
services, waits for readiness, and opens the dashboard when `xdg-open` is
available. Press Ctrl+C to stop both services.

## Storage and news feeds

SQLite is created automatically at `backend/data/news.db`. It stores fetched
news, notes, and tasks locally; the data directory is excluded from Git.

Technology news defaults to BBC Technology, The Guardian Technology,
TechCrunch, The Verge AI, and MIT Technology Review AI. Set `NEWS_FEEDS` in
`backend/.env` to a comma-separated list of RSS/Atom URLs to choose other
sources. Stock and market headlines use
`STOCK_NEWS_FEEDS`; its default is a MarketWatch market-pulse feed.
`INDIAN_STOCK_NEWS_FEEDS` defaults to a Google News RSS search focused on NSE,
BSE, Nifty, and Sensex. Search performs a live Google News RSS search localized
to India. Every news view can be filtered to today, yesterday, the last 7 days,
or all stored time. Stories with missing or unrecognized publication dates
appear only in the all-time view.

## AI provider settings

The example configuration uses Groq by default. Add your API key from
[Groq Console](https://console.groq.com/keys) to `AI_API_KEY` in `backend/.env`.
Settings:

| Variable | Purpose | Example |
| --- | --- | --- |
| `AI_BASE_URL` | OpenAI-compatible API base URL | `https://api.groq.com/openai/v1` |
| `AI_API_KEY` | Provider API key; blank for a local server that needs no key | |
| `AI_MODEL` | Model name accepted by the endpoint | `openai/gpt-oss-20b` |

For a local OpenAI-compatible server, set `AI_BASE_URL` to its local `/v1`
endpoint and `AI_MODEL` to a model it serves. Article summaries are requested
only when the user clicks **Summarize**. AI chat sends news context and
conversation messages to the configured provider; chat history stays in
browser memory for the current page session.

## Tests

```powershell
cd backend
uv run pytest
```

## Scope and privacy

The Automation tab is an explicit placeholder: it does not sign in to sites,
submit applications, or run background browser actions. Website credentials
are not collected or stored. Any future browser-session feature should use
short-lived, local-only session data (5–10 minutes), never persist passwords,
and require user review before external actions.
