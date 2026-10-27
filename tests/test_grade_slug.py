import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.ai_agent import resolve_nusactl_grade_slug
from backend.run_engine import run_lab
from backend.database import init_db, get_connection

class TestGradeSlugResolution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_custom_slug_override(self):
        lab = {"chapter": "001", "part": "1"}
        slug = resolve_nusactl_grade_slug(lab, custom_slug="custom-lab-999-1")
        self.assertEqual(slug, "custom-lab-999-1")

    def test_extract_slug_from_lab_md(self):
        lab = {"chapter": "004", "part": "1"}
        md = """
### Persiapan
```console
$ nusactl login
$ nusactl start glpc-004-1
```
"""
        slug = resolve_nusactl_grade_slug(lab, lab_md=md)
        self.assertEqual(slug, "glpc-004-1")

    def test_course_slug_mapping(self):
        # gitlab-fundamental -> glpc
        lab = {"chapter": "001", "part": "1"}
        slug = resolve_nusactl_grade_slug(lab, course_slug="gitlab-fundamental")
        self.assertEqual(slug, "glpc-001-1")

        # dok8s -> dok8s
        lab = {"chapter": "002", "part": "2"}
        slug = resolve_nusactl_grade_slug(lab, course_slug="dok8s")
        self.assertEqual(slug, "dok8s-002-2")

        # gladm -> gladm
        lab = {"chapter": "003", "part": "1"}
        slug = resolve_nusactl_grade_slug(lab, course_slug="gladm")
        self.assertEqual(slug, "gladm-003-1")

    def test_tool_grade_sse_events(self):
        lab = {
            "id": "test-lab-1",
            "export_id": "test-lab-1",
            "chapter": "001",
            "part": "1",
            "course": "glpc",
            "description": "Test Lab",
            "vars": {},
            "start": [],
            "finish": [],
            "grade": []
        }
        target = {
            "id": "mock-target",
            "host": "localhost",
            "user": "student",
            "password": "",
            "port": 22
        }

        events = []
        def callback(event_type, payload):
            events.append((event_type, payload))

        # Run solved
        run_lab(
            run_id="test-run-solved",
            target=target,
            lab=lab,
            state="solved",
            event_callback=callback,
            grade_slug="glpc-001-1"
        )

        event_types = [e[0] for e in events]
        self.assertIn("tool_grade_start", event_types)
        self.assertIn("tool_grade_complete", event_types)

        start_event = next(e[1] for e in events if e[0] == "tool_grade_start")
        self.assertEqual(start_event["cmd"], "nusactl grade glpc-001-1")

        complete_event = next(e[1] for e in events if e[0] == "tool_grade_complete")
        self.assertEqual(complete_event["verdict"], "PASS")
        self.assertEqual(complete_event["exit_code"], 0)

    def test_glpc_005_instruction_extraction(self):
        from backend.ai_agent import extract_instructions_from_lab_md
        md = """
### Persiapan
```console
$ nusactl login
$ nusactl start glpc-005-1
```
## Instruksi
1. Clone
```console
$ git clone https://gitlab.com/afriansyah77/dasar-git-2.git
$ cd dasar-git-2
```
2. Branch
```console
$ git checkout -b [USERNAME_ADINUSA]
$ git branch
```
3. Edit
```console
$ nano README.md
```
```bash
Baris ini dibuat oleh [USERNAME_ADINUSA] di branch USERNAME_ADINUSA
```
4. Push
```console
$ git status
$ git add .
$ git commit -m "Mengedit file README.md"
$ git push origin [USERNAME_ADINUSA]
```
Catatan:
- username: afriansyah77
- access token: glpat-ywD3Mtt1tEsTnoxOVHVil286MQp1Ojh6c2lvCw.01.121rppqyu
"""
        steps = extract_instructions_from_lab_md(md, target={"nusactl_username": "afifr", "user": "student"})
        cmds = [s["raw_cmd"] for s in steps]
        
        # Verify nano replaced with cat << 'EOF' > README.md
        nano_cat = next((c for c in cmds if "cat << 'EOF' > README.md" in c), None)
        self.assertIsNotNone(nano_cat, "nano README.md should be converted to cat << 'EOF' > README.md")
        self.assertIn("Baris ini dibuat oleh afifr di branch afifr", nano_cat)

        # Verify git checkout -B
        co_cmd = next((c for c in cmds if "git checkout" in c), None)
        self.assertIsNotNone(co_cmd)
        self.assertIn("afifr", co_cmd)
        self.assertNotIn("[USERNAME_ADINUSA]", co_cmd)

        # Verify git push has AUTH_URL
        push_cmd = next((c for c in cmds if "git push" in c), None)
        self.assertIsNotNone(push_cmd)
        self.assertIn("afriansyah77:glpat-ywD3Mtt1tEsTnoxOVHVil286MQp1Ojh6c2lvCw.01.121rppqyu", push_cmd)
        self.assertIn("origin afifr", push_cmd)

if __name__ == "__main__":
    unittest.main()
