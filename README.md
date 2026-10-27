# Dashboard App — Grading Test & Course Audit Working Surface

A full-stack, enterprise-grade web application built strictly to the specifications of **Dashboard App Baseline**, **Grading Test Agent Baseline**, and **Course Update Baseline**.

Designed for course authors, infrastructure operators, and review engineers to import, lint, test, validate, and audit technical course exports and automated graders.

---

## 1. System Architecture & Capabilities

### 1.1 Core Components
- **Web UI (SPA)**: Modern, responsive, information-dense single-page application with dark and light themes, monospace code inspectors, live Server-Sent Events (SSE) progress streams, and WCAG AA accessibility.
- **REST API Service**: Versioned under `/api/v1`, providing endpoints for course imports, grader linting, run configuration, live streaming, findings management, audit workspaces, and report generation.
- **Grader Lint Engine (GL01–GL16)**: Pure functions detecting grader defects before execution (syntax errors, malformed log commands, loose greps, mutating verbs, timeout risks, secret exposures, and case number anomalies).
- **Run Engine & Execution Modes**:
  - **Manual Mode**: SSH execution over bash using Paramiko (or simulated test runner for local environments), evaluating output against expected tokens and enforcing Section 10.3 verdict rules.
  - **Tool Mode**: Automated grading via `nusactl grade <slug>`.
  - **Cross-Check**: Side-by-side comparison between manual checks and tool results, flagging discrepancies as findings.
- **Safety Gate Engine**: Enforces operator approval for state-changing steps (`start`, `solution`, `finish`, and mutating commands) on modifiable targets. State changes on immutable targets are rejected.
- **Secret Redaction Engine**: Masks tokens, private keys, passwords, and bearer tokens across commands, stdout, stderr, logs, and exports.
- **Three-State Validation Matrix**: Validates grader accuracy across `unsolved` (all required cases FAIL), `solved` (all cases PASS), and `near-miss` (defect caught) states.
- **Course Audit Workspace & Content Studio**:
  - Closed status vocabulary with bilingual phrases (Indonesian `id` and English `en`).
  - Content Lint (CL01–CL16) enforcing plain technical style and avoiding marketing buzzwords.
  - Parity verification for parallel bilingual courses (CL14).
  - Verified-in-lab command output markers (CL15).
  - Continuity mapping (KL01–KL08) with Running Example objects.
  - Version Manifest with staleness tracking and impact search.
- **Reports & Exporters**:
  - Lab Report (Markdown in Grading Baseline Section 10 order).
  - Course Audit Document (Markdown in Course Baseline Section 6 order).
  - JUnit XML test suites for CI/CD pipelines.
  - Patched Course Export JSON with `changes.md` sidecar changelog.

---

## 2. Directory Structure

```
dashboard_app/
├── backend/
│   ├── database.py         # SQLite schema & persistence for all Sec 6 entities
│   ├── lint_engine.py      # Pure function engines: GL01-GL16, CL01-CL16, KL01-KL08, Impact Search
│   ├── run_engine.py       # SSH execution, Paramiko runner, Redaction, Gates, Validation logic
│   ├── importer.py         # Course export JSON importer (idempotent), Revisions & Patched exporter
│   ├── reports.py          # Lab reports, Audit documents, JUnit XML, JSON generator
│   ├── seed_data.py        # Section 17 Seed Test dataset (dok8s with all defect cases)
│   └── server.py           # Multi-threaded HTTP server with REST API, SSE streaming, static delivery
├── frontend/
│   ├── index.html          # Shell with header, role/language toggles, environment banner, 10 views
│   ├── app.js              # SPA controller, SSE listeners, modals, drawers, editors
│   └── style.css           # High-density CSS design system, dark/light theme, badges, code views
├── tests/
│   └── test_seed.py        # Automated acceptance test suite for Section 17 seed dataset
├── run.py                  # Single-command launcher
└── README.md               # Architecture documentation
```

---

## 3. Running the Application

### 3.1 Start the Server
From the project directory:
```powershell
python run.py
```
Or specify a custom port:
```powershell
python run.py 8080
```
Open your browser at: **`http://127.0.0.1:8080`**

### 3.2 Run the Acceptance Test Suite (Section 17 Seed Test)
To verify all Grader Lint rules, re-import idempotency, revision diffs, secret redaction, and verdict logic:
```powershell
python tests/test_seed.py
```

All 5 acceptance test suites pass:
1. `test_01_seed_dataset_grader_lint`: Detects all required seed defects (GL01, GL02, GL03, GL04, GL05, GL06, GL08, GL10).
2. `test_02_reimport_idempotency`: 0 added, 0 changed on identical re-import.
3. `test_03_revisions_and_patched_export`: Proposes revision with diff, exports patched JSON without mutating source.
4. `test_04_secret_redaction`: Masks passwords, tokens, and private keys.
5. `test_05_verdict_rules`: Enforces clean PASS, clean FAIL, and contract/exit ERROR conditions.

---

## 4. Primary Views & Navigation

| View | Purpose |
|---|---|
| **Overview** | High-level metrics for the selected course: readiness counts, open findings by priority, validation coverage, manifest freshness, latest execution table. |
| **Courses Explorer** | Tree view of course chapters, parts, and labs with lint badges, validation indicators, case drawer, and definition-of-done checklists. Features 1-click **✨ AI Fix Grading** and **🚀 AI Update Course & Modules**. |
| **Test VMs & Credentials** | Dedicated management page for target lab virtual machines: configure IP Host, SSH port, SSH username & password, plus **nusactl credentials** (username & password) with live SSH connection testing. |
| **Run Console** | Launch manual SSH or tool runs, configure target environments, supply variables, and watch live results stream over Server-Sent Events (SSE). |
| **Validation Matrix** | Visual matrix of labs across `unsolved`, `solved`, and `near-miss` states with automated violation detection. |
| **Cross-Check** | Side-by-side comparison of manual SSH checks vs `nusactl grade`, with 1-click finding promotion for disagreements. |
| **Findings Board** | Kanban and list views of open, confirmed, and fixed defects with priority tags (`critical`, `high`, `medium`, `optional`). |
| **Course Audit** | Module review workspace utilizing closed status vocabulary, keep/update/suggested material blocks, and verified source registry. |
| **Version Manifest** | Cohort single source of truth for component versions with staleness warnings and impact search across the entire course. |
| **Quiz Review** | Flag assistant identifying questions with absolute rules or outdated defaults, plus correction logs. |
| **Reports & Exports** | Download Lab Reports (Markdown), Course Audit Documents (ID/EN Markdown), JUnit XML for CI, and Patched Course Export JSON. |
| **Settings & RBAC** | System settings, secret references, role switching (`Viewer`, `Author`, `Operator`, `Admin`), and immutable activity logs. |

---

## 5. Traceability to Baselines

Every capability directly traces to the baseline specifications:
- **Grading Baseline Section 5, 6, 8, 10, 12**: Export format preservation, Verdict calculations, Debug logs, Lab reports, and Definition of Done.
- **Course Baseline Section 4, 5, 6, 7, 10, 11, 14**: Currency rules, Version manifest, Plain-language rules, Content lint, Continuity map, and Output honesty.
- **Dashboard Baseline Section 6, 7, 8, 9, 10, 17**: Data model, 10 primary navigation views, functional requirements, and Section 17 seed acceptance test.
