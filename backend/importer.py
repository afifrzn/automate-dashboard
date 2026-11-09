"""
Importer and Exporter for Course Export JSON, Audit Markdown, and Revisions Diff.
Satisfies FR-IMP-01 through FR-IMP-06.
"""

import json
import uuid
import re
import zipfile
import io
import base64
import os
from datetime import datetime, timezone
from .database import get_connection, log_activity
from .ai_agent import resolve_nusactl_grade_slug, synthesize_cases_from_lab_md, COURSE_PREFIX_MAP


def is_lab_section(sec):
    """
    Determines whether a module section/submodule in a Course ZIP JSON is a Lab.
    Excludes theory sections and quiz sections; returns True only for Lab tasks.
    """
    if not isinstance(sec, dict):
        return False
    if sec.get("is_quiz") or sec.get("type_section") == 4 or sec.get("quiz"):
        return False
    if sec.get("is_task") or sec.get("type_section") == 5 or "grade" in sec:
        return True
    title = (sec.get("title") or sec.get("description") or "").strip()
    if re.match(r"^lab\s+\d+", title, re.IGNORECASE):
        return True
    return False


def extract_labs_from_course_json(course_json_data, override_course_slug=None):
    """
    Extracts ONLY Lab sections from a course JSON structure (modules -> sections/submodules).
    Ignores all non-lab theory sections and quizzes.
    Returns (course_slug, course_title, lab_modules, extracted_labs).
    """
    course_title = course_json_data.get("title", "Imported Course")
    course_slug = override_course_slug or course_json_data.get("slug", "course")
    modules = course_json_data.get("modules", [])

    lab_modules = []
    extracted_labs = []

    for m_idx, mod in enumerate(modules):
        mod_id = str(mod.get("id") or uuid.uuid4())
        mod_title = (mod.get("title") or f"Module {m_idx + 1}").strip()
        mod_order = mod.get("order") if mod.get("order") is not None else (m_idx + 1)

        raw_sections = mod.get("sections") if "sections" in mod else mod.get("submodules", [])
        mod_lab_sections = []
        lab_idx_in_mod = 0

        for s_idx, sec in enumerate(raw_sections or []):
            if not is_lab_section(sec):
                continue

            lab_idx_in_mod += 1
            sec_id = str(sec.get("id") or sec.get("_id") or uuid.uuid4())
            sec_title = (sec.get("title") or sec.get("description") or f"Lab {mod_order}.{lab_idx_in_mod}").strip()
            sec_order = sec.get("order") if sec.get("order") is not None else (s_idx + 1)
            sec_slug = (sec.get("slug") or "").strip()
            content_md = (sec.get("content_md") or sec.get("content") or sec.get("lab_md") or "").strip()
            task_setting = sec.get("task_setting") or {}
            inst_md = (task_setting.get("instruction_md") or "").strip()

            # Extract chapter & part from slug (e.g. glpc-004-1), title (e.g. Lab 4.1), or nusactl command
            chapter = None
            part = None

            m_slug = re.match(r"^([a-zA-Z0-9_]+)-(\d+)-(\d+)$", sec_slug)
            if m_slug:
                chapter = m_slug.group(2).zfill(3)
                part = str(int(m_slug.group(3)))

            if not chapter or not part:
                m_title = re.search(r"Lab\s+(\d+)\.(\d+)", sec_title, re.IGNORECASE)
                if m_title:
                    chapter = m_title.group(1).zfill(3)
                    part = str(int(m_title.group(2)))

            if not chapter or not part:
                combined_md = f"{content_md}\n{inst_md}"
                m_cmd = re.search(r"nusactl\s+(?:start|grade|finish)\s+([a-zA-Z0-9_]+-(\d+)-(\d+))", combined_md)
                if m_cmd:
                    if not sec_slug:
                        sec_slug = m_cmd.group(1).strip()
                    chapter = m_cmd.group(2).zfill(3)
                    part = str(int(m_cmd.group(3)))

            if not chapter:
                chapter = str(sec.get("chapter") or mod_order).zfill(3)
            if not part:
                part = str(sec.get("part") or lab_idx_in_mod)

            if not sec_slug:
                sec_slug = resolve_nusactl_grade_slug(
                    {"chapter": chapter, "part": part},
                    course_slug=course_slug,
                    lab_md=content_md
                )

            export_id = str(sec.get("_id") or f"{course_slug}-lab-{sec_id}")

            lab_item = {
                "_id": export_id,
                "section_id": sec_id,
                "section_order": sec_order,
                "module_id": mod_id,
                "module_title": mod_title,
                "module_order": mod_order,
                "course": course_slug,
                "chapter": chapter,
                "part": part,
                "description": sec_title,
                "slug": sec_slug,
                "lab_md": content_md,
                "vars": sec.get("vars", {}),
                "start": sec.get("start", []),
                "finish": sec.get("finish", []),
                "grade": sec.get("grade", [])
            }
            mod_lab_sections.append(lab_item)
            extracted_labs.append(lab_item)

        if mod_lab_sections:
            lab_modules.append({
                "id": mod_id,
                "title": mod_title,
                "order": mod_order,
                "labs": mod_lab_sections
            })

    return course_slug, course_title, lab_modules, extracted_labs


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

    # If dict wrapped (like export-gitlab-fundamental), extract ONLY labs
    labs_list = []
    course_slug = override_course_slug or "dok8s"
    course_title = f"{course_slug.upper()} Course"

    if isinstance(parsed, list):
        labs_list = parsed
        if labs_list and not override_course_slug:
            course_slug = labs_list[0].get("course", "dok8s")
            course_title = f"{course_slug.upper()} Course"
    elif isinstance(parsed, dict):
        if "labs" in parsed:
            if not override_course_slug:
                course_slug = parsed.get("slug", "course")
                course_title = parsed.get("title", "Course")
            labs_list = parsed["labs"]
        elif "modules" in parsed:
            course_slug, course_title, _, labs_list = extract_labs_from_course_json(
                parsed, override_course_slug=override_course_slug
            )

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
            chapter = str(lab_obj.get("chapter", "001")).zfill(3)
            part = str(lab_obj.get("part", "1"))
            desc = lab_obj.get("description", f"Lab {chapter}.{part}")
            vars_json = json.dumps(lab_obj.get("vars", {}))
            start_json = json.dumps(lab_obj.get("start", []))
            finish_json = json.dumps(lab_obj.get("finish", []))
            slug = lab_obj.get("slug") or resolve_nusactl_grade_slug({"chapter": chapter, "part": part}, course_slug=course_slug)
            lab_md = lab_obj.get("lab_md")

            c.execute("SELECT id, lab_md FROM labs WHERE export_id = ?", (export_id,))
            existing = c.fetchone()

            if existing:
                lab_id = existing["id"]
                effective_md = lab_md if lab_md is not None else existing["lab_md"]
                c.execute("""
                    UPDATE labs SET
                        course_id = ?, chapter = ?, part = ?, description = ?,
                        vars_json = ?, start_json = ?, finish_json = ?, slug = ?, lab_md = ?
                    WHERE id = ?
                """, (course_id, chapter, part, desc, vars_json, start_json, finish_json, slug, effective_md, lab_id))
            else:
                lab_id = str(uuid.uuid4())
                c.execute("""
                    INSERT INTO labs (id, course_id, export_id, chapter, part, description, vars_json, start_json, finish_json, slug, modifiable_ok, lab_md)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """, (lab_id, course_id, export_id, chapter, part, desc, vars_json, start_json, finish_json, slug, lab_md))

            # Store / update grade cases
            cases = lab_obj.get("grade", [])
            if not cases and lab_md:
                c.execute("SELECT count(*) FROM grade_cases WHERE lab_id = ?", (lab_id,))
                if c.fetchone()[0] == 0:
                    cases = synthesize_cases_from_lab_md(lab_md)

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
        "course_slug": course_slug,
        "course_title": course_title,
        "labs_imported": len(labs_list),
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

