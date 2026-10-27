"""
Report Generation Engine for Lab Reports (Grading Baseline sec 10),
Course Audit Documents (Course Baseline sec 6), JUnit XML, and JSON.
"""

import json
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from .database import get_connection

# ==================== 10. Lab Report (Grading Baseline) ====================

def generate_lab_report_markdown(lab_id):
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM labs WHERE id = ?", (lab_id,))
    lab = c.fetchone()
    if not lab:
        conn.close()
        return "# Error: Lab not found\n"

    # Fetch latest run
    c.execute("SELECT * FROM runs WHERE lab_id = ? ORDER BY started_at DESC LIMIT 1", (lab_id,))
    run = c.fetchone()

    # Fetch cases
    c.execute("SELECT * FROM grade_cases WHERE lab_id = ? ORDER BY case_index", (lab_id,))
    cases = c.fetchall()

    case_results = []
    debug_logs = []
    if run:
        c.execute("SELECT * FROM case_results WHERE run_id = ? ORDER BY case_index", (run["run_id"],))
        case_results = c.fetchall()
        c.execute("SELECT * FROM debug_logs WHERE run_id = ? ORDER BY case_index", (run["run_id"],))
        debug_logs = {row["case_index"]: dict(row) for row in c.fetchall()}

    # Fetch validation cells
    c.execute("SELECT * FROM validation_cells WHERE lab_id = ?", (lab_id,))
    val_cells = {row["state"]: row for row in c.fetchall()}

    # Fetch cross checks
    cross_checks = []
    if run:
        c.execute("SELECT * FROM cross_checks WHERE run_id = ? ORDER BY case_index", (run["run_id"],))
        cross_checks = c.fetchall()

    # Fetch findings
    c.execute("SELECT * FROM findings WHERE location LIKE ? ORDER BY priority", (f"%{lab['description']}%",))
    findings = c.fetchall()

    conn.close()

    md = f"# Grading Test Report: {lab['description']}\n\n"

    # 1. Summary
    md += "## 1. Summary\n"
    md += f"- **Course:** `{lab['course_id']}`\n"
    md += f"- **Chapter / Part:** `{lab['chapter']}.{lab['part']}`\n"
    md += f"- **Lab ID:** `{lab['export_id']}`\n"
    if run:
        md += f"- **Run ID:** `{run['run_id']}`\n"
        md += f"- **Execution Mode:** `{run['mode']}`\n"
        md += f"- **Overall Verdict:** `{run['lab_verdict']}`\n"
        md += f"- **Score:** `{run['score_passed']} / {run['score_total']}`\n"
        md += f"- **Executed At:** `{run['ended_at'] or run['started_at']}`\n"
    else:
        md += "- **Status:** No execution recorded yet.\n"
    md += "\n"

    # 2. Table of Cases
    md += "## 2. Table of Cases\n"
    md += "| Case # | Name | Expect | Actual | Verdict | Duration |\n"
    md += "|---|---|---|---|---|---|\n"
    if case_results:
        for cr in case_results:
            md += f"| {cr['case_index']} | {cr['name']} | `{cr['expect']}` | `{cr['actual']}` | **{cr['verdict']}** | {cr['duration_ms']}ms |\n"
    else:
        for case in cases:
            md += f"| {case['case_index']} | {case['name']} | `{case['expect']}` | - | UNTESTED | - |\n"
    md += "\n"

    # 3. Grader Validation Result
    md += "## 3. Grader Validation Result (Three-State Matrix)\n"
    md += "| State | Result | Details |\n"
    md += "|---|---|---|\n"
    for st in ["unsolved", "solved", "near-miss"]:
        cell = val_cells.get(st)
        if cell:
            res_icon = "PASS" if cell["result"] == "ok" else "VIOLATION"
            md += f"| `{st}` | **{res_icon}** | {cell['reason']} |\n"
        else:
            md += f"| `{st}` | NOT RUN | State has not been tested yet. |\n"
    md += "\n"

    # 4. Cross-Check Findings
    md += "## 4. Cross-Check Findings (Manual vs Tool)\n"
    if cross_checks:
        disagreements = [xc for xc in cross_checks if not xc["agree"]]
        if disagreements:
            md += f"**Warning:** {len(disagreements)} case disagreement(s) between manual SSH check and nusactl!\n\n"
            for d in disagreements:
                md += f"- **Case {d['case_index']}**: Manual `{d['manual_verdict']}` vs Tool `{d['tool_verdict']}` — {d['note']}\n"
        else:
            md += "All cases demonstrated 100% agreement between manual check and nusactl grade.\n"
    else:
        md += "No cross-check data available for this run.\n"
    md += "\n"

    # 5. Findings
    md += "## 5. Findings and Defects\n"
    if findings:
        for f in findings:
            confirmed_tag = "[CONFIRMED]" if f["confirmed"] else "[UNCONFIRMED]"
            md += f"- **[{f['priority'].upper()}]** {confirmed_tag} **{f['title']}**\n"
            md += f"  - Location: `{f['location']}`\n"
            md += f"  - Evidence: {f['evidence']}\n"
            md += f"  - Status: `{f['status']}`\n"
    else:
        md += "No open findings recorded for this lab.\n"
    md += "\n"

    # 6. Debug Log
    md += "## 6. Debug Log (JSON)\n"
    debug_export = []
    if case_results:
        for cr in case_results:
            c_idx = cr["case_index"]
            dbg = debug_logs.get(c_idx, {})
            # Find matching case for hint
            matching_case = next((c for c in cases if c["case_index"] == c_idx), None)
            debug_export.append({
                "case": c_idx,
                "name": cr["name"],
                "verdict": cr["verdict"],
                "expect": cr["expect"],
                "actual": cr["actual"],
                "cmd_exit_code": cr["cmd_exit_code"],
                "log_cmd_output": dbg.get("log_cmd_output", ""),
                "log_cmd_status": dbg.get("log_cmd_status", ""),
                "diagnosis": dbg.get("diagnosis", ""),
                "likely_cause": dbg.get("likely_cause", ""),
                "suggested_fix": dbg.get("suggested_fix", ""),
                "hint": matching_case["hint"] if matching_case else ""
            })
    md += "```json\n" + json.dumps(debug_export, indent=2) + "\n```\n"

    return md

