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

    def test_synthesize_cases_from_lab_md(self):
        from backend.ai_agent import synthesize_cases_from_lab_md
        md = """
1. Clone
```console
$ git clone https://gitlab.com/example/demo.git
$ cd demo
```
2. Branch
```console
$ git checkout -b feature-test
```
3. Edit
```console
$ nano config.yaml
```
4. Commit & Push
```console
$ git add .
$ git commit -m "Add config"
$ git push origin feature-test
```
"""
        cases = synthesize_cases_from_lab_md(md, target={"nusactl_username": "afifr"})
        self.assertTrue(len(cases) >= 2)
        names = [c["name"] for c in cases]
        self.assertTrue(any("branch" in n.lower() for n in names))
        self.assertTrue(any("config.yaml" in n.lower() for n in names))

    def test_4step_automated_pipeline_execution(self):
        from backend.run_engine import run_lab
        lab = {
            "id": "test-lab-4step",
            "export_id": "test-lab-4step",
            "chapter": "005",
            "part": "1",
            "course": "glpc",
            "description": "Test 4-Step Pipeline",
            "vars": {},
            "start": [],
            "finish": [],
            "grade": [],
            "lab_md": """
```console
$ nusactl login
$ nusactl start glpc-005-1
$ cd ~
$ mkdir -p dasar-git-2 && cd dasar-git-2
$ echo "Hello" > README.md
```
"""
        }
        target = {
            "id": "mock-vm",
            "host": "mock",
            "user": "student",
            "password": "",
            "port": 22
        }

        events = []
        def callback(event_type, payload):
            events.append((event_type, payload))

        result = run_lab(
            run_id="test-run-4step",
            target=target,
            lab=lab,
            workflow="4step",
            event_callback=callback,
            grade_slug="glpc-005-1"
        )

        event_types = [e[0] for e in events]
        self.assertIn("pipeline_stage_start", event_types)
        self.assertIn("baseline_grade_complete", event_types)
        self.assertIn("ai_instructions_complete", event_types)
        self.assertIn("manual_grade_complete", event_types)
        self.assertIn("tool_grade_complete", event_types)
        self.assertIn("pipeline_complete", event_types)

        stages = [e[1]["stage"] for e in events if e[0] == "pipeline_stage_start"]
        self.assertEqual(stages, [1, 2, 3, 4])

        pipe_complete = next(e[1] for e in events if e[0] == "pipeline_complete")
        self.assertEqual(pipe_complete["workflow"], "4step")
        self.assertEqual(pipe_complete["stage_1_baseline"]["verdict"], "FAIL")
        self.assertEqual(pipe_complete["stage_3_manual"]["verdict"], "PASS")
        self.assertEqual(pipe_complete["stage_4_tool"]["verdict"], "PASS")
        self.assertEqual(pipe_complete["final_verdict"], "PASS")

    def test_dynamic_non_hardcoded_grader(self):
        """Verify that grade cases are completely dynamic and not overridden by hardcoded blocks."""
        custom_cases = [
            {
                "case_index": 1,
                "name": "case 1 - Custom Dynamic Check Alpha",
                "cmd": "echo 'alpha-ok'",
                "expect": "alpha-ok"
            },
            {
                "case_index": 2,
                "name": "case 2 - Custom Dynamic Check Beta",
                "cmd": "echo 'beta-ok'",
                "expect": "beta-ok"
            }
        ]
        lab = {
            "id": "dynamic-lab-01",
            "export_id": "dynamic-lab-01",
            "chapter": "005",
            "part": "1",
            "course": "glpc",
            "description": "Dynamic Grader Test",
            "vars": {},
            "start": [],
            "finish": [],
            "grade": custom_cases,
            "lab_md": "```console\n$ echo dynamic\n```"
        }
        target = {
            "id": "mock-vm",
            "host": "mock",
            "user": "student"
        }

        events = []
        def callback(event_type, payload):
            events.append((event_type, payload))

        run_lab(
            run_id="test-run-dynamic",
            target=target,
            lab=lab,
            workflow="4step",
            event_callback=callback,
            grade_slug="glpc-005-1"
        )

        # Confirm exactly our 2 custom cases ran in manual grade stage
        case_starts = [e[1]["name"] for e in events if e[0] == "case_start"]
        self.assertEqual(case_starts, [
            "case 1 - Custom Dynamic Check Alpha",
            "case 2 - Custom Dynamic Check Beta"
        ])

    def test_challenge_lab_requirements_solver(self):
        """Verify that a Challenge Lab without step-by-step instructions is solved from Requirements."""
        from backend.ai_agent import is_challenge_lab, extract_instructions_from_lab_md, synthesize_cases_from_lab_md

        challenge_md = """
### Persiapan
```console
$ nusactl login
$ nusactl start glpc-009-5
```

### Challenge
Pada lab ini Anda diminta membangun alur kerja rilis aplikasi secara end-to-end menggunakan Git dan GitLab tanpa panduan langkah demi langkah.

### Challenge Requirements
Repository harus memiliki remote bernama:
```
origin
```
dan terhubung ke repository GitLab dengan nama proyek:
```
GitLab-<mark style="background-color:yellow;">username</mark>-Challenge
```
Struktur awal proyek pada branch `main` harus memiliki file berikut:
```
index.html
app.js
README.md
VERSION
```
Isi file `VERSION` dengan nilai awal:
```
0.1.0
```
Pastikan file `index.html` memiliki judul halaman:
```
GitLab Release Challenge
```
dan sebuah elemen dengan id:
```
status
```
Selain itu tampilkan identitas pembuat aplikasi dengan format:
```
Created by <mark style="background-color:yellow;">username</mark>
```

### Development Requirements
Buat branch kerja baru bernama:
```
development
```
Perbarui aplikasi sehingga teks yang ditampilkan pada elemen `status` menjadi:
```
Application Running - Development Mode
```

### Release Development Requirements
Buat branch fitur baru dari `development` untuk menyiapkan perubahan menuju versi rilis `1.0.0`.
Perbarui logika aplikasi pada `app.js` sehingga menampilkan teks:
```
Application Version 1.0.0 Ready
```
Perbarui file `VERSION` menjadi:
```
1.0.0
```

### CI/CD Requirements
Tambahkan file konfigurasi pipeline:
```
.gitlab-ci.yml
```
Pipeline harus memiliki dua stage:
```
test
release
```
Tambahkan juga file `.gitignore` yang mengabaikan:
```
node_modules/
.env
*.log
```

### Release Requirements
Gabungkan perubahan dari `development` ke branch `main` menggunakan **merge commit** (bukan fast-forward).
Buat **annotated tag** dengan nama:
```
v1.0.0
```
dan pesan tag:
```
Release version 1.0.0
```
Pastikan seluruh perubahan telah dipush ke repository GitLab.
"""
        target = {"nusactl_username": "afifr", "user": "ubuntu"}
        self.assertTrue(is_challenge_lab(challenge_md))

        steps = extract_instructions_from_lab_md(challenge_md, target=target)
        self.assertTrue(len(steps) >= 8)
        raw_cmds = "\n".join(s["raw_cmd"] for s in steps)

        # Must NOT contain standalone non-command value lines as raw commands
        for invalid_cmd in ["origin", "index.html", "0.1.0", "1.0.0", "v1.0.0"]:
            self.assertNotIn(invalid_cmd, [s["raw_cmd"].strip() for s in steps])

        # Must synthesize the required files, branches, merge --no-ff, and annotated tag v1.0.0
        self.assertIn("GitLab-afifr-Challenge", raw_cmds)
        self.assertIn("Created by afifr", raw_cmds)
        self.assertIn("Application Running - Development Mode", raw_cmds)
        self.assertIn("Application Version 1.0.0 Ready", raw_cmds)
        self.assertIn(".gitlab-ci.yml", raw_cmds)
        self.assertIn(".gitignore", raw_cmds)
        self.assertIn("git merge --no-ff", raw_cmds)
        self.assertIn("git tag -f -a v1.0.0 -m \"Release version 1.0.0\"", raw_cmds)

        cases = synthesize_cases_from_lab_md(challenge_md, target=target)
        self.assertTrue(len(cases) >= 7)

    def test_challenge_lab_from_grader_cases_only(self):
        """Verify that AI Solver can synthesize solution steps directly from Grader Test Cases when no MD guide exists."""
        from backend.ai_agent import extract_instructions_from_lab_md
        lab = {
            "id": "challenge-custom-01",
            "description": "Lab Challenge - Custom Grader Driven",
            "grade": [
                {
                    "case_index": 1,
                    "name": "Check directory /home/ubuntu/app-challenge exists",
                    "cmd": "test -d /home/ubuntu/app-challenge && echo PASS || echo FAIL",
                    "expect": "PASS"
                },
                {
                    "case_index": 2,
                    "name": "Check VERSION file is 2.0.0",
                    "cmd": "grep -q '2.0.0' /home/ubuntu/app-challenge/VERSION && echo PASS || echo FAIL",
                    "expect": "PASS"
                }
            ]
        }
        steps = extract_instructions_from_lab_md("", target={"user": "ubuntu"}, lab=lab)
        self.assertTrue(len(steps) >= 2)
        combined = "\n".join(s["raw_cmd"] for s in steps)
        self.assertIn("/home/ubuntu/app-challenge", combined)
        self.assertIn("2.0.0", combined)

if __name__ == "__main__":
    unittest.main()
