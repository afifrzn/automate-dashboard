# AGENTS.md — AI Agent Development Guide

Welcome, Agent. This repository is **Dashboard App**, a high-density, enterprise-grade course audit, lab grading, and automated test execution platform.

---

## 1. Core Principles & Philosophy

1. **Zero-Build Architecture**:
   - The frontend is pure Vanilla ES6 JavaScript, HTML5, and CSS (Metronic 9).
   - **DO NOT** introduce Node.js, `npm`, Vite, Webpack, Tailwind CLI, or frontend build pipelines. Static assets are served directly from `frontend/` by `backend/server.py`.
2. **Minimalist Backend Footprint**:
   - Built on Python 3 standard library (`http.server.ThreadingHTTPServer`, `sqlite3`, `json`, `re`, `urllib.parse`).
   - The **only** external runtime dependency is `paramiko` (for SSH lab VM execution).
   - **DO NOT** install heavy frameworks like Django, Flask, or FastAPI unless explicitly requested by the user.
3. **Cross-Platform Parity**:
   - The codebase runs identically on Windows (PowerShell) and Linux (bash).
   - Always use `os.path` or `pathlib.Path` for file paths; never hardcode Windows `\` or Linux `/`.

---

## 2. Directory Structure & Key Files

```
dashboard_app/
├── backend/
│   ├── server.py         # Multi-threaded HTTP server, REST API (/api/v1), SSE streaming, static delivery
│   ├── database.py       # SQLite connection factory, schema initialization, activity logging
│   ├── run_engine.py     # SSH VM execution via Paramiko, secret redaction, safety gates, validation matrix
│   ├── ai_agent.py       # Lab solver, MD instruction parsing, auto-synthesizer, AI fix flows
│   ├── lint_engine.py    # Grader Lint (GL01-GL16), Content Lint (CL01-CL16), Continuity (KL01-KL08)
│   ├── importer.py       # Idempotent course JSON/Zip import, patched JSON export
│   ├── reports.py        # Lab reports, Course Audit markdown, JUnit XML generation
│   └── seed_data.py      # Seed datasets for testing
├── frontend/
│   ├── index.html        # SPA shell with rock-solid Flexbox structure (.app-container, .app-sidebar, .app-main)
│   ├── app.js            # SPA controller, SSE live listener, modals, drawers, API fetchers
│   ├── style.css         # Custom layout & themes (dark/light mode), Metronic overrides
│   └── assets/           # Metronic 9 CSS bundles, KeenIcons, and fonts (zero build step)
├── tests/
│   ├── test_seed.py           # Acceptance test suite (GL rules, idempotency, redaction, verdicts)
│   ├── test_grade_slug.py     # Slug matching & grading parser tests
│   └── test_nusactl_parser.py # nusactl CLI output parser tests
├── data/                 # SQLite database storage (ignored by git: data/*.db)
├── run.py                # Single-command launcher (default: 0.0.0.0:8080)
├── requirements.txt      # Dependency manifest (paramiko)
├── LINUX_GUIDE.md        # Linux Antigravity standalone setup guide
└── README.md             # Project architecture document
```

---

## 3. Essential Commands

### Start Server
```bash
# Default (0.0.0.0:8080):
python run.py

# Custom Port & Host:
python run.py 8080 127.0.0.1
```

### Run All Unit Tests
```bash
python -m unittest discover tests
```
*Always ensure all 15 tests pass before committing code changes.*

### Run a Specific Test Module
```bash
python -m unittest tests/test_seed.py
python -m unittest tests/test_grade_slug.py
python -m unittest tests/test_nusactl_parser.py
```

---

## 4. Layout & UI Integrity Rules

### The "Flying Navbar" Rule
- The layout is strictly architected using a 2-column flexbox in `frontend/index.html`:
  - `.app-container` (Flex parent, `100vw`, `min-height: 100vh`)
  - `aside.app-sidebar` (`width: 250px`, `position: sticky; top: 0;`)
  - `div.app-main` (`flex: 1`, containing `header.app-navbar` and `main.app-content-body`)
- **NEVER** add Metronic's conflicting classes to `<body>` (e.g. `.demo1`, `.sidebar-fixed`, `.header-fixed`). They contain hardcoded `inset-inline-start: 280px` and fixed coordinate rules that cause the navbar to overlap the sidebar and float in mid-air.
- Always preserve `position: sticky; top: 0; background-color: var(--bg-secondary);` on `.app-navbar`.

### 4 Core Navigation Modules
The sidebar navigation has been streamlined to 4 primary modules:
1. `runs` — **Run Console**
2. `courses` — **Courses Explorer**
3. `vms` — **Test VMs & Credentials**
4. `reports` — **Reports & Exports**

Hidden or secondary panels (`overview`, `validation`, `crosscheck`, `findings`, `audit`, `manifest`, `quizzes`, `settings`) are retained in the DOM for compatibility and rendered as sub-views when triggered.

---

## 5. Backend & Database Rules

1. **Database Schema & Migrations**:
   - Database is SQLite (`data/dashboard.db`).
   - In `backend/database.py`, always use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
   - Never use raw string formatting for SQL queries; always use parameterized queries (`?`).
2. **Secret Redaction**:
   - Any execution output, command text, or log sent to the frontend or database must pass through `redact_text(text)` in `backend/run_engine.py`.
   - Never persist unredacted SSH keys, tokens, or plain-text passwords in activity logs.
3. **Safety Gates**:
   - State-changing commands (`start`, `solution`, `finish`) on modifiable targets require explicit gate approval (`run_engine.py`). State changes on immutable targets must be blocked.
4. **SSE Event Streaming**:
   - The server streams real-time test progress using Server-Sent Events on `/api/v1/runs/{run_id}/events`.
   - Format: `data: {JSON}\n\n`. Keep event payloads concise.

---

## 6. Git & Commit Guidelines

- **Never commit SQLite database files**: `data/*.db` and `data/*.sqlite3` must remain in `.gitignore`.
- **Commit message conventions**:
  - `feat: ...` for new capabilities or UI modules
  - `fix: ...` for bug fixes or layout adjustments
  - `docs: ...` for documentation updates
  - `test: ...` for unit or regression tests
- Always run `python -m unittest discover tests` to verify zero regressions before committing.
