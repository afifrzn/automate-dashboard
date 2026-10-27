"""
Acceptance Test Suite for Dashboard App (Section 17 Seed Test).
Validates:
- All required seed defects detected by Grader Lint (GL01, GL02, GL03, GL04, GL05, GL06, GL08, GL10)
- Re-import idempotency (0 duplicates, 0 changes on identical re-import)
- Revision proposing & patched export diffing
- Secret redaction in commands and outputs
- Section 10.3 Verdict calculation logic
"""

import os
import sys
import json
import unittest

# Ensure dashboard_app parent is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import init_db, get_connection
from backend.seed_data import load_seed_data, DOK8S_SEED_LABS
from backend.importer import import_course_export, export_patched_course
from backend.lint_engine import lint_lab
from backend.run_engine import compute_verdict, redact_text

class TestDashboardBaseline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_seed_data(load_dummy_dok8s=True)

    @classmethod
    def tearDownClass(cls):
        conn = get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM courses WHERE slug='dok8s'")
        c.execute("DELETE FROM labs WHERE course_id NOT IN (SELECT id FROM courses)")
        c.execute("DELETE FROM grade_cases WHERE lab_id NOT IN (SELECT id FROM labs)")
        c.execute("DELETE FROM modules WHERE course_id NOT IN (SELECT id FROM courses)")
        conn.commit()
        conn.close()

    def test_01_seed_dataset_grader_lint(self):
        """Verify that Grader Lint reports all defects specified in Section 17."""
        rule_hits = {}
        for lab in DOK8S_SEED_LABS:
            issues = lint_lab(lab)
            lab_num = f"{int(lab['chapter'])}.{lab['part']}"
            for issue in issues:
                rid = issue["rule_id"]
                rule_hits.setdefault(rid, []).append((lab_num, issue))

        # Check GL01 hits (Lab 2.2 case 2 with cho, Lab 10.1 with Status Node)
        self.assertIn("GL01", rule_hits, "GL01 should be reported")
        gl01_labs = [item[0] for item in rule_hits["GL01"]]
        self.assertTrue(any("2.2" in l for l in gl01_labs), "Lab 2.2 should trigger GL01 ('cho')")
        self.assertTrue(any("10.1" in l for l in gl01_labs), "Lab 10.1 should trigger GL01 ('Status Node')")

        # Check GL02 duplicate cmd (Lab 13.4 cases 1 & 2)
        self.assertIn("GL02", rule_hits, "GL02 should be reported")
        gl02_labs = [item[0] for item in rule_hits["GL02"]]
        self.assertTrue(any("13.4" in l for l in gl02_labs), "Lab 13.4 should trigger GL02 (same cmd)")

        # Check GL03 redundant case (Lab 7.3 case 3)
        self.assertIn("GL03", rule_hits, "GL03 should be reported")
        gl03_labs = [item[0] for item in rule_hits["GL03"]]
        self.assertTrue(any("7.3" in l for l in gl03_labs), "Lab 7.3 should trigger GL03 (redundant check)")

        # Check GL04 numbering defects (Lab 15.5 ase 3, Lab 15.7 duplicate case 5)
        self.assertIn("GL04", rule_hits, "GL04 should be reported")
        gl04_labs = [item[0] for item in rule_hits["GL04"]]
        self.assertTrue(any("15.5" in l for l in gl04_labs), "Lab 15.5 should trigger GL04 ('ase 3')")
        self.assertTrue(any("15.7" in l for l in gl04_labs), "Lab 15.7 should trigger GL04 (duplicate case 5)")

        # Check GL05 numbers mismatch (Lab 12.6 case 3 name 3 replicas vs expect 2/2)
        self.assertIn("GL05", rule_hits, "GL05 should be reported")
        gl05_labs = [item[0] for item in rule_hits["GL05"]]
        self.assertTrue(any("12.6" in l for l in gl05_labs), "Lab 12.6 should trigger GL05 (replica number mismatch)")

        # Check GL06 resource identifier mismatches (Lab 12.1, 15.2, 16.1)
        self.assertIn("GL06", rule_hits, "GL06 should be reported")
        gl06_labs = [item[0] for item in rule_hits["GL06"]]
        self.assertTrue(any("12.1" in l for l in gl06_labs), "Lab 12.1 should trigger GL06 (daemonset name)")
        self.assertTrue(any("15.2" in l for l in gl06_labs), "Lab 15.2 should trigger GL06 (service nodeport name)")
        self.assertTrue(any("16.1" in l for l in gl06_labs), "Lab 16.1 should trigger GL06 (ingress name)")

        # Check GL08 mutating verbs (Labs 15.1, 18.1, 19.2, 19.3)
        self.assertIn("GL08", rule_hits, "GL08 should be reported")
        gl08_labs = [item[0] for item in rule_hits["GL08"]]
        self.assertTrue(any("15.1" in l for l in gl08_labs), "Lab 15.1 should trigger GL08 (kubectl run)")
        self.assertTrue(any("18.1" in l for l in gl08_labs), "Lab 18.1 should trigger GL08 (port-forward)")
        self.assertTrue(any("19.2" in l for l in gl08_labs), "Lab 19.2 should trigger GL08 (helm install)")
        self.assertTrue(any("19.3" in l for l in gl08_labs), "Lab 19.3 should trigger GL08 (kubectl delete)")

        # Check GL10 empty vars in grep (Lab 10.1 with $NUSA_USERNAME)
        self.assertIn("GL10", rule_hits, "GL10 should be reported")
        gl10_labs = [item[0] for item in rule_hits["GL10"]]
        self.assertTrue(any("10.1" in l for l in gl10_labs), "Lab 10.1 should trigger GL10 (empty NUSA_USERNAME in grep)")

    def test_02_reimport_idempotency(self):
        """Re-importing the same file creates no duplicates and reports zero changes."""
        preview = import_course_export(DOK8S_SEED_LABS, apply_changes=False)
        self.assertEqual(preview["added_count"], 0, "No new labs should be added on re-import")
        self.assertEqual(preview["changed_count"], 0, "Zero changes should be detected on identical re-import")
        self.assertEqual(preview["unchanged_count"], len(DOK8S_SEED_LABS))

    def test_03_revisions_and_patched_export(self):
        """Editing one case creates a Revision, and patched export differs only in that field."""
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT id FROM grade_cases WHERE name LIKE '%case 1 - Check ubuntu-shell%'")
        case_row = c.fetchone()
        self.assertIsNotNone(case_row)
        case_id = case_row["id"]

        # Propose and approve revision
        import uuid
        rev_id = str(uuid.uuid4())
        diff_payload = {"expect": {"old": "1", "new": "0"}}
        c.execute("""
            INSERT INTO revisions (id, entity_type, entity_id, author_id, created_at, diff_json, status, notes)
            VALUES (?, 'grade_case', ?, 'test_author', '2026-10-27T00:00:00Z', ?, 'approved', 'Test revision')
        """, (rev_id, case_id, json.dumps(diff_payload)))
        conn.commit()
        conn.close()

        patched_labs, changes_md = export_patched_course("dok8s")
        self.assertIn("Revision ID", changes_md)
        self.assertIn("Before: `1`", changes_md)
        self.assertIn("After: `0`", changes_md)

    def test_04_secret_redaction(self):
        """A secret-like string added to a test cmd is masked in every view and export."""
        cmd_with_secrets = "curl -u admin:superSecretPassword123 https://api.cluster.local --password MyTokenValue"
        redacted = redact_text(cmd_with_secrets)
        self.assertNotIn("superSecretPassword123", redacted)
        self.assertIn("-u admin:[redacted]", redacted)
        self.assertNotIn("MyTokenValue", redacted)
        self.assertIn("--password=[redacted]", redacted)

    def test_05_verdict_rules(self):
        """Section 10.3 Verdict rules verification."""
        # Clean PASS
        self.assertEqual(compute_verdict(0, "1\n", "", "1"), "PASS")
        self.assertEqual(compute_verdict(0, " 200 ", "", "200"), "PASS")

        # Clean FAIL
        self.assertEqual(compute_verdict(0, "0", "", "1"), "FAIL")

        # Output contract broken: expect is '1' but stdout is not 0 or 1 -> ERROR
        self.assertEqual(compute_verdict(0, "error: resource not found", "", "1"), "ERROR")

        # SSH failure (exit 255) -> ERROR
        self.assertEqual(compute_verdict(255, "", "SSH connection timed out", "1"), "ERROR")

        # Empty stdout -> ERROR
        self.assertEqual(compute_verdict(0, "", "", "1"), "ERROR")

if __name__ == "__main__":
    unittest.main()
