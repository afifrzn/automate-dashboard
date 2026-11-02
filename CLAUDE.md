# CLAUDE.md — Claude Code Developer Guidelines

This document provides essential commands, conventions, architecture guidelines, and operational patterns for Claude Code working on the **Dashboard App** repository.

---

## 1. Project Overview

- **Name**: Dashboard App — Grading Test & Course Audit Platform
- **Purpose**: Import, lint, execute, and validate technical course labs, grading test cases, and lab VM targets.
- **Tech Stack**:
  - **Backend**: Python 3 (standard library `http.server.ThreadingHTTPServer` + `sqlite3` + `paramiko`). No web frameworks (no Django/Flask/FastAPI).
  - **Frontend**: Vanilla ES6 JavaScript, HTML5, CSS3, Metronic 9 UI assets. No Node.js, npm, or build tools.
  - **Database**: Local SQLite (`data/dashboard.db`).
  - **Execution**: Paramiko SSH client for remote lab execution, local bash test runners, and `nusactl` CLI wrappers.

---

## 2. Common Commands

### Running the Application
```bash
# Start server with default host (0.0.0.0) and port (8080)
python run.py

# Custom port and host
python run.py 9000 127.0.0.1
```
Web interface available at: `http://127.0.0.1:8080` (or `http://<ip>:8080`).

### Running Tests
```bash
# Run entire test suite (15 tests)
python -m unittest discover tests

# Run individual test files
python -m unittest tests/test_seed.py
python -m unittest tests/test_grade_slug.py
python -m unittest tests/test_nusactl_parser.py
```

### Dependencies
```bash
# Install required runtime dependencies
pip install -r requirements.txt
```

---

## 3. Architecture & File Structure

```
├── backend/
│   ├── server.py         # Threading HTTPServer, static routing, REST API (/api/v1), SSE streaming
│   ├── database.py       # SQLite connection, schema definition (17 tables), seed insertion
│   ├── run_engine.py     # SSH VM runner, secret redaction, safety gates, validation matrix
│   ├── ai_agent.py       # Autonomous lab solver, markdown instruction parser, case synthesizer
│   ├── lint_engine.py    # GL01-GL16 (Grader Lint), CL01-CL16 (Content Lint), KL01-KL08 (Continuity)
│   ├── importer.py       # Idempotent course export JSON & zip importer, revision exporter
│   ├── reports.py        # Lab reports, Course Audit markdown, JUnit XML generator
│   └── seed_data.py      # Seed datasets for testing
├── frontend/
│   ├── index.html        # App structure: .app-container > aside.app-sidebar + div.app-main
│   ├── app.js            # SPA logic, SSE event listeners, dynamic views, API interaction
│   ├── style.css         # Metronic 9 overrides, dark/light theme, layout positioning
│   └── assets/           # Metronic 9 CSS bundles, KeenIcons, web fonts
├── tests/                # Unittest test cases
├── data/                 # SQLite storage (dashboard.db, git-ignored)
├── requirements.txt      # Python dependencies (paramiko)
├── run.py                # Application entrypoint
├── AGENTS.md             # AI coding agent instructions
├── LINUX_GUIDE.md        # Linux Antigravity setup & deployment guide
└── README.md             # System architecture documentation
```

---

## 4. Code Style & Conventions

### Python (Backend)
- **Standard Library First**: Prefer Python's built-in libraries (`json`, `re`, `pathlib`, `uuid`, `urllib.parse`) over external packages.
- **Cross-Platform Paths**: Always use `os.path` or `pathlib.Path`. Never hardcode OS-specific directory separators.
- **Database Access**: Always use `backend.database.get_connection()`. Always use parameterized queries (`?`) to prevent SQL injection.
- **Secret Redaction**: Always run command outputs and logs through `redact_text()` in `backend/run_engine.py` before storing or streaming.
- **Error Handling**: Use explicit try/except blocks and log failures via `log_activity()`.

### JavaScript & Frontend
- **Zero-Build Rule**: Write standard ES6+ JavaScript directly in `frontend/app.js`. Do not add JSX, TypeScript, npm packages, or bundlers.
- **State Management**: Maintain shared application state in the global `appState` object in `frontend/app.js`.
- **API Calls**: Use the standard `fetch()` API targeting `API_BASE` (`/api/v1`).
- **DOM Updates**: Use event delegation and template literals for rendering dynamic components.

### CSS & Layout
- **Layout Architecture**: Maintain the solid Flexbox structure (`.app-container`, `.app-sidebar`, `.app-main`, `.app-navbar`, `.app-content-body`).
- **Do Not Reintroduce Floating Header**: Never add `.demo1`, `.sidebar-fixed`, or `.header-fixed` classes to `<body>`.
- **Theming**: Use CSS custom properties defined on `:root` and `[data-theme="dark"]` (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--border-color`, etc.).

---

## 5. Development Workflow

1. **Before Making Changes**:
   - Run existing tests to verify baseline: `python -m unittest discover tests`.
2. **When Adding Features**:
   - For new API endpoints: implement in `backend/server.py`, add necessary DB queries in `backend/database.py`, and expose in `frontend/app.js`.
   - For UI changes: edit `frontend/index.html` or `frontend/app.js` and style with CSS variables in `frontend/style.css`.
3. **Verification**:
   - Run `python -m unittest discover tests`.
   - Start the server (`python run.py`) and test endpoints or UI views in the browser.
4. **Git Commits**:
   - Commit logical, well-tested changes with conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`).
   - Ensure `data/*.db` is not staged.
