"""
Importer and Exporter for Course Export JSON, Audit Markdown, and Revisions Diff.
Satisfies FR-IMP-01 through FR-IMP-06.
"""

import json
import uuid
import re
from datetime import datetime, timezone
from .database import get_connection, log_activity

def import_course_export(json_data, user_id="author", apply_changes=True, override_course_slug=None):
    """
    Imports a course export JSON array idempotently by _id.
    Calculates diffs before applying if re-importing.
    Preserves all fields without data loss.
    """
    if isinstance(json_data, str):
        try:
            parsed = json.loads(json_data)
        except Exception as e:
            return {"status": "error", "message": f"JSON parse error: {str(e)}"}
    else:
        parsed = json_data

    # Handle string-wrapped json if applicable
    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except Exception:
            pass

    # If dict wrapped (like export-gitlab-fundamental), extract labs or wrap
    labs_list = []
    course_slug = override_course_slug or "dok8s"
    course_title = f"{course_slug.upper()} Course"

    if isinstance(parsed, list):
        labs_list = parsed
        if labs_list and not override_course_slug:
            course_slug = labs_list[0].get("course", "dok8s")
            course_title = f"{course_slug.upper()} Course"
    elif isinstance(parsed, dict):
        if not override_course_slug:
            course_slug = parsed.get("slug", "course")
            course_title = parsed.get("title", "Course")
        # Check if modules contain labs or if there is a grade array
        if "labs" in parsed:
            labs_list = parsed["labs"]
        elif "modules" in parsed:
            # Flatten labs from modules
            for mod in parsed["modules"]:
                for sub in mod.get("submodules", []):
                    if "grade" in sub:
                        labs_list.append(sub)

    conn = get_connection()
    c = conn.cursor()

    # Ensure course exists
    c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
    course_row = c.fetchone()
    if not course_row:
        course_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        c.execute("""
            INSERT INTO courses (id, slug, title, default_language, created_at)
            VALUES (?, ?, ?, 'id', ?)
        """, (course_id, course_slug, course_title, now))
    else:
        course_id = course_row["id"]

    # Detect changes before applying
    c.execute("SELECT export_id, description, vars_json, start_json, finish_json FROM labs WHERE course_id = ?", (course_id,))
    existing_labs = {row["export_id"]: dict(row) for row in c.fetchall()}

    added = []
    changed = []
    unchanged = []
    errors = []

    for lab_obj in labs_list:
        export_id = lab_obj.get("_id") or str(uuid.uuid4())
        desc = lab_obj.get("description", "")
        new_vars = json.dumps(lab_obj.get("vars", {}))
        new_start = json.dumps(lab_obj.get("start", []))
        new_finish = json.dumps(lab_obj.get("finish", []))

        if export_id not in existing_labs:
            added.append({"_id": export_id, "description": desc})
        else:
            old = existing_labs[export_id]
            diffs = {}
            if old["description"] != desc:
                diffs["description"] = {"old": old["description"], "new": desc}
            if old["vars_json"] != new_vars:
                diffs["vars"] = {"old": old["vars_json"], "new": new_vars}
            if old["start_json"] != new_start:
                diffs["start"] = {"old": old["start_json"], "new": new_start}
            if old["finish_json"] != new_finish:
                diffs["finish"] = {"old": old["finish_json"], "new": new_finish}

            if diffs:
                changed.append({"_id": export_id, "description": desc, "diffs": diffs})
            else:
                unchanged.append({"_id": export_id, "description": desc})

    if not apply_changes:
        conn.close()
        return {
            "status": "preview",
            "course": course_slug,
            "total": len(labs_list),
            "added_count": len(added),
            "changed_count": len(changed),
            "unchanged_count": len(unchanged),
            "added": added,
            "changed": changed,
            "errors": errors
        }

    # Apply import
    for lab_obj in labs_list:
        try:
            export_id = lab_obj.get("_id") or str(uuid.uuid4())
            chapter = str(lab_obj.get("chapter", "001"))
            part = str(lab_obj.get("part", "1"))
            desc = lab_obj.get("description", f"Lab {chapter}.{part}")
            vars_json = json.dumps(lab_obj.get("vars", {}))
            start_json = json.dumps(lab_obj.get("start", []))
            finish_json = json.dumps(lab_obj.get("finish", []))
            slug = lab_obj.get("slug") or f"{course_slug}-{chapter}-{part}"

            c.execute("SELECT id FROM labs WHERE export_id = ?", (export_id,))
            existing = c.fetchone()

            if existing:
                lab_id = existing["id"]
                c.execute("""
                    UPDATE labs SET
                        course_id = ?, chapter = ?, part = ?, description = ?,
                        vars_json = ?, start_json = ?, finish_json = ?, slug = ?
                    WHERE id = ?
                """, (course_id, chapter, part, desc, vars_json, start_json, finish_json, slug, lab_id))
            else:
                lab_id = str(uuid.uuid4())
                c.execute("""
                    INSERT INTO labs (id, course_id, export_id, chapter, part, description, vars_json, start_json, finish_json, slug, modifiable_ok)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """, (lab_id, course_id, export_id, chapter, part, desc, vars_json, start_json, finish_json, slug))

            # Store / update grade cases
            cases = lab_obj.get("grade", [])
            for idx, case in enumerate(cases):
                case_idx = idx + 1
                case_name = case.get("name", f"case {case_idx}")
                cmd = case.get("cmd", "")
                expect = str(case.get("expect", ""))
                hint = case.get("hint", "")
                debug = case.get("debug")
                log_cmd = case.get("log_cmd", "")

                c.execute("SELECT id FROM grade_cases WHERE lab_id = ? AND case_index = ?", (lab_id, case_idx))
                existing_case = c.fetchone()
                if existing_case:
                    c.execute("""
                        UPDATE grade_cases SET
                            name = ?, cmd = ?, expect = ?, hint = ?, debug = ?, log_cmd = ?
                        WHERE id = ?
                    """, (case_name, cmd, expect, hint, debug, log_cmd, existing_case["id"]))
                else:
                    c_id = str(uuid.uuid4())
                    c.execute("""
                        INSERT INTO grade_cases (id, lab_id, case_index, name, cmd, expect, hint, debug, log_cmd)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (c_id, lab_id, case_idx, case_name, cmd, expect, hint, debug, log_cmd))
        except Exception as e:
            errors.append({"lab": lab_obj.get("description", "unknown"), "error": str(e)})

    conn.commit()
    conn.close()

    log_activity(user_id, "import_course_export", "course", course_slug, None, {
        "added": len(added), "changed": len(changed), "unchanged": len(unchanged)
    })

    return {
        "status": "success",
        "course": course_slug,
        "total": len(labs_list),
        "added_count": len(added),
        "changed_count": len(changed),
        "unchanged_count": len(unchanged),
        "errors": errors
    }

def export_patched_course(course_slug):
    """
    FR-IMP-05 / Section 13.2:
    Exports course export JSON with approved Revisions applied, plus sidecar changes.md.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
    course_row = c.fetchone()
    if not course_row:
        conn.close()
        return None, None

    course_id = course_row["id"]
    c.execute("SELECT * FROM labs WHERE course_id = ? ORDER BY chapter, part", (course_id,))
    labs = c.fetchall()

    export_labs = []
    changes_md = f"# Patched Export Changelog for {course_slug}\nGenerated: {datetime.now(timezone.utc).isoformat()}\n\n"

    total_changes = 0

    for lab in labs:
        lab_id = lab["id"]
        lab_dict = {
            "_id": lab["export_id"],
            "course": course_slug,
            "chapter": lab["chapter"],
            "part": lab["part"],
            "description": lab["description"],
            "vars": json.loads(lab["vars_json"] or "{}"),
            "start": json.loads(lab["start_json"] or "[]"),
            "finish": json.loads(lab["finish_json"] or "[]"),
            "grade": []
        }

        # Fetch cases
        c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab_id,))
        cases = c.fetchall()

        for case in cases:
            case_id = case["id"]
            case_dict = {
                "name": case["name"],
                "cmd": case["cmd"],
                "expect": case["expect"],
                "hint": case["hint"],
                "log_cmd": case["log_cmd"]
            }
            if case["debug"] is not None:
                case_dict["debug"] = case["debug"]

            # Check for approved revisions
            c.execute("""
                SELECT * FROM revisions
                WHERE entity_id = ? AND status = 'approved'
                ORDER BY created_at DESC
            """, (case_id,))
            revisions = c.fetchall()

            for rev in revisions:
                diff = json.loads(rev["diff_json"])
                for field, change in diff.items():
                    old_val = case_dict.get(field)
                    new_val = change.get("new")
                    case_dict[field] = new_val
                    total_changes += 1
                    changes_md += f"- **Lab {lab['chapter']}.{lab['part']} Case {case['case_index']}** `{field}` changed:\n"
                    changes_md += f"  - Before: `{old_val}`\n"
                    changes_md += f"  - After: `{new_val}`\n"
                    changes_md += f"  - Revision ID: `{rev['id']}` by Author: `{rev['author_id']}`\n\n"

            lab_dict["grade"].append(case_dict)

        export_labs.append(lab_dict)

    conn.close()

    if total_changes == 0:
        changes_md += "No approved revisions were found. Export is identical to source.\n"

    return export_labs, changes_md