def import_course_zip_and_grading(zip_data, grade_data=None, user_id="author"):
    """
    Imports a course package where:
    - Course is a .zip archive (containing export-*.json with modules & sections).
      Extracts ONLY the Lab sections (ignores non-lab theory & quizzes) and populates
      the `labs` table directly so they are immediately displayed in Courses Explorer & Run Console.
    - Grading is an optional .json file (containing labs, grade cases, start/finish)
      whose test cases are matched only to the Labs present in the Course ZIP.
    """
    if not zip_data and grade_data:
        return import_course_export(grade_data, user_id=user_id, apply_changes=True)

    # 1. Open the zip archive
    zfile = None
    if isinstance(zip_data, str):
        if os.path.exists(zip_data):
            zfile = zipfile.ZipFile(zip_data, 'r')
        else:
            # Assume base64 string (strip data URI prefix if present)
            try:
                b64_str = zip_data.split(",", 1)[1] if "," in zip_data and zip_data.strip().startswith("data:") else zip_data
                raw_bytes = base64.b64decode(b64_str)
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

    if not course_json_data or not isinstance(course_json_data, dict):
        return {"status": "error", "message": "No valid course JSON found inside the zip archive."}

    # Extract ONLY Lab sections from the course JSON
    course_slug, course_title, lab_modules, extracted_labs = extract_labs_from_course_json(course_json_data)

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

    # Build lookup of existing grading definitions (from current course or prefix-alias course like 'glpc')
    alias_prefix = COURSE_PREFIX_MAP.get(course_slug.lower().strip())
    candidate_course_ids = [course_id]
    alias_course_ids = []
    if alias_prefix and alias_prefix != course_slug:
        c.execute("SELECT id FROM courses WHERE slug = ?", (alias_prefix,))
        arow = c.fetchone()
        if arow:
            candidate_course_ids.append(arow["id"])
            alias_course_ids.append(arow["id"])

    existing_grade_by_slug = {}
    existing_grade_by_cp = {}

    for cid in candidate_course_ids:
        c.execute("SELECT * FROM labs WHERE course_id = ?", (cid,))
        for lrow in c.fetchall():
            ld = dict(lrow)
            c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (ld["id"],))
            gcases = [dict(gc) for gc in c.fetchall()]
            entry = {
                "export_id": ld["export_id"],
                "vars": json.loads(ld["vars_json"] or "{}"),
                "start": json.loads(ld["start_json"] or "[]"),
                "finish": json.loads(ld["finish_json"] or "[]"),
                "grade": gcases
            }
            lslug = (ld.get("slug") or "").strip()
            cp_key = (str(ld.get("chapter", "")).zfill(3), str(ld.get("part", "")))
            if lslug and (lslug not in existing_grade_by_slug or gcases):
                existing_grade_by_slug[lslug] = entry
            if cp_key not in existing_grade_by_cp or gcases:
                existing_grade_by_cp[cp_key] = entry

    # Also check optional grade_data if provided or found in scratch folder
    if not grade_data:
        scratch_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        scratch_parent = os.path.dirname(scratch_dir)
        for cp in [
            os.path.join(scratch_parent, "grade_export.json"),
            os.path.join(scratch_parent, "remediated_grade_export.json"),
            os.path.join(scratch_dir, "grade_export.json"),
        ]:
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
                parsed_grade = None
        if isinstance(parsed_grade, dict) and "labs" in parsed_grade:
            parsed_grade = parsed_grade["labs"]
        if isinstance(parsed_grade, list):
            for gitem in parsed_grade:
                if not isinstance(gitem, dict):
                    continue
                g_ch = str(gitem.get("chapter", "001")).zfill(3)
                g_pt = str(gitem.get("part", "1"))
                g_slug = (gitem.get("slug") or resolve_nusactl_grade_slug({"chapter": g_ch, "part": g_pt}, course_slug=course_slug)).strip()
                entry = {
                    "export_id": gitem.get("_id"),
                    "vars": gitem.get("vars", {}),
                    "start": gitem.get("start", []),
                    "finish": gitem.get("finish", []),
                    "grade": gitem.get("grade", [])
                }
                existing_grade_by_slug[g_slug] = entry
                existing_grade_by_cp[(g_ch, g_pt)] = entry

    # Clean up non-lab modules/submodules/quizzes for this course so ONLY Labs are stored
    c.execute("SELECT id FROM modules WHERE course_id = ?", (course_id,))
    old_mod_ids = [r["id"] for r in c.fetchall()]
    for omid in old_mod_ids:
        c.execute("SELECT id FROM submodules WHERE module_id = ?", (omid,))
        for osid in [r["id"] for r in c.fetchall()]:
            c.execute("DELETE FROM content_versions WHERE content_id = ?", (osid,))
        c.execute("DELETE FROM submodules WHERE module_id = ?", (omid,))
    c.execute("DELETE FROM modules WHERE course_id = ?", (course_id,))
    c.execute("DELETE FROM quiz_corrections WHERE update_text = 'Imported from course package'")

    # Insert ONLY modules that have Labs and ONLY Lab submodules
    modules_count = 0
    submodules_count = 0

    for mod in lab_modules:
        mod_id = mod["id"]
        mod_title = mod["title"]
        mod_order = mod["order"]

        c.execute("""
            INSERT OR REPLACE INTO modules (id, course_id, number, title, sort_order)
            VALUES (?, ?, ?, ?, ?)
        """, (mod_id, course_id, mod_order, mod_title, mod_order))
        modules_count += 1

        for lab_sec in mod["labs"]:
            sec_id = lab_sec["section_id"]
            sec_title = lab_sec["description"]
            sec_order = lab_sec["section_order"]
            content_md = lab_sec["lab_md"]

            c.execute("""
                INSERT OR REPLACE INTO submodules (id, module_id, title, sort_order)
                VALUES (?, ?, ?, ?)
            """, (sec_id, mod_id, sec_title, sec_order))
            submodules_count += 1

            if content_md:
                cv_id = f"cv_{sec_id}_id"
                c.execute("""
                    INSERT OR REPLACE INTO content_versions (id, content_id, language, body_markdown, state, author_id, created_at, outputs_verified, parity_ok)
                    VALUES (?, ?, 'id', ?, 'published', 'import_zip', ?, 1, 1)
                """, (cv_id, sec_id, content_md, now))

    # Populate `labs` and `grade_cases` tables with ONLY the Labs extracted from the ZIP
    kept_lab_ids = []
    labs_summary = []

    for lab_item in extracted_labs:
        chapter = lab_item["chapter"]
        part = lab_item["part"]
        desc = lab_item["description"]
        slug = lab_item["slug"]
        lab_md = lab_item["lab_md"]
        cp_key = (chapter, part)

        matched_grade = existing_grade_by_slug.get(slug) or existing_grade_by_cp.get(cp_key) or {}
        export_id = matched_grade.get("export_id") or lab_item["_id"]
        vars_dict = matched_grade.get("vars") or lab_item.get("vars") or {}
        start_list = matched_grade.get("start") or lab_item.get("start") or []
        finish_list = matched_grade.get("finish") or lab_item.get("finish") or []
        cases_list = matched_grade.get("grade") or lab_item.get("grade") or []

        if not cases_list and lab_md:
            cases_list = synthesize_cases_from_lab_md(lab_md)

        vars_json = json.dumps(vars_dict)
        start_json = json.dumps(start_list)
        finish_json = json.dumps(finish_list)

        # Find existing lab row by export_id or (course_id, chapter, part) or slug
        c.execute(
            "SELECT id FROM labs WHERE export_id = ? OR (course_id = ? AND chapter = ? AND part = ?) OR (course_id = ? AND slug = ?)",
            (export_id, course_id, chapter, part, course_id, slug)
        )
        existing_lab = c.fetchone()

        if existing_lab:
            lab_id = existing_lab["id"]
            c.execute("""
                UPDATE labs SET
                    course_id = ?, export_id = ?, chapter = ?, part = ?, description = ?,
                    vars_json = ?, start_json = ?, finish_json = ?, slug = ?, lab_md = ?
                WHERE id = ?
            """, (course_id, export_id, chapter, part, desc, vars_json, start_json, finish_json, slug, lab_md, lab_id))
        else:
            lab_id = str(uuid.uuid4())
            c.execute("""
                INSERT INTO labs (id, course_id, export_id, chapter, part, description, vars_json, start_json, finish_json, slug, modifiable_ok, lab_md)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """, (lab_id, course_id, export_id, chapter, part, desc, vars_json, start_json, finish_json, slug, lab_md))

        kept_lab_ids.append(lab_id)

        # Replace grade_cases for this lab with the matched/synthesized cases
        c.execute("DELETE FROM grade_cases WHERE lab_id = ? AND case_index > ?", (lab_id, len(cases_list)))
        for idx, case in enumerate(cases_list):
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
                c.execute("""
                    INSERT INTO grade_cases (id, lab_id, case_index, name, cmd, expect, hint, debug, log_cmd)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (str(uuid.uuid4()), lab_id, case_idx, case_name, cmd, expect, hint, debug, log_cmd))

        labs_summary.append({
            "id": lab_id,
            "chapter": chapter,
            "part": part,
            "slug": slug,
            "description": desc,
            "cases_count": len(cases_list)
        })

    # Remove any labs under course_id (or redundant alias course) that are NOT in kept_lab_ids
    if kept_lab_ids:
        placeholders = ",".join("?" for _ in kept_lab_ids)
        c.execute(f"SELECT id FROM labs WHERE course_id = ? AND id NOT IN ({placeholders})", [course_id] + kept_lab_ids)
        stale_ids = [r["id"] for r in c.fetchall()]
        for sid in stale_ids:
            c.execute("DELETE FROM grade_cases WHERE lab_id = ?", (sid,))
            c.execute("DELETE FROM labs WHERE id = ?", (sid,))

        for acid in alias_course_ids:
            c.execute(f"SELECT id FROM labs WHERE course_id = ? AND id NOT IN ({placeholders})", [acid] + kept_lab_ids)
            for sid in [r["id"] for r in c.fetchall()]:
                c.execute("DELETE FROM grade_cases WHERE lab_id = ?", (sid,))
                c.execute("DELETE FROM labs WHERE id = ?", (sid,))
            c.execute("SELECT count(*) FROM labs WHERE course_id = ?", (acid,))
            if c.fetchone()[0] == 0:
                c.execute("DELETE FROM courses WHERE id = ?", (acid,))

    conn.commit()
    conn.close()

    log_activity(user_id, "import_zip_and_grade", "course", course_slug, None, {
        "modules": modules_count,
        "labs_imported": len(kept_lab_ids)
    })

    return {
        "status": "success",
        "course": course_slug,
        "course_slug": course_slug,
        "course_title": course_title,
        "modules_imported": modules_count,
        "submodules_imported": submodules_count,
        "quizzes_imported": 0,
        "labs_imported": len(kept_lab_ids),
        "labs": labs_summary
    }
