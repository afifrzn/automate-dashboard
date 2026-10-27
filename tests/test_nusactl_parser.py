import unittest
import re

class TestNusactlParser(unittest.TestCase):
    def test_parse_nusactl_cases_and_score(self):
        sample_output = """
[-] Grading lab -> glpc-004-1
    => case 1 - Memeriksa isi folder dasar-git-1 [ \x1b[32m✓ \x1b[0m]
    => case 2 - Memeriksa isi dari file-1 s/d file-3 [ \x1b[32m✓ \x1b[0m]
    => case 3 - Memeriksa status git terbaru [ \x1b[32m✓ \x1b[0m]
 \x1b[32m[✓] Yeay! you're completed the task \x1b[0m
[-] Score -> 100
 \x1b[32m[✓] Dont worry we keep your higher score \x1b[0m
"""
        clean_raw = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', sample_output)
        
        tool_cases = []
        tool_passed_cases = []
        tool_failed_cases = []
        for m in re.finditer(r'=>\s*(case\s*(\d+)[^\[\n]*?)\[\s*([^\]]+?)\s*\]', clean_raw, re.IGNORECASE):
            full_desc = m.group(1).strip()
            case_num = int(m.group(2))
            mark = m.group(3).strip()
            is_pass = any(s in mark for s in ["✓", "v", "V", "OK", "ok", "pass", "PASS"]) and not any(f in mark for f in ["x", "X", "FAIL", "!"])
            tool_cases.append({
                "case_index": case_num,
                "name": full_desc,
                "verdict": "PASS" if is_pass else "FAIL",
                "mark": mark
            })
            if is_pass:
                tool_passed_cases.append(case_num)
            else:
                tool_failed_cases.append(case_num)

        score_match = re.search(r'Score\s*->\s*(\d+)', clean_raw, re.IGNORECASE)
        score = int(score_match.group(1)) if score_match else 0

        self.assertEqual(len(tool_cases), 3)
        self.assertEqual(tool_passed_cases, [1, 2, 3])
        self.assertEqual(tool_failed_cases, [])
        self.assertEqual(score, 100)

    def test_parse_nusactl_cases_with_failures(self):
        sample_output = """
[-] Grading lab -> glpc-004-1
    => case 1 - Memeriksa isi folder dasar-git-1 [ \x1b[32m✓ \x1b[0m]
    => case 2 - Memeriksa isi dari file-1 s/d file-3 [ \x1b[31mx \x1b[0m]
    => case 3 - Memeriksa status git terbaru [ \x1b[32m✓ \x1b[0m]
[-] Score -> 66
"""
        clean_raw = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', sample_output)
        
        tool_cases = []
        tool_passed_cases = []
        tool_failed_cases = []
        for m in re.finditer(r'=>\s*(case\s*(\d+)[^\[\n]*?)\[\s*([^\]]+?)\s*\]', clean_raw, re.IGNORECASE):
            case_num = int(m.group(2))
            mark = m.group(3).strip()
            is_pass = any(s in mark for s in ["✓", "v", "V", "OK", "ok", "pass", "PASS"]) and not any(f in mark for f in ["x", "X", "FAIL", "!"])
            if is_pass:
                tool_passed_cases.append(case_num)
            else:
                tool_failed_cases.append(case_num)

        score_match = re.search(r'Score\s*->\s*(\d+)', clean_raw, re.IGNORECASE)
        score = int(score_match.group(1)) if score_match else 0

        self.assertEqual(tool_passed_cases, [1, 3])
        self.assertEqual(tool_failed_cases, [2])
        self.assertEqual(score, 66)

if __name__ == "__main__":
    unittest.main()
