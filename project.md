1. create ui in react or next
2. create backend in python ( use uv not pip)
3. for api create seprate file (.env)
4. 1 side tab for ai update or ai news (use rss or free api)
8. separate stock/market and Indian stock news tabs with configurable RSS feeds and searchable headlines
5. i will use Groq or local model
6. automation like if i give task new side new sidebar or new tab ai automation work like job serach or apply
7. after login in any website store data locally for 5-10 min

## Project structure

```text
frontend/                  Next.js UI
  app/                      Dashboard, navigation, and responsive styles
backend/                    Python API and business logic (managed with uv)
  .env.example              Optional AI provider and RSS feed settings
  pyproject.toml            Backend dependencies and pytest configuration
  app/
    main.py                 FastAPI news and AI summary endpoints
    database.py             Local SQLite news, notes, and tasks persistence
    pipeline.py             RSS/Atom collection and normalization
  tests/                    API and news pipeline tests
README.md                   Setup, run, and configuration instructions
run.sh                     Ubuntu launcher for backend and frontend
.gitignore                 Excludes secrets, environments, and build output
```

The working version fetches BBC, Guardian, TechCrunch, The Verge AI, and MIT
Technology Review AI RSS/Atom news by default, persists collected headlines,
notes, and tasks in a local SQLite
database, and optionally requests article summaries or news-aware chat replies
from Groq or a local OpenAI-compatible model.
Story summaries can be generated in English or Hinglish, and browser
text-to-speech lets users listen to stories or summaries.
It provides separate AI and stock news views with headline/source/description
search and today/yesterday/last-week/all-time filters, including an India
market feed focused on NSE, BSE, Nifty, and Sensex.
Chat commands can create notes and task-list entries.
Automation is a UI placeholder: website sign-in, job applications, and
temporary session storage are not enabled. Future external actions should
require user review, and any temporary session data must be local-only and
expire within 5–10 minutes; passwords must not be persisted.