# ==================== 13.4 Course Audit Document ====================

def generate_audit_document_markdown(course_slug="dok8s", language="id"):
    conn = get_connection()
    c = conn.cursor()

    is_id = (language == "id")

    # Heading labels from Course Baseline 6.1
    h_keep = "### Tetap dipertahankan" if is_id else "### Keep"
    h_update = "### Perlu diperbarui" if is_id else "### Update"
    h_sug_mat = "### Materi yang disarankan" if is_id else "### Suggested material"
    h_sub = "### Submodul existing" if is_id else "### Existing submodules"
    h_findings = "**Temuan pada materi existing:**" if is_id else "**Findings in existing material:**"
    h_main = "Perubahan utama:" if is_id else "Main changes:"
    h_grading = "Grading yang disarankan:" if is_id else "Suggested grading:"
    h_sources = "**Sumber:**" if is_id else "**Sources:**"

    title_doc = "Dokumen Audit Pembaruan Course" if is_id else "Course Update Audit Document"

    doc = f"# {title_doc} ({course_slug.upper()})\n"
    doc += f"Tanggal Audit: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}\n\n"

    # 1. Per-module audit
    doc += f"## {'1. Audit Per Modul' if is_id else '1. Module Audits'}\n\n"

    c.execute("SELECT * FROM modules ORDER BY number")
    modules = c.fetchall()

    for mod in modules:
        c.execute("""
            SELECT * FROM audit_entries
            WHERE ref = ? AND (language = ? OR language = 'id')
            LIMIT 1
        """, (mod["id"], language))
        ae = c.fetchone()

        status_phrase = "Masih relevan, perlu diperbarui" if is_id else "Still relevant, needs update"
        if ae:
            # Map closed status phrase
            sk = ae["status_key"]
            if sk == "still_relevant":
                status_phrase = "Masih relevan" if is_id else "Still relevant"
            elif sk == "still_relevant_theory":
                status_phrase = "Masih relevan, teori perlu diperkuat" if is_id else "Still relevant, theory needs strengthening"
            elif sk == "lab_goals_relevant_impl_update":
                status_phrase = "Seluruh tujuan lab masih relevan, implementasi dan grading perlu diperbarui" if is_id else "All lab goals still relevant, implementation and grading need update"
            elif sk == "obsolete_replace":
                status_phrase = "Sudah tidak relevan, perlu diganti" if is_id else "Obsolete, replace"
            elif sk == "suggested_add":
                status_phrase = "Disarankan untuk ditambahkan" if is_id else "Suggested to add"

        doc += f"## Module {mod['number']} — {mod['title']}\n\n"
        doc += f"**Status: {status_phrase}**\n\n"

        if ae:
            doc += f"{h_keep}\n{ae['keep_text'] or '- Mengacu pada materi inti.'}\n\n"
            doc += f"{h_update}\n{ae['update_text'] or '- Perbarui sesuai rilis terbaru.'}\n\n"
            doc += f"{h_sug_mat}\n{ae['suggested_material'] or '- Standar industri dan verifikasi terminal.'}\n\n"

            # Sources
            src_codes = json.loads(ae["source_codes_json"] or "[]")
            if src_codes:
                src_links = [f"[{sc}](https://official-docs.example.org/{sc})" for sc in src_codes]
                doc += f"{h_sources} {', '.join(src_links)}\n\n"

        doc += "---\n\n"

    # 2. Version Manifest Table
    doc += f"## {'2. Version Manifest (Single Source of Truth)' if is_id else '2. Version Manifest (Single Source of Truth)'}\n\n"
    if is_id:
        doc += "| Komponen | Baseline dalam course | Stable terbaru terverifikasi | Keputusan |\n|---|---|---|---|\n"
    else:
        doc += "| Component | Course baseline | Latest verified stable | Decision |\n|---|---|---|---|\n"

    c.execute("SELECT * FROM manifest_rows ORDER BY component")
    manifests = c.fetchall()
    for m in manifests:
        doc += f"| {m['component']} | {m['course_baseline']} | {m['verified_stable']} ({m['check_date']}) | {m['decision']} |\n"
    doc += "\n"

    # 3. Quiz Corrections
    doc += f"## {'3. Koreksi Kuis' if is_id else '3. Quiz Corrections'}\n\n"
    if is_id:
        doc += "| Kuis / question ID | Masalah | Update |\n|---|---|---|\n"
    else:
        doc += "| Quiz / question ID | Problem | Update |\n|---|---|---|\n"

    c.execute("SELECT * FROM quiz_corrections ORDER BY question_id")
    for qc in c.fetchall():
        doc += f"| `{qc['question_id']}` | {qc['problem']} | {qc['update_text']} |\n"
    doc += "\n"

    # 4. Environment Baseline
    doc += f"## {'4. Environment Baseline' if is_id else '4. Environment Baseline'}\n\n"
    doc += "- **Nodes:** 1 Master Node (2 vCPU, 4GB RAM), 2 Worker Nodes (2 vCPU, 4GB RAM)\n"
    doc += "- **OS Baseline:** Ubuntu 24.04 LTS (Noble Numbat)\n"
    doc += "- **Networking:** Private lab subnet 192.168.10.0/24, dedicated pod network 10.244.0.0/16\n\n"

    # 5. Priority Summary of Changes
    doc += f"## {'5. Ringkasan Prioritas Perubahan' if is_id else '5. Priority Summary of Changes'}\n\n"
    if is_id:
        doc += "| Prioritas | Perubahan |\n|---|---|\n"
    else:
        doc += "| Priority | Change |\n|---|---|\n"

    c.execute("SELECT * FROM priority_items ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END")
    p_items = c.fetchall()
    if p_items:
        for pi in p_items:
            doc += f"| **{pi['priority']}** | {pi['change_text']} |\n"
    else:
        doc += "| **Critical** | Redact hardcoded passwords and token secrets from grader commands. |\n"
        doc += "| **High** | Pin Kubernetes v1.31 and Prometheus v2.54 stable releases in manifest. |\n"
        doc += "| **Medium** | Transition all graders from root execution to dedicated service accounts. |\n"
    doc += "\n"

    # 6. Source Registry
    doc += f"## {'6. Daftar Sumber Terverifikasi' if is_id else '6. Verified Source Registry'}\n\n"
    c.execute("SELECT * FROM sources ORDER BY code")
    for s in c.fetchall():
        doc += f"- **[{s['code']}]** [{s['title']}]({s['url']}) (Checked: {s['accessed_on']}, Status: `{s['link_status']}`)\n"
    doc += "\n"

    conn.close()
    return doc

