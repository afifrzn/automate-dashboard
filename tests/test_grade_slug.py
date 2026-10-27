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

if __name__ == "__main__":
    unittest.main()