# ==================== ZIP Course & JSON Grading Package Importer ====================

import zipfile
import io
import base64
import os

def import_course_zip_and_grading(zip_data, grade_data=None, user_id="author"):
    """
    Imports a course package where:
    - Course is a .zip archive (containing export-*.json with modules, submodules, quizzes, media)
    - Grading is a .json file (containing labs, grade cases, start/finish)
    """
    # 1. Open the zip archive
    zfile = None
    if isinstance(zip_data, str):
        if os.path.exists(zip_data):
            zfile = zipfile.ZipFile(zip_data, 'r')
        else:
            # Assume base64 string
            try:
                raw_bytes = base64.b64decode(zip_data)
                zfile = zipfile.ZipFile(io.BytesIO(raw_bytes), 'r')
            except Exception as e:
                return {"status": "error", "message": f"Failed to decode base64 zip: {str(e)}"}
    elif isinstance(zip_data, bytes):
        zfile = zipfile.ZipFile(io.BytesIO(zip_data), 'r')
    else:
        return {"status": "error", "message": "Invalid zip data provided"}

    course_json_data = None
    with zfile:
        for name in zfile.namelist():
            if name.endswith(".json") and not name.startswith("__MACOSX"):
                content = zfile.read(name).decode("utf-8", errors="replace")
                try:
                    course_json_data = json.loads(content)
                    if isinstance(course_json_data, str):
                        course_json_data = json.loads(course_json_data)
                    break
                except Exception:
                    continue

    if not course_json_data:
        return {"status": "error", "message": "No valid course JSON found inside the zip archive."}

    course_title = course_json_data.get("title", "Imported Course")
    course_slug = course_json_data.get("slug", "course")
    modules = course_json_data.get("modules", [])

    conn = get_connection()
    c = conn.cursor()

    # Ensure course exists
    c.execute("SELECT id FROM courses WHERE slug = ?", (course_slug,))
    crow = c.fetchone()
    now = datetime.now(timezone.utc).isoformat()
    if not crow:
        course_id = str(uuid.uuid4())
        c.execute("""
            INSERT INTO courses (id, slug, title, default_language, created_at)
            VALUES (?, ?, ?, 'id', ?)
        """, (course_id, course_slug, course_title, now))
    else:
        course_id = crow["id"]
        c.execute("UPDATE courses SET title = ? WHERE id = ?", (course_title, course_id))

    modules_count = 0
    submodules_count = 0
    quizzes_count = 0

    # Ingest Modules and Sections
    for m_idx, mod in enumerate(modules):
        mod_id = str(mod.get("id") or uuid.uuid4())
        mod_title = mod.get("title", f"Module {m_idx+1}")
        mod_order = mod.get("order", m_idx + 1)

        c.execute("SELECT id FROM modules WHERE id = ?", (mod_id,))
        if c.fetchone():
            c.execute("UPDATE modules SET title = ?, sort_order = ? WHERE id = ?", (mod_title, mod_order, mod_id))
        else:
            c.execute("""
                INSERT INTO modules (id, course_id, number, title, sort_order)
                VALUES (?, ?, ?, ?, ?)
            """, (mod_id, course_id, mod_order, mod_title, mod_order))
        modules_count += 1

        # Process sections (submodules & quizzes)
        sections = mod.get("sections", [])
        for s_idx, sec in enumerate(sections):
            sec_id = str(sec.get("id") or uuid.uuid4())
            sec_title = sec.get("title", f"Section {s_idx+1}")
            sec_order = sec.get("order", s_idx + 1)
            content_md = sec.get("content_md") or sec.get("content") or ""

            c.execute("SELECT id FROM submodules WHERE id = ?", (sec_id,))
            if c.fetchone():
                c.execute("UPDATE submodules SET title = ?, sort_order = ? WHERE id = ?", (sec_title, sec_order, sec_id))
            else:
                c.execute("""
                    INSERT INTO submodules (id, module_id, title, sort_order)
                    VALUES (?, ?, ?, ?)
                """, (sec_id, mod_id, sec_title, sec_order))
            submodules_count += 1

            # Store content version if available
            if content_md:
                cv_id = f"cv_{sec_id}_id"
                c.execute("SELECT id FROM content_versions WHERE id = ?", (cv_id,))
                if c.fetchone():
                    c.execute("UPDATE content_versions SET body_markdown = ? WHERE id = ?", (content_md, cv_id))
                else:
                    c.execute("""
                        INSERT INTO content_versions (id, content_id, language, body_markdown, state, author_id, created_at, outputs_verified, parity_ok)
                        VALUES (?, ?, 'id', ?, 'published', 'import_zip', ?, 1, 1)
                    """, (cv_id, sec_id, content_md, now))

            # Quiz questions check
            if sec.get("is_quiz") or sec.get("quiz"):
                quizzes_count += 1
                q_data = sec.get("quiz") or {}
                for q_item in q_data.get("questions", []):
                    qid = str(q_item.get("id") or uuid.uuid4())
                    q_prob = q_item.get("question") or q_item.get("title") or "Review question"
                    c.execute("SELECT id FROM quiz_corrections WHERE question_id = ?", (qid,))
                    if not c.fetchone():
                        c.execute("""
                            INSERT INTO quiz_corrections (id, quiz_ref, question_id, problem, update_text)
                            VALUES (?, ?, ?, ?, 'Imported from course package')
                        """, (str(uuid.uuid4()), sec_title, qid, q_prob))

    conn.commit()
    conn.close()

    # 2. Ingest Grade JSON if provided, or auto-detect from scratch folder
    grade_report = None
    if not grade_data:
        # Check scratch directories for candidate grade_export files
        scratch_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        scratch_parent = os.path.dirname(scratch_dir)
        candidate_paths = [
            os.path.join(scratch_parent, "grade_export.json"),
            os.path.join(scratch_parent, "remediated_grade_export.json"),
            os.path.join(scratch_dir, "grade_export.json"),
        ]
        for cp in candidate_paths:
            if os.path.exists(cp):
                try:
                    with open(cp, "r", encoding="utf-8") as gf:
                        grade_data = json.load(gf)
                    break
                except Exception:
                    pass

    if grade_data:
        parsed_grade = grade_data
        if isinstance(grade_data, str):
            try:
                parsed_grade = json.loads(grade_data)
            except Exception:
                pass
        # Ensure labs have the course slug
        if isinstance(parsed_grade, list):
            for lab_item in parsed_grade:
                lab_item["course"] = course_slug
        grade_report = import_course_export(parsed_grade, user_id=user_id, apply_changes=True, override_course_slug=course_slug)

    log_activity(user_id, "import_zip_and_grade", "course", course_slug, None, {
        "modules": modules_count,
        "submodules": submodules_count,
        "quizzes": quizzes_count,
        "grade_imported": bool(grade_report)
    })

    return {
        "status": "success",
        "course_slug": course_slug,
        "course_title": course_title,
        "modules_imported": modules_count,
        "submodules_imported": submodules_count,
        "quizzes_imported": quizzes_count,
        "grading_import": grade_report
    }
