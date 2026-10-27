"""
Fast, robust HTTP & REST API server using Python standard library.
Provides REST endpoints (/api/v1/...), SSE streaming (/api/v1/runs/{id}/events),
static file serving for the SPA frontend, and RBAC enforcement.
"""

import os
import json
import uuid
import queue
import threading
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.parse

from .database import get_connection, log_activity, init_db
from .importer import import_course_export, export_patched_course, import_course_zip_and_grading
from .lint_engine import (
    lint_lab, lint_content_markdown, check_content_parity,
    check_continuity, search_impact
)
from .run_engine import run_lab, test_target_connection
from .reports import (
    generate_lab_report_markdown, generate_audit_document_markdown,
    generate_junit_xml
)
from .seed_data import load_seed_data
from .ai_agent import run_grading_remediation_agent, run_course_update_agent, resolve_lab_markdown, extract_instructions_from_lab_md, resolve_nusactl_grade_slug, synthesize_cases_from_lab_md

# Global event queues for SSE per run_id
RUN_EVENT_QUEUES = {}
RUN_QUEUES_LOCK = threading.Lock()

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

class AppRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean logging
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Role")
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, status=200, content_type="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Role, X-User-Id")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # SSE Endpoint for live run progress
        if path.startswith("/api/v1/runs/") and path.endswith("/events"):
            run_id = path.split("/")[4]
            self.handle_sse_events(run_id)
            return

        # REST API Routes
        if path.startswith("/api/v1/"):
            self.handle_api_get(path, query)
            return

        # Static file delivery
        self.handle_static_get(path)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        user_id = self.headers.get("X-User-Id", "author")
        user_role = self.headers.get("X-User-Role", "Author")

        try:
            body = self._read_json()
        except Exception as e:
            self._send_json({"error": "Invalid JSON body", "details": str(e)}, 400)
            return

        self.handle_api_post(path, query, body, user_id, user_role)

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        user_id = self.headers.get("X-User-Id", "author")
        user_role = self.headers.get("X-User-Role", "Author")

        try:
            body = self._read_json()
        except Exception as e:
            self._send_json({"error": "Invalid JSON body", "details": str(e)}, 400)
            return

        self.handle_api_put(path, query, body, user_id, user_role)

    def do_PATCH(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        user_id = self.headers.get("X-User-Id", "author")
        user_role = self.headers.get("X-User-Role", "Author")

        try:
            body = self._read_json()
        except Exception as e:
            self._send_json({"error": "Invalid JSON body", "details": str(e)}, 400)
            return

        self.handle_api_patch(path, query, body, user_id, user_role)

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        user_id = self.headers.get("X-User-Id", "admin")
        user_role = self.headers.get("X-User-Role", "Admin")
        self.handle_api_delete(path, query, user_id, user_role)

    # ==================== SSE Streaming ====================

    def handle_sse_events(self, run_id):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        q = queue.Queue()
        with RUN_QUEUES_LOCK:
            if run_id not in RUN_EVENT_QUEUES:
                RUN_EVENT_QUEUES[run_id] = []
            RUN_EVENT_QUEUES[run_id].append(q)

        try:
            # Send initial ping
            self.wfile.write(b"event: connected\ndata: {\"status\":\"connected\"}\n\n")
            self.wfile.flush()

            while True:
                try:
                    event_type, payload = q.get(timeout=20.0)
                    msg = f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
                    if event_type in ["run_complete", "run_failed", "run_cancelled"]:
                        break
                except queue.Empty:
                    # Keep-alive heartbeat
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with RUN_QUEUES_LOCK:
                if run_id in RUN_EVENT_QUEUES and q in RUN_EVENT_QUEUES[run_id]:
                    RUN_EVENT_QUEUES[run_id].remove(q)

    # ==================== GET Routes ====================

    def handle_api_get(self, path, query):
        conn = get_connection()
        c = conn.cursor()

        # Overview stats
        if path == "/api/v1/overview":
            c.execute("SELECT count(*) FROM labs")
            total_labs = c.fetchone()[0]

            c.execute("SELECT count(*) FROM findings WHERE status = 'open'")
            open_findings = c.fetchone()[0]

            c.execute("SELECT priority, count(*) FROM findings WHERE status = 'open' GROUP BY priority")
            findings_by_pri = {r[0]: r[1] for r in c.fetchall()}

            c.execute("SELECT state, result, count(*) FROM validation_cells GROUP BY state, result")
            val_stats = [{"state": r[0], "result": r[1], "count": r[2]} for r in c.fetchall()]

            c.execute("SELECT count(*) FROM manifest_rows WHERE status = 'needs_verification'")
            needs_verif = c.fetchone()[0]

            c.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT 5")
            latest_runs = [dict(r) for r in c.fetchall()]

            conn.close()
            self._send_json({
                "total_labs": total_labs,
                "open_findings": open_findings,
                "findings_by_priority": findings_by_pri,
                "validation_stats": val_stats,
                "manifest_needs_verification": needs_verif,
                "latest_runs": latest_runs
            })
            return

        # Courses
        if path == "/api/v1/courses":
            c.execute("SELECT * FROM courses ORDER BY slug")
            courses = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(courses)
            return

        # Labs for a course
        if path.startswith("/api/v1/courses/") and path.endswith("/labs"):
            course_slug = path.split("/")[4]
            c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
            crow = c.fetchone()
            if not crow:
                conn.close()
                self._send_json([], 404)
                return
            course_id = crow["id"]

            c.execute("SELECT * FROM labs WHERE course_id = ? OR course_id = ? ORDER BY chapter, part", (course_id, course_slug))
            labs = [dict(r) for r in c.fetchall()]

            # Attach grade cases & lint counts
            for l in labs:
                l["vars"] = json.loads(l["vars_json"] or "{}")
                l["start"] = json.loads(l["start_json"] or "[]")
                l["finish"] = json.loads(l["finish_json"] or "[]")
                l["default_grade_slug"] = resolve_nusactl_grade_slug(l, course_slug=course_slug)
                c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (l["id"],))
                l["grade"] = [dict(case) for case in c.fetchall()]

                # Validation status
                c.execute("SELECT state, result FROM validation_cells WHERE lab_id = ?", (l["id"],))
                l["validation_states"] = {r["state"]: r["result"] for r in c.fetchall()}

            conn.close()
            self._send_json(labs)
            return

        # Lab Markdown Instructions & Grader Cases
        if path.startswith("/api/v1/labs/") and path.endswith("/md"):
            lab_id = path.split("/")[4]
            md, source = resolve_lab_markdown(lab_id)
            c.execute("SELECT * FROM labs WHERE id = ? OR export_id = ?", (lab_id, lab_id))
            lab_row = c.fetchone()
            default_slug = None
            grade_cases = []
            lab_vars = {}
            if lab_row:
                c.execute("SELECT slug FROM courses WHERE id = ?", (lab_row["course_id"],))
                c_row = c.fetchone()
                c_slug = c_row["slug"] if c_row else lab_row["course_id"]
                default_slug = resolve_nusactl_grade_slug(dict(lab_row), course_slug=c_slug, lab_md=md)
                lab_vars = json.loads(lab_row["vars_json"] or "{}")
                c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab_row["id"],))
                grade_cases = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json({
                "lab_id": lab_id,
                "lab_md": md or "",
                "source": source,
                "default_grade_slug": default_slug,
                "vars": lab_vars,
                "grade": grade_cases
            })
            return

        # Single Lab Detail
        if path.startswith("/api/v1/labs/"):
            lab_id = path.split("/")[4]
            c.execute("SELECT * FROM labs WHERE id = ? OR export_id = ?", (lab_id, lab_id))
            lab_row = c.fetchone()
            if not lab_row:
                conn.close()
                self._send_json({"error": "Lab not found"}, 404)
                return
            lab = dict(lab_row)
            lab["vars"] = json.loads(lab["vars_json"] or "{}")
            lab["start"] = json.loads(lab["start_json"] or "[]")
            lab["finish"] = json.loads(lab["finish_json"] or "[]")
            if not lab.get("lab_md"):
                resolved_md, _ = resolve_lab_markdown(lab["id"])
                lab["lab_md"] = resolved_md or ""

            c.execute("SELECT slug FROM courses WHERE id = ?", (lab["course_id"],))
            c_row = c.fetchone()
            c_slug = c_row["slug"] if c_row else lab["course_id"]
            lab["default_grade_slug"] = resolve_nusactl_grade_slug(lab, course_slug=c_slug, lab_md=lab.get("lab_md"))

            c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab["id"],))
            cases = [dict(case) for case in c.fetchall()]
            lab["grade"] = cases

            # Latest runs
            c.execute("SELECT * FROM runs WHERE lab_id = ? ORDER BY started_at DESC LIMIT 10", (lab["id"],))
            lab["runs"] = [dict(r) for r in c.fetchall()]

            # Validation matrix
            c.execute("SELECT * FROM validation_cells WHERE lab_id = ?", (lab["id"],))
            lab["validation_cells"] = [dict(r) for r in c.fetchall()]

            conn.close()
            self._send_json(lab)
            return

        # Targets
        if path == "/api/v1/targets":
            c.execute("SELECT id, name, host, port, user, password, nusactl_username, nusactl_password, modifiable, is_active, notes FROM targets")
            targets = []
            for r in c.fetchall():
                td = dict(r)
                td["has_password"] = bool(td.get("password"))
                td["password"] = "[configured]" if td.get("password") else ""
                td["has_nusactl_password"] = bool(td.get("nusactl_password"))
                td["nusactl_password"] = "[configured]" if td.get("nusactl_password") else ""
                targets.append(td)
            conn.close()
            self._send_json(targets)
            return

        # Runs list
        if path == "/api/v1/runs":
            c.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT 50")
            runs = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(runs)
            return

        # Single Run Detail
        if path.startswith("/api/v1/runs/"):
            run_id = path.split("/")[4]
            c.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,))
            run_row = c.fetchone()
            if not run_row:
                conn.close()
                self._send_json({"error": "Run not found"}, 404)
                return
            run = dict(run_row)

            c.execute("SELECT * FROM case_results WHERE run_id = ? ORDER BY case_index", (run_id,))
            run["results"] = [dict(r) for r in c.fetchall()]

            c.execute("SELECT * FROM debug_logs WHERE run_id = ? ORDER BY case_index", (run_id,))
            run["debug_logs"] = [dict(r) for r in c.fetchall()]

            c.execute("SELECT * FROM gates WHERE run_id = ?", (run_id,))
            run["gates"] = [dict(r) for r in c.fetchall()]

            c.execute("SELECT * FROM cross_checks WHERE run_id = ? ORDER BY case_index", (run_id,))
            run["cross_checks"] = [dict(r) for r in c.fetchall()]

            conn.close()
            self._send_json(run)
            return

        # Validation Matrix
        if path == "/api/v1/validation/matrix":
            c.execute("""
                SELECT l.id as lab_id, l.chapter, l.part, l.description,
                       v.state, v.result, v.reason, v.latest_run_id
                FROM labs l
                LEFT JOIN validation_cells v ON l.id = v.lab_id
                ORDER BY l.chapter, l.part
            """)
            rows = c.fetchall()
            matrix = {}
            for r in rows:
                lid = r["lab_id"]
                if lid not in matrix:
                    matrix[lid] = {
                        "lab_id": lid,
                        "description": r["description"],
                        "chapter": r["chapter"],
                        "part": r["part"],
                        "states": {}
                    }
                if r["state"]:
                    matrix[lid]["states"][r["state"]] = {
                        "result": r["result"],
                        "reason": r["reason"],
                        "latest_run_id": r["latest_run_id"]
                    }
            conn.close()
            self._send_json(list(matrix.values()))
            return

        # Findings
        if path == "/api/v1/findings":
            c.execute("SELECT * FROM findings ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END")
            findings = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(findings)
            return

        # Manifest
        if path == "/api/v1/manifest":
            c.execute("SELECT * FROM manifest_rows ORDER BY component")
            manifest = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(manifest)
            return

        # Sources
        if path == "/api/v1/sources":
            c.execute("SELECT * FROM sources ORDER BY code")
            sources = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(sources)
            return

        # Audit Entries
        if path == "/api/v1/audit":
            c.execute("SELECT * FROM audit_entries")
            audits = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(audits)
            return

        # Quiz Corrections
        if path == "/api/v1/quizzes":
            c.execute("SELECT * FROM quiz_corrections ORDER BY question_id")
            quizzes = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(quizzes)
            return

        # Continuity Rows
        if path == "/api/v1/continuity":
            c.execute("SELECT * FROM continuity_rows ORDER BY sort_order")
            crows = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(crows)
            return

        # Activity Logs
        if path == "/api/v1/activity":
            c.execute("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100")
            logs = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json(logs)
            return

        # Reports
        if path.startswith("/api/v1/reports/lab/"):
            lab_id = path.split("/")[5]
            fmt = query.get("format", ["md"])[0]
            if fmt == "junit":
                xml_out = generate_junit_xml(lab_id)
                conn.close()
                self._send_text(xml_out, content_type="application/xml")
                return
            elif fmt == "json":
                # JSON report format (Grading Baseline 6.1 & 8)
                c.execute("SELECT * FROM runs WHERE lab_id = ? ORDER BY started_at DESC LIMIT 1", (lab_id,))
                run = c.fetchone()
                if not run:
                    conn.close()
                    self._send_json({"error": "No runs for lab"}, 404)
                    return
                c.execute("SELECT * FROM case_results WHERE run_id = ?", (run["run_id"],))
                res = [dict(r) for r in c.fetchall()]
                c.execute("SELECT * FROM debug_logs WHERE run_id = ?", (run["run_id"],))
                dbg = [dict(r) for r in c.fetchall()]
                conn.close()
                self._send_json({"run": dict(run), "results": res, "debug_log": dbg})
                return
            else:
                md_out = generate_lab_report_markdown(lab_id)
                conn.close()
                self._send_text(md_out)
                return

        if path.startswith("/api/v1/reports/audit/"):
            course_slug = path.split("/")[5]
            lang = query.get("lang", ["id"])[0]
            md_out = generate_audit_document_markdown(course_slug, language=lang)
            conn.close()
            self._send_text(md_out)
            return

        # Patched Course Export Download
        if path.startswith("/api/v1/courses/") and path.endswith("/export"):
            course_slug = path.split("/")[4]
            patched = query.get("patched", ["true"])[0] == "true"
            export_data, changes_md = export_patched_course(course_slug)
            conn.close()
            if not export_data:
                self._send_json({"error": "Course not found"}, 404)
                return
            self._send_json({"course": course_slug, "labs": export_data, "changes_md": changes_md})
            return

        # Settings
        if path == "/api/v1/settings":
            c.execute("SELECT * FROM settings")
            settings = {r["key"]: r["value"] for r in c.fetchall()}
            conn.close()
            self._send_json(settings)
            return

        conn.close()
        self._send_json({"error": "Endpoint not found"}, 404)

    # ==================== POST Routes ====================

    def handle_api_post(self, path, query, body, user_id, user_role):
        conn = get_connection()
        c = conn.cursor()

        # Import course export JSON
        if path == "/api/v1/imports/course-export":
            preview_only = query.get("preview", ["false"])[0] == "true"
            res = import_course_export(body, user_id=user_id, apply_changes=(not preview_only))
            conn.close()
            self._send_json(res)
            return

        # Import Zip Course + JSON Grading Package
        if path == "/api/v1/imports/package":
            zip_b64 = body.get("zip_base64")
            zip_path = body.get("zip_path")
            grade_json = body.get("grade_json")
            grade_path = body.get("grade_path")

            zip_input = zip_path if (zip_path and os.path.exists(zip_path)) else zip_b64
            grade_input = grade_json
            if grade_path and os.path.exists(grade_path):
                with open(grade_path, "r", encoding="utf-8") as gf:
                    grade_input = json.load(gf)

            conn.close()
            res = import_course_zip_and_grading(zip_input, grade_data=grade_input, user_id=user_id)
            self._send_json(res)
            return

        # Load Local Sample Exports (GitLab Fundamental or dok8s)
        if path == "/api/v1/imports/load-sample":
            target_sample = body.get("sample", "gitlab")
            scratch_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            scratch_parent = os.path.dirname(scratch_dir)

            if target_sample == "gitlab":
                grade_file = os.path.join(scratch_parent, "grade_export.json")
                if os.path.exists(grade_file):
                    with open(grade_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    res = import_course_export(data, user_id=user_id, apply_changes=True)
                    conn.close()
                    self._send_json({"status": "success", "sample": "gitlab-fundamental", "details": res})
                    return
            conn.close()
            self._send_json({"error": "Sample file not found"}, 404)
            return

        # Create / Add New Lab (UI or API)
        if path == "/api/v1/labs" or (path.startswith("/api/v1/courses/") and path.endswith("/labs")):
            if user_role not in ["Author", "Operator", "Admin"]:
                conn.close()
                self._send_json({"error": "Author or higher role required to create a lab"}, 403)
                return

            course_slug = body.get("course", "dok8s")
            c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
            c_row = c.fetchone()
            if not c_row:
                course_id = str(uuid.uuid4())
                c.execute("INSERT INTO courses (id, slug, title, default_language, created_at) VALUES (?, ?, ?, 'id', ?)",
                          (course_id, course_slug, f"{course_slug.upper()} Course", datetime.now(timezone.utc).isoformat()))
            else:
                course_id = c_row["id"]

            lab_id = str(uuid.uuid4())
            export_id = body.get("export_id") or f"lab_{uuid.uuid4().hex[:12]}"
            chapter = str(body.get("chapter", "001")).zfill(3)
            part = str(body.get("part", "1"))
            desc = body.get("description", f"Lab {chapter}.{part}")
            slug = body.get("slug") or f"{course_slug}-{chapter}-{part}"
            vars_json = json.dumps(body.get("vars", {}))
            start_json = json.dumps(body.get("start", []))
            finish_json = json.dumps(body.get("finish", []))

            c.execute("""
                INSERT INTO labs (id, course_id, export_id, chapter, part, description, vars_json, start_json, finish_json, slug, modifiable_ok)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (lab_id, course_id, export_id, chapter, part, desc, vars_json, start_json, finish_json, slug))

            # Add grade cases if provided
            cases = body.get("grade", [])
            for idx, case in enumerate(cases):
                case_id = str(uuid.uuid4())
                c.execute("""
                    INSERT INTO grade_cases (id, lab_id, case_index, name, cmd, expect, hint, debug, log_cmd)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    case_id,
                    lab_id,
                    idx + 1,
                    case.get("name", f"case {idx+1} - check"),
                    case.get("cmd", "echo 1"),
                    str(case.get("expect", "1")),
                    case.get("hint", ""),
                    case.get("debug", "true"),
                    case.get("log_cmd", "")
                ))

            conn.commit()
            conn.close()

            log_activity(user_id, "create_lab", "lab", lab_id, None, {"description": desc, "chapter": chapter, "part": part})
            self._send_json({"status": "created", "id": lab_id, "export_id": export_id, "description": desc})
            return

        # AI Agent: Remediate Grading
        if path == "/api/v1/agents/remediate-grading":
            course_slug = body.get("course", "dok8s")
            auto_apply = body.get("auto_apply", False)
            conn.close()
            res = run_grading_remediation_agent(course_slug=course_slug, user_id=user_id, auto_apply=auto_apply)
            self._send_json(res)
            return

        # AI Agent: Update Course & Add New Modules
        if path == "/api/v1/agents/update-course":
            course_slug = body.get("course", "dok8s")
            lang = body.get("language", "id")
            conn.close()
            res = run_course_update_agent(course_slug=course_slug, language=lang, user_id=user_id)
            self._send_json(res)
            return

        # Grader Lint on Demand
        if path == "/api/v1/lint/run":
            scope = body.get("scope", "course")
            course_slug = body.get("course", "dok8s")

            c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
            crow = c.fetchone()
            if not crow:
                conn.close()
                self._send_json({"error": "Course not found"}, 404)
                return

            c.execute("SELECT * FROM labs WHERE course_id = ?", (crow["id"],))
            labs = c.fetchall()

            all_issues = []
            for lab in labs:
                lab_dict = dict(lab)
                lab_dict["vars"] = json.loads(lab["vars_json"] or "{}")
                lab_dict["start"] = json.loads(lab["start_json"] or "[]")
                lab_dict["finish"] = json.loads(lab["finish_json"] or "[]")

                c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab["id"],))
                lab_dict["grade"] = [dict(case) for case in c.fetchall()]

                issues = lint_lab(lab_dict)
                for issue in issues:
                    issue["lab_id"] = lab["id"]
                    issue["lab_desc"] = lab["description"]
                    all_issues.append(issue)

            conn.close()
            self._send_json({"total_issues": len(all_issues), "issues": all_issues})
            return

        # Parse Lab MD for AI step preview
        if path.startswith("/api/v1/labs/") and path.endswith("/parse-md"):
            lab_id = path.split("/")[4]
            custom_md = body.get("lab_md")
            if custom_md:
                lab_md = custom_md
            else:
                lab_md, _ = resolve_lab_markdown(lab_id)
            steps = extract_instructions_from_lab_md(lab_md)
            conn.close()
            self._send_json({"lab_id": lab_id, "total_steps": len(steps), "steps": steps})
            return

        # Start a grading run
        if path == "/api/v1/runs":
            lab_id = body.get("lab_id")
            target_id = body.get("target_id")
            state = body.get("state", "unsolved")
            mode = body.get("mode", "manual")
            scenario = body.get("scenario")
            user_vars = body.get("vars", {})
            follow_lab_md = body.get("follow_lab_md", (state == "solved"))
            custom_lab_md = body.get("custom_lab_md")
            grade_slug = body.get("grade_slug")
            workflow = body.get("workflow", "standard")

            c.execute("SELECT * FROM targets WHERE id = ?", (target_id,))
            target = c.fetchone()
            if not target:
                conn.close()
                self._send_json({"error": "Target not found"}, 404)
                return

            custom_grade = body.get("custom_grade") or body.get("custom_grade_json") or body.get("grade_cases")
            parsed_custom_cases = None
            if custom_grade:
                if isinstance(custom_grade, str):
                    try:
                        parsed_custom_cases = json.loads(custom_grade)
                    except Exception:
                        parsed_custom_cases = None
                else:
                    parsed_custom_cases = custom_grade

            # Support ad-hoc / direct MD run without preexisting lab in database
            if (not lab_id or lab_id in ["custom", "adhoc", "ad-hoc"]) and custom_lab_md:
                resolved_slug = resolve_nusactl_grade_slug({}, custom_slug=grade_slug, lab_md=custom_lab_md)
                adhoc_cases = []
                adhoc_vars = user_vars
                if parsed_custom_cases:
                    if isinstance(parsed_custom_cases, dict):
                        adhoc_cases = parsed_custom_cases.get("grade") or []
                        if "vars" in parsed_custom_cases and isinstance(parsed_custom_cases["vars"], dict):
                            adhoc_vars = {**adhoc_vars, **parsed_custom_cases["vars"]}
                    elif isinstance(parsed_custom_cases, list):
                        adhoc_cases = parsed_custom_cases
                if not adhoc_cases:
                    adhoc_cases = synthesize_cases_from_lab_md(custom_lab_md, target=dict(target))

                lab_dict = {
                    "id": f"adhoc-{uuid.uuid4().hex[:8]}",
                    "export_id": f"adhoc-{resolved_slug}",
                    "course_id": "adhoc",
                    "chapter": resolved_slug.split("-")[1] if len(resolved_slug.split("-")) > 1 else "001",
                    "part": resolved_slug.split("-")[2] if len(resolved_slug.split("-")) > 2 else "1",
                    "description": f"Ad-hoc Lab ({resolved_slug})",
                    "vars_json": json.dumps(adhoc_vars),
                    "start_json": "[]",
                    "finish_json": "[]",
                    "slug": resolved_slug,
                    "vars": adhoc_vars,
                    "start": [],
                    "finish": [],
                    "grade": adhoc_cases,
                    "lab_md": custom_lab_md
                }
                lab = lab_dict
            else:
                c.execute("SELECT * FROM labs WHERE id = ?", (lab_id,))
                lab_row = c.fetchone()
                if not lab_row:
                    conn.close()
                    self._send_json({"error": "Lab not found"}, 404)
                    return
                lab = dict(lab_row)
                lab_dict = dict(lab)
                lab_dict["vars"] = json.loads(lab["vars_json"] or "{}")
                lab_dict["start"] = json.loads(lab["start_json"] or "[]")
                lab_dict["finish"] = json.loads(lab["finish_json"] or "[]")
                if custom_lab_md:
                    lab_dict["lab_md"] = custom_lab_md

                if parsed_custom_cases:
                    if isinstance(parsed_custom_cases, dict):
                        lab_dict["grade"] = parsed_custom_cases.get("grade") or []
                        if "vars" in parsed_custom_cases and isinstance(parsed_custom_cases["vars"], dict):
                            lab_dict["vars"].update(parsed_custom_cases["vars"])
                    elif isinstance(parsed_custom_cases, list):
                        lab_dict["grade"] = parsed_custom_cases
                else:
                    c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab["id"],))
                    lab_dict["grade"] = [dict(case) for case in c.fetchall()]

            run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{lab['export_id']}-{state}"
            now = datetime.now(timezone.utc).isoformat()

            c.execute("""
                INSERT INTO runs (run_id, course, chapter, part, lab_id, target_id, state, mode, status, started_by, started_at, scenario, vars_used_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)
            """, (run_id, lab["course_id"], lab["chapter"], lab["part"], lab_id, target_id, state, mode, user_id, now, scenario, json.dumps(list(user_vars.keys()))))
            conn.commit()
            conn.close()

            # Event emitter helper
            def dispatch_event(event_type, payload):
                with RUN_QUEUES_LOCK:
                    queues = RUN_EVENT_QUEUES.get(run_id, [])
                    for q in queues:
                        q.put((event_type, payload))

            # Run in worker thread
            def worker():
                run_lab(
                    run_id=run_id,
                    target=dict(target),
                    lab=lab_dict,
                    state=state,
                    mode=mode,
                    user_vars=user_vars,
                    scenario=scenario,
                    user_id=user_id,
                    event_callback=dispatch_event,
                    follow_lab_md=follow_lab_md,
                    grade_slug=grade_slug,
                    workflow=workflow
                )

            t = threading.Thread(target=worker, daemon=True)
            t.start()

            self._send_json({"status": "started", "run_id": run_id})
            return

        # Gate decision
        if path.startswith("/api/v1/runs/") and "/gates/" in path:
            parts = path.split("/")
            run_id = parts[4]
            gate_id = parts[6]
            action = parts[7] # approve or deny

            if user_role not in ["Operator", "Admin"]:
                conn.close()
                self._send_json({"error": "Operator role required to approve run gates"}, 403)
                return

            now = datetime.now(timezone.utc).isoformat()
            decision_status = "approved" if action == "approve" else "denied"
            c.execute("""
                UPDATE gates SET status = ?, decided_by = ?, decided_at = ?
                WHERE id = ? AND run_id = ?
            """, (decision_status, user_id, now, gate_id, run_id))
            conn.commit()
            conn.close()

            log_activity(user_id, f"gate_{action}", "gate", gate_id)
            self._send_json({"status": decision_status, "gate_id": gate_id})
            return

        # Propose Revision (Section 6.1 / FR-IMP-05)
        if path == "/api/v1/revisions":
            rev_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            entity_type = body.get("entity_type", "grade_case")
            entity_id = body.get("entity_id")
            diff = body.get("diff", {})
            notes = body.get("notes", "")

            c.execute("""
                INSERT INTO revisions (id, entity_type, entity_id, author_id, created_at, diff_json, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)
            """, (rev_id, entity_type, entity_id, user_id, now, json.dumps(diff), notes))
            conn.commit()
            conn.close()

            log_activity(user_id, "propose_revision", entity_type, entity_id, None, diff)
            self._send_json({"status": "proposed", "revision_id": rev_id})
            return

        # Approve Revision
        if path.startswith("/api/v1/revisions/") and path.endswith("/approve"):
            rev_id = path.split("/")[4]
            if user_role not in ["Author", "Operator", "Admin"]:
                conn.close()
                self._send_json({"error": "Author role required to approve revision"}, 403)
                return
            c.execute("UPDATE revisions SET status = 'approved' WHERE id = ?", (rev_id,))
            conn.commit()
            conn.close()

            log_activity(user_id, "approve_revision", "revision", rev_id)
            self._send_json({"status": "approved", "revision_id": rev_id})
            return

        # Content Lint
        if path == "/api/v1/content/lint":
            text = body.get("markdown", "")
            lang = body.get("language", "id")
            approved = body.get("is_approved", False)
            issues = lint_content_markdown(text, language=lang, is_approved=approved)
            conn.close()
            self._send_json({"total_issues": len(issues), "issues": issues})
            return

        # Content Parity
        if path == "/api/v1/content/parity":
            id_md = body.get("id_markdown", "")
            en_md = body.get("en_markdown", "")
            issues = check_content_parity(id_md, en_md)
            conn.close()
            self._send_json({"parity_ok": len(issues) == 0, "issues": issues})
            return

        # Impact Search (FR-AUD-05 / 9.5)
        if path == "/api/v1/manifest/impact":
            token = body.get("token", "")
            c.execute("SELECT * FROM labs")
            labs = []
            for r in c.fetchall():
                ld = dict(r)
                ld["vars"] = json.loads(ld["vars_json"] or "{}")
                ld["start"] = json.loads(ld["start_json"] or "[]")
                ld["finish"] = json.loads(ld["finish_json"] or "[]")
                c.execute("SELECT * FROM grade_cases WHERE lab_id = ?", (ld["id"],))
                ld["grade"] = [dict(cr) for cr in c.fetchall()]
                labs.append(ld)

            c.execute("SELECT * FROM content_versions")
            c_versions = [dict(cv) for cv in c.fetchall()]

            matches = search_impact(token, labs, all_content_versions=c_versions)
            conn.close()
            self._send_json({"search_token": token, "total_matches": len(matches), "matches": matches})
            return

        # Promote Lint to Finding
        if path == "/api/v1/findings":
            fid = str(uuid.uuid4())
            ftype = body.get("type", "grader_defect")
            priority = body.get("priority", "high")
            title = body.get("title", "Defect")
            location = body.get("location", "")
            evidence = body.get("evidence", "")
            confirmed = 1 if body.get("confirmed") else 0

            c.execute("""
                INSERT INTO findings (id, type, priority, title, location, evidence, confirmed, status, owner_id, source_baseline_ref)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
            """, (fid, ftype, priority, title, location, evidence, confirmed, user_id, body.get("source_baseline_ref")))
            conn.commit()
            conn.close()

            log_activity(user_id, "create_finding", "finding", fid, None, body)
            self._send_json({"status": "created", "id": fid})
            return

        # Save / Add Testing VM Target
        if path == "/api/v1/targets":
            tid = body.get("id") or f"vm_{uuid.uuid4().hex[:8]}"
            name = body.get("name", "Testing VM")
            host = body.get("host", "127.0.0.1")
            port = int(body.get("port", 22))
            user = body.get("user", "student")
            password = body.get("password", "")
            nusactl_user = body.get("nusactl_username", "")
            nusactl_pass = body.get("nusactl_password", "")
            modifiable = 1 if body.get("modifiable", True) else 0
            notes = body.get("notes", "")

            c.execute("""
                INSERT OR REPLACE INTO targets (id, name, host, port, user, password, auth_ref, nusactl_username, nusactl_password, modifiable, is_active, notes)
                VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 1, ?)
            """, (tid, name, host, port, user, password, nusactl_user, nusactl_pass, modifiable, notes))
            conn.commit()
            conn.close()

            log_activity(user_id, "add_test_vm", "target", tid, None, {"name": name, "host": host, "user": user})
            self._send_json({"status": "created", "id": tid, "name": name})
            return

        # Test VM SSH Connection
        if path == "/api/v1/targets/test-connection":
            host = body.get("host")
            port = body.get("port", 22)
            user = body.get("user")
            password = body.get("password")
            target_id = body.get("target_id")

            if target_id and not host:
                c.execute("SELECT * FROM targets WHERE id = ?", (target_id,))
                t_row = c.fetchone()
                if t_row:
                    host = t_row["host"]
                    port = t_row["port"]
                    user = t_row["user"]
                    password = t_row["password"]

            conn.close()
            res = test_target_connection(host=host, port=port, user=user, password=password)
            self._send_json(res)
            return

        # Waive a Lint Issue
        if path.startswith("/api/v1/lint/issues/") and path.endswith("/waive"):
            rule_id = path.split("/")[5]
            entity_id = body.get("entity_id", "")
            reason = body.get("reason", "")
            wid = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()

            c.execute("""
                INSERT INTO waivers (id, rule_id, entity_id, reason, by_user, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (wid, rule_id, entity_id, reason, user_id, now))
            conn.commit()
            conn.close()

            log_activity(user_id, "waive_lint", "rule", rule_id, None, {"reason": reason, "entity_id": entity_id})
            self._send_json({"status": "waived", "waiver_id": wid})
            return

        conn.close()
        self._send_json({"error": "Post route not found"}, 404)

    # ==================== PUT & PATCH Routes ====================

    def handle_api_put(self, path, query, body, user_id, user_role):
        conn = get_connection()
        c = conn.cursor()

        # Update Lab Markdown Instructions
        if path.startswith("/api/v1/labs/") and path.endswith("/md"):
            lab_id = path.split("/")[4]
            new_md = body.get("lab_md", "")
            c.execute("UPDATE labs SET lab_md = ? WHERE id = ? OR export_id = ?", (new_md, lab_id, lab_id))
            conn.commit()
            conn.close()
            log_activity(user_id, "update_lab_md", "lab", lab_id, None, {"chars": len(new_md)})
            self._send_json({"status": "updated", "lab_id": lab_id, "chars": len(new_md)})
            return

        # Update Lab Grader Cases & Variables
        if path.startswith("/api/v1/labs/") and path.endswith("/grade"):
            lab_id = path.split("/")[4]
            c.execute("SELECT id FROM labs WHERE id = ? OR export_id = ?", (lab_id, lab_id))
            lab_row = c.fetchone()
            if not lab_row:
                conn.close()
                self._send_json({"error": "Lab not found"}, 404)
                return
            real_lab_id = lab_row["id"]

            cases = []
            if isinstance(body, list):
                cases = body
            elif isinstance(body, dict):
                cases = body.get("grade") or body.get("cases") or []
                if "vars" in body and isinstance(body["vars"], dict):
                    c.execute("UPDATE labs SET vars_json = ? WHERE id = ?", (json.dumps(body["vars"]), real_lab_id))
                if "start" in body and isinstance(body["start"], list):
                    c.execute("UPDATE labs SET start_json = ? WHERE id = ?", (json.dumps(body["start"]), real_lab_id))
                if "finish" in body and isinstance(body["finish"], list):
                    c.execute("UPDATE labs SET finish_json = ? WHERE id = ?", (json.dumps(body["finish"]), real_lab_id))

            if cases:
                c.execute("DELETE FROM grade_cases WHERE lab_id = ?", (real_lab_id,))
                for idx, item in enumerate(cases):
                    case_id = item.get("id") or str(uuid.uuid4())
                    c_idx = item.get("case_index", idx + 1)
                    c_name = item.get("name", f"case {c_idx}")
                    c_cmd = item.get("cmd", "")
                    c_expect = str(item.get("expect", ""))
                    c_hint = item.get("hint", "")
                    c_debug = str(item.get("debug", "true"))
                    c_log = item.get("log_cmd", "")
                    c.execute("""
                        INSERT INTO grade_cases (id, lab_id, case_index, name, cmd, expect, hint, debug, log_cmd)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (case_id, real_lab_id, c_idx, c_name, c_cmd, c_expect, c_hint, c_debug, c_log))

            conn.commit()
            conn.close()
            log_activity(user_id, "update_lab_grade", "lab", real_lab_id, None, {"cases_count": len(cases)})
            self._send_json({"status": "updated", "lab_id": real_lab_id, "cases_count": len(cases)})
            return

        # Update Manifest Row
        if path.startswith("/api/v1/manifest/"):
            mid = path.split("/")[4]
            verified_stable = body.get("verified_stable")
            source_code = body.get("source_code")
            check_date = body.get("check_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            status = "verified" if source_code else "needs_verification"

            c.execute("""
                UPDATE manifest_rows SET
                    verified_stable = ?,
                    source_code = ?,
                    check_date = ?,
                    status = ?,
                    decision = ?
                WHERE id = ?
            """, (verified_stable, source_code, check_date, status, body.get("decision"), mid))
            conn.commit()
            conn.close()

            log_activity(user_id, "update_manifest", "manifest_row", mid)
            self._send_json({"status": "updated"})
            return

        # Update Audit Entry
        if path.startswith("/api/v1/audit/"):
            aid = path.split("/")[4]
            c.execute("""
                UPDATE audit_entries SET
                    status_key = ?,
                    keep_text = ?,
                    update_text = ?,
                    suggested_material = ?,
                    findings_text = ?,
                    main_changes = ?,
                    suggested_grading = ?,
                    review_state = ?
                WHERE id = ?
            """, (
                body.get("status_key"),
                body.get("keep_text"),
                body.get("update_text"),
                body.get("suggested_material"),
                body.get("findings_text"),
                body.get("main_changes"),
                body.get("suggested_grading"),
                body.get("review_state", "proposed"),
                aid
            ))
            conn.commit()
            conn.close()

            log_activity(user_id, "update_audit", "audit_entry", aid)
            self._send_json({"status": "updated"})
            return

        conn.close()
        self._send_json({"error": "Put route not found"}, 404)

    def handle_api_patch(self, path, query, body, user_id, user_role):
        conn = get_connection()
        c = conn.cursor()

        # Update Finding status/confirmed
        if path.startswith("/api/v1/findings/"):
            fid = path.split("/")[4]
            fields = []
            vals = []
            for k in ["status", "confirmed", "priority", "owner_id"]:
                if k in body:
                    fields.append(f"{k} = ?")
                    vals.append(body[k])
            if fields:
                vals.append(fid)
                c.execute(f"UPDATE findings SET {', '.join(fields)} WHERE id = ?", vals)
                conn.commit()

            conn.close()
            log_activity(user_id, "patch_finding", "finding", fid, None, body)
            self._send_json({"status": "updated"})
            return

        conn.close()
        self._send_json({"error": "Patch route not found"}, 404)

    def handle_api_delete(self, path, query, user_id, user_role):
        conn = get_connection()
        c = conn.cursor()

        if path.startswith("/api/v1/targets/"):
            tid = path.split("/")[4]
            c.execute("DELETE FROM targets WHERE id = ?", (tid,))
            conn.commit()
            conn.close()
            log_activity(user_id, "delete_target", "target", tid)
            self._send_json({"status": "deleted", "id": tid})
            return

        if path.startswith("/api/v1/courses/"):
            slug = path.split("/")[4]
            c.execute("SELECT id FROM courses WHERE slug = ?", (slug,))
            row = c.fetchone()
            if row:
                cid = row["id"]
                c.execute("DELETE FROM grade_cases WHERE lab_id IN (SELECT id FROM labs WHERE course_id = ?)", (cid,))
                c.execute("DELETE FROM labs WHERE course_id = ?", (cid,))
                c.execute("DELETE FROM modules WHERE course_id = ?", (cid,))
                c.execute("DELETE FROM courses WHERE id = ?", (cid,))
                conn.commit()
            conn.close()
            log_activity(user_id, "delete_course", "course", slug)
            self._send_json({"status": "deleted", "slug": slug})
            return

        conn.close()
        self._send_json({"error": "Delete route not found"}, 404)

    # ==================== Static Asset Serving ====================

    def handle_static_get(self, path):
        if path in ["/", "", "/index.html"]:
            file_path = os.path.join(FRONTEND_DIR, "index.html")
            content_type = "text/html; charset=utf-8"
        else:
            rel = path.lstrip("/")
            file_path = os.path.join(FRONTEND_DIR, rel)
            if file_path.endswith(".js"):
                content_type = "application/javascript; charset=utf-8"
            elif file_path.endswith(".css"):
                content_type = "text/css; charset=utf-8"
            elif file_path.endswith(".json"):
                content_type = "application/json; charset=utf-8"
            else:
                content_type = "text/plain; charset=utf-8"

        if os.path.exists(file_path) and os.path.isfile(file_path):
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            # Fallback to index.html for SPA client-side routing
            index_path = os.path.join(FRONTEND_DIR, "index.html")
            if os.path.exists(index_path):
                with open(index_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self._send_text("Not Found", 404)

def run_server(port=8080):
    init_db()
    load_seed_data(load_dummy_dok8s=False)
    server_address = ("127.0.0.1", port)
    httpd = ThreadingHTTPServer(server_address, AppRequestHandler)
    print(f"[*] Dashboard App Server running at http://127.0.0.1:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server(8080)
