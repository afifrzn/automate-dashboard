"""
Database layer for Dashboard App Baseline.
Provides SQLite persistence, schema migrations, and helper methods
for all entities defined in Section 6.
"""

import sqlite3
import json
import os
import uuid
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "dashboard.db")

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    # 6.1 Course structure
    c.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        default_language TEXT DEFAULT 'id',
        created_at TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY(course_id) REFERENCES courses(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS submodules (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY(module_id) REFERENCES modules(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS labs (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        export_id TEXT UNIQUE NOT NULL,
        chapter TEXT NOT NULL,
        part TEXT NOT NULL,
        description TEXT NOT NULL,
        vars_json TEXT DEFAULT '{}',
        start_json TEXT DEFAULT '[]',
        finish_json TEXT DEFAULT '[]',
        slug TEXT,
        modifiable_ok INTEGER DEFAULT 0,
        FOREIGN KEY(course_id) REFERENCES courses(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS grade_cases (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL,
        case_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        cmd TEXT NOT NULL,
        expect TEXT NOT NULL,
        hint TEXT,
        debug TEXT,
        log_cmd TEXT,
        FOREIGN KEY(lab_id) REFERENCES labs(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS case_overlays (
        case_id TEXT PRIMARY KEY,
        timeout_sec INTEGER DEFAULT 30,
        poll_interval_sec INTEGER DEFAULT 0,
        poll_max_sec INTEGER DEFAULT 0,
        severity TEXT DEFAULT 'required',
        points INTEGER DEFAULT 1,
        depends_on TEXT,
        FOREIGN KEY(case_id) REFERENCES grade_cases(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        diff_json TEXT NOT NULL,
        status TEXT DEFAULT 'proposed',
        notes TEXT
    )""")

    # 6.2 Targets and runs
    c.execute("""
    CREATE TABLE IF NOT EXISTS targets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER DEFAULT 22,
        user TEXT NOT NULL,
        password TEXT,
        auth_ref TEXT,
        nusactl_username TEXT,
        nusactl_password TEXT,
        host_key_fingerprint TEXT,
        jump_host_json TEXT,
        modifiable INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        nusactl_path TEXT DEFAULT 'nusactl',
        default_vars_json TEXT DEFAULT '{}',
        notes TEXT
    )""")

    # Dynamic migrations for targets table columns if table existed prior
    existing_cols = [row[1] for row in c.execute("PRAGMA table_info(targets)").fetchall()]
    if "password" not in existing_cols:
        c.execute("ALTER TABLE targets ADD COLUMN password TEXT")
    if "nusactl_username" not in existing_cols:
        c.execute("ALTER TABLE targets ADD COLUMN nusactl_username TEXT")
    if "nusactl_password" not in existing_cols:
        c.execute("ALTER TABLE targets ADD COLUMN nusactl_password TEXT")
    if "is_active" not in existing_cols:
        c.execute("ALTER TABLE targets ADD COLUMN is_active INTEGER DEFAULT 1")

    c.execute("""
    CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        course TEXT NOT NULL,
        chapter TEXT NOT NULL,
        part TEXT NOT NULL,
        lab_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        state TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        scenario TEXT,
        vars_used_json TEXT DEFAULT '{}',
        lab_verdict TEXT,
        score_passed INTEGER DEFAULT 0,
        score_total INTEGER DEFAULT 0,
        validation TEXT,
        unparsed INTEGER DEFAULT 0,
        raw_output TEXT,
        FOREIGN KEY(lab_id) REFERENCES labs(id),
        FOREIGN KEY(target_id) REFERENCES targets(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        case_id TEXT,
        command_hash TEXT,
        started_at TEXT,
        ended_at TEXT,
        status TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS case_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        expect TEXT NOT NULL,
        actual TEXT NOT NULL,
        verdict TEXT NOT NULL,
        cmd_exit_code INTEGER,
        stdout TEXT,
        stderr TEXT,
        duration_ms INTEGER,
        truncated INTEGER DEFAULT 0,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS debug_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_index INTEGER NOT NULL,
        log_cmd_output TEXT,
        log_cmd_exit_code INTEGER,
        log_cmd_status TEXT,
        diagnosis TEXT,
        likely_cause TEXT,
        suggested_fix TEXT,
        edited_by TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS gates (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        commands_json TEXT NOT NULL,
        impact_notes TEXT,
        status TEXT DEFAULT 'pending',
        decided_by TEXT,
        decided_at TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS cross_checks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_index INTEGER NOT NULL,
        manual_verdict TEXT,
        tool_verdict TEXT,
        agree INTEGER NOT NULL,
        note TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(run_id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS validation_cells (
        lab_id TEXT NOT NULL,
        state TEXT NOT NULL,
        latest_run_id TEXT,
        result TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY(lab_id, state),
        FOREIGN KEY(lab_id) REFERENCES labs(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS near_miss_scenarios (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        commands_json TEXT NOT NULL,
        FOREIGN KEY(lab_id) REFERENCES labs(id)
    )""")

    # 6.3 Findings and tasks
    c.execute("""
    CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        evidence TEXT,
        confirmed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'open',
        owner_id TEXT,
        source_baseline_ref TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS lint_issues (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        suggestion TEXT,
        suspect INTEGER DEFAULT 1,
        waiver_json TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS waivers (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        by_user TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
    )""")

    # 6.4 Course update data
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_entries (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        language TEXT NOT NULL,
        status_key TEXT NOT NULL,
        keep_text TEXT,
        update_text TEXT,
        suggested_material TEXT,
        findings_text TEXT,
        main_changes TEXT,
        suggested_grading TEXT,
        source_codes_json TEXT DEFAULT '[]',
        needs_verification INTEGER DEFAULT 0,
        review_state TEXT DEFAULT 'proposed',
        provenance_json TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS sources (
        code TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        accessed_on TEXT NOT NULL,
        link_status TEXT DEFAULT 'ok',
        last_checked_at TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS manifest_rows (
        id TEXT PRIMARY KEY,
        component TEXT NOT NULL,
        course_baseline TEXT NOT NULL,
        verified_stable TEXT NOT NULL,
        channel TEXT DEFAULT 'stable',
        edition TEXT,
        arch TEXT,
        checksum_or_package TEXT,
        decision TEXT,
        check_date TEXT NOT NULL,
        source_code TEXT,
        status TEXT DEFAULT 'verified',
        notes TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS content_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        module_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY(module_id) REFERENCES modules(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS content_versions (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        language TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        state TEXT DEFAULT 'draft',
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        provenance_json TEXT,
        outputs_verified INTEGER DEFAULT 0,
        parity_ok INTEGER
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS glossary_terms (
        id TEXT PRIMARY KEY,
        module_id TEXT,
        term TEXT NOT NULL,
        definition_id TEXT,
        definition_en TEXT,
        keep_english INTEGER DEFAULT 1,
        banned_variants_json TEXT DEFAULT '[]'
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS continuity_rows (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        content_id TEXT NOT NULL,
        concepts_defined TEXT,
        commands_introduced TEXT,
        example_objects TEXT,
        prerequisite_ids TEXT,
        continued_by_ids TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS running_examples (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        objects_json TEXT NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS quiz_corrections (
        id TEXT PRIMARY KEY,
        quiz_ref TEXT NOT NULL,
        question_id TEXT NOT NULL,
        problem TEXT NOT NULL,
        update_text TEXT NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS environment_baselines (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        nodes TEXT,
        sizing_note TEXT,
        network_text TEXT,
        os_choice TEXT,
        os_lifecycle_source TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id)
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS priority_items (
        id TEXT PRIMARY KEY,
        priority TEXT NOT NULL,
        change_text TEXT NOT NULL,
        linked_finding_id TEXT,
        linked_audit_id TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_value TEXT,
        after_value TEXT
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL
    )""")

    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )""")

    # Populate default users and settings if empty
    c.execute("SELECT count(*) FROM users")
    if c.fetchone()[0] == 0:
        default_users = [
            ("u_admin", "admin", "Admin", "System Administrator"),
            ("u_operator", "operator", "Operator", "Lab Operator"),
            ("u_author", "author", "Author", "Course Author"),
            ("u_viewer", "viewer", "Viewer", "Read-only Reviewer")
        ]
        c.executemany("INSERT INTO users (id, username, role, name) VALUES (?, ?, ?, ?)", default_users)

    c.execute("SELECT count(*) FROM settings")
    if c.fetchone()[0] == 0:
        default_settings = [
            ("default_ui_language", "en"),
            ("default_content_language", "id"),
            ("staleness_days", "90"),
            ("log_retention_days", "90"),
            ("sentence_length_limit", "30"),
            ("allowed_address_words", "false")
        ]
        c.executemany("INSERT INTO settings (key, value) VALUES (?, ?)", default_settings)

    conn.commit()
    conn.close()

def log_activity(user_id, action, entity_type, entity_id, before_val=None, after_val=None):
    conn = get_connection()
    c = conn.cursor()
    log_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    c.execute("""
        INSERT INTO activity_logs (id, user_id, created_at, action, entity_type, entity_id, before_value, after_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        log_id,
        user_id or "system",
        now,
        action,
        entity_type,
        entity_id,
        json.dumps(before_val) if isinstance(before_val, (dict, list)) else (str(before_val) if before_val is not None else None),
        json.dumps(after_val) if isinstance(after_val, (dict, list)) else (str(after_val) if after_val is not None else None)
    ))
    conn.commit()
    conn.close()