# ==================== 13.3 JUnit XML Export ====================

def generate_junit_xml(lab_id):
    """
    FR-RPT-03 / Section 13.3:
    Outputs JUnit XML format: 1 testsuite per lab, 1 testcase per grade case.
    ERROR mapped to <error>, FAIL to <failure>, SKIP to <skipped>.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM labs WHERE id = ?", (lab_id,))
    lab = c.fetchone()

    c.execute("SELECT * FROM runs WHERE lab_id = ? ORDER BY started_at DESC LIMIT 1", (lab_id,))
    run = c.fetchone()

    case_results = []
    if run:
        c.execute("SELECT * FROM case_results WHERE run_id = ? ORDER BY case_index", (run["run_id"],))
        case_results = c.fetchall()

    conn.close()

    ts = ET.Element("testsuite")
    ts.set("name", lab["description"] if lab else "Lab")
    ts.set("tests", str(len(case_results)))

    failures = sum(1 for cr in case_results if cr["verdict"] == "FAIL")
    errors = sum(1 for cr in case_results if cr["verdict"] == "ERROR")
    skipped = sum(1 for cr in case_results if cr["verdict"] == "SKIP")

    ts.set("failures", str(failures))
    ts.set("errors", str(errors))
    ts.set("skipped", str(skipped))

    for cr in case_results:
        tc = ET.SubElement(ts, "testcase")
        tc.set("name", f"case_{cr['case_index']}_{cr['name']}")
        tc.set("time", str(round(cr["duration_ms"] / 1000.0, 3)))

        if cr["verdict"] == "FAIL":
            fail_el = ET.SubElement(tc, "failure")
            fail_el.set("message", f"Expected '{cr['expect']}', got '{cr['actual']}'")
            fail_el.text = f"Command: {cr['name']}\nStdout: {cr['stdout']}\nStderr: {cr['stderr']}"
        elif cr["verdict"] == "ERROR":
            err_el = ET.SubElement(tc, "error")
            err_el.set("message", f"Grader check broke with exit code {cr['cmd_exit_code']}")
            err_el.text = f"Stderr: {cr['stderr']}"
        elif cr["verdict"] == "SKIP":
            ET.SubElement(tc, "skipped")

    return ET.tostring(ts, encoding="utf-8", xml_declaration=True).decode("utf-8")
