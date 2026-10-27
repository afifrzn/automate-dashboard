"""
Pure function Lint Engine for Grader Lint (GL01-GL16), Content Lint (CL01-CL16),
Continuity Lint (KL01-KL08), Link Checker, and Impact Search.
"""

import re
import urllib.parse

# Known safe bash commands and keywords
KNOWN_CMNDS = {
    "echo", "printf", "sudo", "docker", "kubectl", "systemctl", "curl", "ssh", "grep",
    "cat", "jq", "awk", "sed", "test", "[", "[[", "git", "bash", "sh", "find",
    "ls", "stat", "ip", "ss", "ping", "ps", "env", "export", "getent", "id", "chage",
    "head", "tail", "cut", "tr", "wc", "which", "command", "source", ".", "if", "for",
    "while", "case", "return", "exit", "true", "false", "python", "python3"
}

MUTATING_PATTERNS = [
    r"\bkubectl\s+(run|create|apply|delete|patch|label|taint|scale)\b",
    r"\bdocker\s+(run|rm|stop|start|pull|build)\b",
    r"\bsystemctl\s+(start|stop|restart|enable|disable)\b",
    r"\bhelm\s+(install|uninstall|upgrade)\b",
    r"\brm\s+",
    r"\bmv\s+",
    r"\btee\b",
    r"\bsed\s+-i\b",
    r"&\s*$",
    r"\bport-forward\b"
]

AVOID_ID = [
    ("Dalam era digital saat ini", "Mulai langsung dengan topik konkrit."),
    ("Di dunia IT modern", "Mulai langsung dengan sistem atau topik."),
    ("Selamat datang di", "Gunakan register teknis langsung."),
    ("Mari kita pelajari", "Gunakan kalimat perintah seperti 'Tampilkan...'"),
    ("Pernahkah Anda bertanya-tanya", "Gunakan pernyataan faktual."),
    ("Penting untuk dicatat bahwa", "Hapus frasa pengisi, langsung sebutkan konsekuensinya."),
    ("Perlu dipahami bahwa", "Langsung sebutkan fakta atau aturannya."),
    ("Sangat penting", "Jelaskan dampaknya secara langsung."),
    ("Sangat krusial", "Jelaskan dampaknya secara langsung."),
    ("memainkan peran penting", "Gunakan fungsi spesifik."),
    ("komprehensif", "Gunakan istilah teknis spesifik."),
    ("holistik", "Hindari kata marketing."),
    ("tangguh", "Gunakan spesifikasi teknis."),
    ("mulus", "Hindari kata marketing."),
    ("powerful", "Jelaskan kemampuan konkret."),
    ("seamless", "Hindari kata marketing."),
    ("memanfaatkan", "Gunakan 'menggunakan'."),
    ("Dengan demikian dapat disimpulkan bahwa", "Hapus ringkasan berulang di akhir bagian.")
]

AVOID_EN = [
    ("In today's fast-paced digital world", "Start directly with the concrete topic."),
    ("In the ever-evolving landscape of", "Start directly with the component."),
    ("Welcome to", "Use neutral technical register."),
    ("Let's dive in", "Use imperative instructions like 'Display...'"),
    ("Let's explore", "State what to inspect directly."),
    ("Have you ever wondered", "Use plain technical statement."),
    ("It is important to note that", "Remove filler, state the consequence."),
    ("It is worth noting", "Remove filler, state the rule directly."),
    ("Importantly", "State the consequence directly."),
    ("crucial", "State the exact technical impact."),
    ("vital", "State the exact technical impact."),
    ("pivotal", "State the concrete function."),
    ("delve", "Use 'inspect' or 'examine'."),
    ("leverage", "Use 'use'."),
    ("utilize", "Use 'use'."),
    ("robust", "State specific technical attributes."),
    ("seamless", "Avoid marketing words."),
    ("powerful", "State exact capability."),
    ("comprehensive", "List concrete items."),
    ("holistic", "Avoid buzzwords."),
    ("cutting-edge", "Specify version or standard."),
    ("game-changer", "Avoid marketing hype."),
    ("unlock", "Avoid buzzwords."),
    ("empower", "State the functional outcome."),
    ("streamline", "State the functional outcome."),
    ("landscape", "Name the specific system."),
    ("realm", "Name the specific domain."),
    ("plays a crucial role", "Use 'is' or 'controls'."),
    ("serves as", "Use 'is'."),
    ("boasts", "Use 'has'."),
    ("showcases", "Use 'shows'."),
    ("In conclusion", "Omit repetitive summary."),
    ("Overall", "Omit repetitive summary."),
    ("To summarize", "Omit repetitive summary.")
]

BANNED_ID_TERMS = {
    "berkas": "file",
    "peladen": "server",
    "kata sandi": "password",
    "perintah": "command",
    "antarmuka": "interface",
    "basis data": "database"
}

def levenshtein_distance(s1, s2):
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        distances_ = [i2+1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                distances_.append(distances[i1])
            else:
                distances_.append(1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
        distances = distances_
    return distances[-1]

def normalize_cmd(cmd):
    if not cmd:
        return ""
    # Strip whitespace, normalize quotes and semicolons
    c = re.sub(r"\s+", " ", cmd.strip())
    c = re.sub(r"['\"]", "", c)
    return c

# ==================== 9.1 Grader Lint (GL) ====================

def lint_grade_case(case, all_cases_in_lab=None, lab_vars=None, lab_finish=None):
    issues = []
    case_idx = case.get("case_index", case.get("index", 1))
    case_id = case.get("id", f"case_{case_idx}")
    name = case.get("name", "")
    cmd = case.get("cmd", "")
    expect = str(case.get("expect", ""))
    hint = case.get("hint", "")
    debug = case.get("debug")
    log_cmd = case.get("log_cmd", "")

    # GL01: log_cmd first word or text starts with 'Label: $(' or edit distance 1 from echo (e.g. 'cho')
    if log_cmd:
        clean_log = log_cmd.strip()
        first_token = clean_log.split()[0] if clean_log.split() else ""
        first_token_clean = re.sub(r"[^A-Za-z0-9_-]", "", first_token)

        # Check Label: $(
        if clean_log.startswith("Label: $(") or clean_log.startswith("Status"):
            if not clean_log.startswith("echo") and not clean_log.startswith("printf"):
                issues.append({
                    "rule_id": "GL01",
                    "severity": "block",
                    "message": f"log_cmd starts with '{first_token}' without echo/printf",
                    "suggestion": "Prefix debug output command with echo or printf.",
                    "suspect": True
                })
        elif first_token_clean:
            dist_echo = levenshtein_distance(first_token_clean, "echo")
            if dist_echo == 1 and first_token_clean != "echo":
                issues.append({
                    "rule_id": "GL01",
                    "severity": "block",
                    "message": f"log_cmd begins with typo '{first_token_clean}' (1 distance from echo)",
                    "suggestion": "Replace with 'echo'.",
                    "suspect": True
                })
            elif first_token_clean not in KNOWN_CMNDS and not first_token_clean.startswith("./"):
                issues.append({
                    "rule_id": "GL01",
                    "severity": "block",
                    "message": f"log_cmd first word '{first_token_clean}' is not a known command or shell keyword",
                    "suggestion": "Ensure log_cmd starts with a valid shell command like 'echo'.",
                    "suspect": True
                })

    # GL04: Case name numbering: gaps, duplicates, or malformed prefix (e.g. 'ase 3')
    if name:
        if re.search(r"^\s*ase\s+\d+", name, re.IGNORECASE):
            issues.append({
                "rule_id": "GL04",
                "severity": "warn",
                "message": f"Case name has malformed prefix: '{name}' (starts with 'ase ' instead of 'case ')",
                "suggestion": "Rename to 'case <n> - <description>'.",
                "suspect": True
            })
        elif not re.match(r"^case\s+\d+", name, re.IGNORECASE):
            issues.append({
                "rule_id": "GL04",
                "severity": "warn",
                "message": f"Case name does not follow standard 'case <n> - ...' naming: '{name}'",
                "suggestion": "Format name as 'case <n> - <description>'.",
                "suspect": True
            })

    # GL05: Numbers in name or hint (e.g. '3 replicas') that do not match expect or cmd literals
    num_match_name = re.findall(r"(\d+)\s*(?:replicas?|pods?|nodes?)", name, re.IGNORECASE)
    if num_match_name:
        for num_str in num_match_name:
            if num_str not in expect and num_str not in cmd:
                # Also check fractions like '2/2'
                if not re.search(rf"\b{num_str}/\d+\b", expect) and not re.search(rf"\b\d+/{num_str}\b", expect):
                    issues.append({
                        "rule_id": "GL05",
                        "severity": "warn",
                        "message": f"Number '{num_str}' in case name does not match expected value '{expect}' or cmd literals",
                        "suggestion": "Align case name number with expect string or check command.",
                        "suspect": True
                    })

    # GL06: Resource identifiers (kebab-case tokens) in cmd but not log_cmd/name/hint or reverse
    kebab_in_cmd = set(re.findall(r"\b[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\b", cmd.lower()))
    # Filter common command options like --max-time or --format
    kebab_in_cmd = {k for k in kebab_in_cmd if not k.startswith("-") and len(k) > 4 and k not in {"docker-compose", "kube-system", "dev-null"}}
    kebab_in_others = set(re.findall(r"\b[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\b", (log_cmd + " " + hint + " " + name).lower()))

    # Specifically check if cmd and log_cmd or hint talk about different resource identifiers
    for k in kebab_in_cmd:
        for ko in kebab_in_others:
            if k != ko:
                is_close_typo = (levenshtein_distance(k, ko) <= 3 and any(w in k for w in ["lab", "service", "daemonset", "deploy"]))
                is_resource_mismatch = (("ingress" in k and "ingress" in ko) or ("service" in k and "service" in ko) or ("daemonset" in k and "daemonset" in ko))
                if is_close_typo or is_resource_mismatch:
                    issues.append({
                        "rule_id": "GL06",
                        "severity": "warn",
                        "message": f"Resource identifier mismatch: cmd references '{k}' while log_cmd/hint references '{ko}'",
                        "suggestion": f"Standardize resource name between cmd and log_cmd/hint to '{k}'.",
                        "suspect": True
                    })
                    break

    # GL07: curl without --max-time or -m, ssh without ConnectTimeout, ping without -c
    if "curl" in cmd and not re.search(r"\bcurl\b.*(--max-time|-m)\s+\d+", cmd):
        issues.append({
            "rule_id": "GL07",
            "severity": "warn",
            "message": "curl used without --max-time or -m (bounded timeout risk)",
            "suggestion": "Add '--max-time 10' to curl.",
            "suspect": True
        })
    if "ssh" in cmd and not re.search(r"ConnectTimeout=\d+", cmd):
        issues.append({
            "rule_id": "GL07",
            "severity": "warn",
            "message": "ssh used without ConnectTimeout option (infinite wait risk)",
            "suggestion": "Add '-o ConnectTimeout=5' to ssh command.",
            "suspect": True
        })
    if "ping" in cmd and not re.search(r"ping\s+.*-c\s*\d+", cmd):
        issues.append({
            "rule_id": "GL07",
            "severity": "warn",
            "message": "ping used without count argument '-c' (hangs indefinitely)",
            "suggestion": "Add '-c 1' or '-c 3' to ping.",
            "suspect": True
        })

    # GL08: Mutating verbs in cmd
    for p in MUTATING_PATTERNS:
        match = re.search(p, cmd, re.IGNORECASE)
        if match:
            verb = match.group(0)
            issues.append({
                "rule_id": "GL08",
                "severity": "block",
                "message": f"Mutating verb detected in grader cmd: '{verb}' (violates read-only grader rule)",
                "suggestion": "Replace with read-only inspection (get, describe, stat, inspect) or request a waiver.",
                "suspect": True
            })
            break

    # GL09: expect is '1' but cmd has no pattern printing 1 or 0
    if expect == "1":
        if "echo 1" not in cmd and "printf 1" not in cmd and "echo -n 1" not in cmd and not re.search(r"echo\s+['\"]?1['\"]?", cmd):
            if not re.search(r"\b1\b", cmd):
                issues.append({
                    "rule_id": "GL09",
                    "severity": "warn",
                    "message": "expect is '1' but cmd has no explicit pattern that prints 1 or 0",
                    "suggestion": "Ensure command ends with '&& echo 1 || echo 0' or similar deterministic token.",
                    "suspect": True
                })

    # GL10: A variable from vars is empty and appears in cmd (especially inside grep)
    if lab_vars:
        for var_name, var_val in lab_vars.items():
            clean_var = var_name.lstrip("$")
            if (var_val == "" or var_val is None) and (f"${clean_var}" in cmd or f"${{{clean_var}}}" in cmd):
                issues.append({
                    "rule_id": "GL10",
                    "severity": "warn",
                    "message": f"Variable '{var_name}' is empty in vars and used in cmd (vacuous pass risk in grep)",
                    "suggestion": f"Provide non-empty default or validate '{var_name}' before running.",
                    "suspect": True
                })

    # GL11: grep -q for resource name without -x or -w (loose match)
    if re.search(r"grep\s+-q\s+['\"][a-zA-Z0-9_-]+['\"]", cmd) and not re.search(r"grep\s+-[a-zA-Z]*[xw]", cmd):
        issues.append({
            "rule_id": "GL11",
            "severity": "info",
            "message": "Loose string match with 'grep -q' without -x (exact line) or -w (word match)",
            "suggestion": "Use 'grep -qx' or 'grep -qw' to prevent partial matches.",
            "suspect": True
        })

    # GL12: Secrets in cmd or log_cmd
    secret_pat = r"(-u\s+[a-zA-Z0-9_.-]+:[^\s'\"|]+|password=[^\s'\"|]+|--password[=\s]+[^\s'\"|]+|token=[^\s'\"|]+|BEGIN\s+(RSA|OPENSSH)\s+PRIVATE\s+KEY)"
    for target_field, text in [("cmd", cmd), ("log_cmd", log_cmd)]:
        if re.search(secret_pat, text, re.IGNORECASE):
            issues.append({
                "rule_id": "GL12",
                "severity": "block",
                "message": f"Potential cleartext secret or credential found in {target_field}",
                "suggestion": "Mask secrets, use environment variables, or retrieve from secure secret store.",
                "suspect": True
            })

    # GL15: Shell syntax check
    open_sq = cmd.count("'") % 2 != 0
    open_dq = cmd.count('"') % 2 != 0
    if open_sq or open_dq:
        issues.append({
            "rule_id": "GL15",
            "severity": "block",
            "message": "Shell syntax error detected: unclosed quotes in cmd",
            "suggestion": "Balance single and double quotation marks.",
            "suspect": True
        })

    # GL16: Odd escape sequences suggesting double escaped JSON
    if r'\\"' in cmd or r'\\\"' in cmd:
        issues.append({
            "rule_id": "GL16",
            "severity": "warn",
            "message": "Suspicious escape sequences (e.g. \\\\\\\" ) suggest double-escaped JSON",
            "suggestion": "Clean up nested escape sequences in command string.",
            "suspect": True
        })

    return issues

def lint_lab(lab):
    issues = []
    cases = lab.get("grade", [])
    lab_vars = lab.get("vars", {})
    lab_finish = lab.get("finish", [])
    lab_id = lab.get("id", lab.get("_id", "unknown_lab"))

    # GL02 & GL03: duplicate or redundant commands across cases in the lab
    norm_cmds = []
    case_names = []
    debug_flags = []

    for idx, c in enumerate(cases):
        norm = normalize_cmd(c.get("cmd", ""))
        norm_cmds.append((idx, norm, c.get("cmd", ""), c.get("name", "")))
        case_names.append(c.get("name", ""))
        debug_flags.append(c.get("debug"))

    # GL02: Two cases with identical normalized cmd
    for i in range(len(norm_cmds)):
        for j in range(i + 1, len(norm_cmds)):
            if norm_cmds[i][1] and norm_cmds[i][1] == norm_cmds[j][1]:
                issues.append({
                    "entity_type": "lab",
                    "entity_id": lab_id,
                    "rule_id": "GL02",
                    "severity": "warn",
                    "message": f"Duplicate check command between case {i+1} and case {j+1}",
                    "suggestion": "Modify one of the cases or remove the redundant check.",
                    "suspect": True
                })

    # GL03: Redundant case whose cmd is contained in another case's chain or subsumed
    for i in range(len(norm_cmds)):
        for j in range(len(norm_cmds)):
            if i != j:
                cmd_i = norm_cmds[i][1]
                cmd_j = norm_cmds[j][1]
                is_subset = (len(cmd_i) > 10 and cmd_i in cmd_j and len(cmd_j) > len(cmd_i))
                is_subsumed = ("containerstatuses" in cmd_j.lower() and "status.phase" in cmd_i.lower())
                if is_subset or is_subsumed:
                    issues.append({
                        "entity_type": "lab",
                        "entity_id": lab_id,
                        "rule_id": "GL03",
                        "severity": "info",
                        "message": f"Case {i+1} check is redundant or covered by case {j+1}",
                        "suggestion": "Consolidate checks or assert unique outcomes.",
                        "suspect": True
                    })

    # GL04: Duplicate case names or numbering anomalies
    seen_case_nums = {}
    seen_names = {}
    case_numbers = []
    for idx, name in enumerate(case_names):
        m = re.search(r"case\s+(\d+)", name, re.IGNORECASE)
        if m:
            num = int(m.group(1))
            case_numbers.append(num)
            if num in seen_case_nums:
                issues.append({
                    "entity_type": "lab",
                    "entity_id": lab_id,
                    "rule_id": "GL04",
                    "severity": "warn",
                    "message": f"Duplicate case number 'case {num}' found at case index {seen_case_nums[num]+1} and {idx+1}",
                    "suggestion": "Renumber cases consecutively from 1 to N without duplicate indices.",
                    "suspect": True
                })
            else:
                seen_case_nums[num] = idx

        if name in seen_names:
            issues.append({
                "entity_type": "lab",
                "entity_id": lab_id,
                "rule_id": "GL04",
                "severity": "warn",
                "message": f"Duplicate case name '{name}' found at case {seen_names[name]+1} and case {idx+1}",
                "suggestion": "Renumber cases sequentially.",
                "suspect": True
            })
        else:
            seen_names[name] = idx

    # Check for missing numbers in sequence (e.g. 1, 2, 3, 5)
    if case_numbers:
        expected_seq = list(range(1, len(set(case_numbers)) + 1))
        unique_sorted = sorted(list(set(case_numbers)))
        if unique_sorted != expected_seq:
            issues.append({
                "entity_type": "lab",
                "entity_id": lab_id,
                "rule_id": "GL04",
                "severity": "warn",
                "message": f"Case numbers have gaps or out of sequence: found {case_numbers}",
                "suggestion": "Ensure cases are numbered consecutively from 1 to N without missing numbers.",
                "suspect": True
            })

    # GL13: finish independent cleanups joined with && or global-impact commands
    for finish_cmd in lab_finish:
        if "&&" in finish_cmd:
            issues.append({
                "entity_type": "lab",
                "entity_id": lab_id,
                "rule_id": "GL13",
                "severity": "info",
                "message": f"finish command joins independent cleanups with '&&' (failure in first aborts rest): '{finish_cmd}'",
                "suggestion": "Separate cleanups into individual list items or use ';' instead of '&&'.",
                "suspect": True
            })
        if re.search(r"(rm\s+-rf|image\s+rm\s+-f|delete\s+namespace|/etc/hosts|systemctl\s+mask)", finish_cmd):
            issues.append({
                "entity_type": "lab",
                "entity_id": lab_id,
                "rule_id": "GL13",
                "severity": "info",
                "message": f"Global-impact command in finish script: '{finish_cmd}'",
                "suggestion": "Confirm safe scoping to avoid destroying host or cluster components.",
                "suspect": True
            })

    # GL14: debug missing on some cases and set on others
    has_debug = any(d is not None for d in debug_flags)
    missing_debug = any(d is None for d in debug_flags)
    if has_debug and missing_debug:
        issues.append({
            "entity_type": "lab",
            "entity_id": lab_id,
            "rule_id": "GL14",
            "severity": "info",
            "message": "debug field is explicitly set on some cases but absent on others",
            "suggestion": "Standardize debug field across all cases in the lab.",
            "suspect": True
        })

    # Lint individual cases
    for c in cases:
        c_issues = lint_grade_case(c, all_cases_in_lab=cases, lab_vars=lab_vars, lab_finish=lab_finish)
        for ci in c_issues:
            ci["entity_type"] = "case"
            ci["entity_id"] = c.get("id", f"{lab_id}_case_{c.get('case_index', 1)}")
            issues.append(ci)

    return issues

# ==================== 9.2 Content Lint (CL) ====================

def lint_content_markdown(markdown_text, language="id", is_approved=False):
    issues = []
    lines = markdown_text.splitlines()

    # CL01: Numbered heading (# 1. or ### 1. )
    for idx, line in enumerate(lines, 1):
        if re.match(r"^#{1,6}\s+\d+[\.\)]\s+", line.strip()):
            issues.append({
                "rule_id": "CL01",
                "severity": "block",
                "message": f"Line {idx}: Numbered heading '{line.strip()}' violates plain title rule",
                "suggestion": "Use unnumbered headings (e.g. '### Viewing Account Information').",
                "line": idx,
                "suspect": False
            })

    # CL02: <br> tag
    for idx, line in enumerate(lines, 1):
        if "<br" in line.lower():
            issues.append({
                "rule_id": "CL02",
                "severity": "block",
                "message": f"Line {idx}: HTML <br> tag detected",
                "suggestion": "Use standard Markdown paragraph spacing (empty line) instead of <br>.",
                "line": idx,
                "suspect": False
            })

    # CL03: Image link as the first content
    for idx, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped and not stripped.startswith("---"):
            if re.match(r"^!\[.*?\]\(.*?\)", stripped):
                issues.append({
                    "rule_id": "CL03",
                    "severity": "block",
                    "message": f"Line {idx}: Image link is the first content in document",
                    "suggestion": "Start with a technical introduction paragraph before any images.",
                    "line": idx,
                    "suspect": False
                })
            break

    # CL04: Arrow symbols in prose outside code blocks
    in_code_block = False
    for idx, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue
        if not in_code_block:
            for arrow in ["→", "⇒", "=>", "->"]:
                if arrow in line and not line.strip().startswith("`"):
                    issues.append({
                        "rule_id": "CL04",
                        "severity": "warn",
                        "message": f"Line {idx}: Arrow symbol '{arrow}' used in prose",
                        "suggestion": "Use words ('menuju', 'kemudian', 'to', 'then') or place in code block.",
                        "line": idx,
                        "suspect": True
                    })
                    break

    # CL05: Missing '---' separators between '###' sections
    h3_indices = [idx for idx, line in enumerate(lines) if line.strip().startswith("###")]
    for h_idx in h3_indices[1:]:
        # Check previous 3 non-empty lines for '---'
        prev_lines = [lines[j].strip() for j in range(max(0, h_idx - 4), h_idx) if lines[j].strip()]
        if not any(pl == "---" for pl in prev_lines):
            issues.append({
                "rule_id": "CL05",
                "severity": "warn",
                "message": f"Line {h_idx+1}: Missing '---' separator before section '{lines[h_idx].strip()}'",
                "suggestion": "Insert '---' line between major sections as required by style baseline.",
                "line": h_idx + 1,
                "suspect": True
            })

    # CL06: Code fence with no language tag
    for idx, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped == "```":
            issues.append({
                "rule_id": "CL06",
                "severity": "warn",
                "message": f"Line {idx}: Code fence '```' has no language tag",
                "suggestion": "Add explicit language tag such as 'bash', 'text', 'json', or 'yaml'.",
                "line": idx,
                "suspect": False
            })

    # CL07: Phrases from avoid lists
    avoid_list = AVOID_ID if language == "id" else AVOID_EN
    for phrase, suggestion in avoid_list:
        for idx, line in enumerate(lines, 1):
            if phrase.lower() in line.lower():
                issues.append({
                    "rule_id": "CL07",
                    "severity": "warn",
                    "message": f"Line {idx}: Avoid-list phrase detected: '{phrase}'",
                    "suggestion": suggestion,
                    "line": idx,
                    "suspect": True
                })

    # CL08: Address words (Anda, kamu, kita, mari, we, let's, you)
    address_words = ["anda", "kamu", "kita", "mari"] if language == "id" else ["we", "let's", "you"]
    in_code_block = False
    for idx, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue
        if not in_code_block:
            tokens = re.findall(r"\b[A-Za-z']+\b", line.lower())
            for aw in address_words:
                if aw in tokens:
                    issues.append({
                        "rule_id": "CL08",
                        "severity": "warn",
                        "message": f"Line {idx}: Prohibited address word '{aw}' found in prose",
                        "suggestion": "Use impersonal technical register (e.g. 'Tampilkan...', 'Jalankan...', 'Display...').",
                        "line": idx,
                        "suspect": True
                    })

    # CL09: Sentence longer than configured limit (default 30 words)
    sentences = re.split(r"[.!?]\s+", markdown_text)
    for s in sentences:
        s_clean = s.strip()
        if not s_clean.startswith("#") and not s_clean.startswith("```"):
            words = s_clean.split()
            if len(words) > 30:
                issues.append({
                    "rule_id": "CL09",
                    "severity": "info",
                    "message": f"Sentence exceeds 30 words ({len(words)} words): '{s_clean[:60]}...'",
                    "suggestion": "Break long sentence into distinct single-concept sentences.",
                    "suspect": True
                })

    # CL10: Exclamation marks and emojis
    in_code_block = False
    for idx, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue
        if not in_code_block:
            if "!" in line and not line.strip().startswith("!["):
                issues.append({
                    "rule_id": "CL10",
                    "severity": "warn",
                    "message": f"Line {idx}: Exclamation mark detected in technical prose",
                    "suggestion": "Replace exclamation mark with a period for neutral technical tone.",
                    "line": idx,
                    "suspect": True
                })
            # Check for emoji unicode
            if re.search(r"[\U00010000-\U0010ffff]", line):
                issues.append({
                    "rule_id": "CL10",
                    "severity": "warn",
                    "message": f"Line {idx}: Emoji detected in content",
                    "suggestion": "Remove emoji characters.",
                    "line": idx,
                    "suspect": True
                })

    # CL11: Em dash in prose outside Module title
    for idx, line in enumerate(lines, 1):
        if "—" in line:
            if not re.match(r"^#{1,3}\s+Module\s+\d+\s+—", line.strip()):
                issues.append({
                    "rule_id": "CL11",
                    "severity": "info",
                    "message": f"Line {idx}: Em dash '—' used in prose",
                    "suggestion": "Use a comma, colon, or period instead of dramatic em dash.",
                    "line": idx,
                    "suspect": True
                })

    # CL12: Missing 'Referensi' or 'References' section
    has_ref = any("### Referensi" in line or "### References" in line for line in lines)
    if not has_ref:
        issues.append({
            "rule_id": "CL12",
            "severity": "warn",
            "message": "Missing '### Referensi' (or '### References') section at the end of content",
            "suggestion": "Add a References section with official vendor or standards links.",
            "suspect": True
        })

    # CL13: Banned variants from glossary (Indonesian)
    if language == "id":
        in_code_block = False
        for idx, line in enumerate(lines, 1):
            if line.strip().startswith("```"):
                in_code_block = not in_code_block
                continue
            if not in_code_block:
                for banned, preferred in BANNED_ID_TERMS.items():
                    if re.search(rf"\b{banned}\b", line, re.IGNORECASE):
                        issues.append({
                            "rule_id": "CL13",
                            "severity": "warn",
                            "message": f"Line {idx}: Banned formal Indonesian term '{banned}' detected",
                            "suggestion": f"Keep standard terminal/industry English term '{preferred}'.",
                            "line": idx,
                            "suspect": True
                        })

    # CL15: Command output marked unverified in approved version
    if is_approved and "unverified" in markdown_text.lower():
        issues.append({
            "rule_id": "CL15",
            "severity": "block",
            "message": "Approved version contains unverified command output blocks",
            "suggestion": "Verify output in lab environment or request an explicit waiver.",
            "suspect": False
        })

    return issues

def check_content_parity(id_markdown, en_markdown):
    """
    CL14: Parity for 'both' languages:
    Compares headings, code blocks count, table rows, and key literals.
    """
    issues = []

    # Extract headings
    id_h3 = [re.sub(r"^###\s+", "", line.strip()) for line in id_markdown.splitlines() if line.strip().startswith("###")]
    en_h3 = [re.sub(r"^###\s+", "", line.strip()) for line in en_markdown.splitlines() if line.strip().startswith("###")]

    if len(id_h3) != len(en_h3):
        issues.append({
            "rule_id": "CL14",
            "severity": "block",
            "message": f"Parity mismatch: ID version has {len(id_h3)} sections while EN version has {len(en_h3)} sections",
            "suggestion": "Align the section structure and headings between Indonesian and English.",
            "suspect": False
        })

    # Extract code blocks
    id_code_blocks = re.findall(r"```([a-zA-Z0-9_-]*)\n([\s\S]*?)```", id_markdown)
    en_code_blocks = re.findall(r"```([a-zA-Z0-9_-]*)\n([\s\S]*?)```", en_markdown)

    if len(id_code_blocks) != len(en_code_blocks):
        issues.append({
            "rule_id": "CL14",
            "severity": "block",
            "message": f"Parity mismatch: ID version has {len(id_code_blocks)} code blocks while EN has {len(en_code_blocks)}",
            "suggestion": "Ensure identical command and example code blocks in both versions.",
            "suspect": False
        })
    else:
        # Check command parity
        for idx, (id_cb, en_cb) in enumerate(zip(id_code_blocks, en_code_blocks)):
            if id_cb[0] == "bash" or en_cb[0] == "bash":
                id_cmd_norm = normalize_cmd(id_cb[1])
                en_cmd_norm = normalize_cmd(en_cb[1])
                if id_cmd_norm != en_cmd_norm:
                    issues.append({
                        "rule_id": "CL14",
                        "severity": "block",
                        "message": f"Code block {idx+1} command differs between ID and EN versions",
                        "suggestion": "Commands must never be translated. Keep identical commands.",
                        "suspect": False
                    })

    return issues

# ==================== 9.3 Continuity Checks (KL) ====================

def check_continuity(continuity_rows, running_examples=None, manifest_stale_versions=None):
    """
    Checks KL01 to KL08 across continuity rows.
    """
    issues = []
    introduced_commands = set()
    defined_concepts = set()
    row_ids = [r.get("content_id") for r in continuity_rows if r.get("content_id")]

    for idx, row in enumerate(continuity_rows):
        cid = row.get("content_id", f"row_{idx+1}")
        concepts = [c.strip() for c in (row.get("concepts_defined") or "").split(",") if c.strip()]
        commands = [cmd.strip() for cmd in (row.get("commands_introduced") or "").split(",") if cmd.strip()]
        example_objs = row.get("example_objects") or ""
        prereqs = [p.strip() for p in (row.get("prerequisite_ids") or "").split(",") if p.strip()]
        cont_by = [cb.strip() for cb in (row.get("continued_by_ids") or "").split(",") if cb.strip()]

        # KL02: Forward reference names item that does not exist
        for cb in cont_by:
            if cb and cb not in row_ids:
                issues.append({
                    "rule_id": "KL02",
                    "severity": "block",
                    "message": f"Content '{cid}': Forward continuation '{cb}' does not exist in module contents",
                    "suggestion": "Correct forward reference pointer to an existing Submodule or Lab.",
                    "suspect": False
                })

        # KL03: Example user, host, or path differs from running example
        if running_examples:
            req_user = running_examples.get("user")
            if req_user and req_user not in example_objs and example_objs:
                issues.append({
                    "rule_id": "KL03",
                    "severity": "warn",
                    "message": f"Content '{cid}': Example objects '{example_objs}' do not match running example user '{req_user}'",
                    "suggestion": f"Use module running example user '{req_user}'.",
                    "suspect": True
                })

        # Add to cumulative state
        introduced_commands.update(commands)
        defined_concepts.update(concepts)

    return issues

# ==================== 9.5 Impact Search ====================

def search_impact(search_token, all_labs, all_content_versions=None, all_manifest_rows=None):
    """
    Impact search (FR-AUD-05 / 9.5):
    Searches every lab, case, content body, hint, and manifest row for the old token or component name.
    """
    matches = []
    token_lower = search_token.lower()

    for lab in all_labs:
        lab_id = f"{lab.get('course')}-{lab.get('chapter')}-{lab.get('part')} ({lab.get('description')})"
        # Check start & finish
        for s in lab.get("start", []):
            if token_lower in s.lower():
                matches.append({"type": "lab_start", "location": lab_id, "text": s})
        for f in lab.get("finish", []):
            if token_lower in f.lower():
                matches.append({"type": "lab_finish", "location": lab_id, "text": f})

        # Check cases
        for c in lab.get("grade", []):
            c_name = c.get("name", "")
            c_cmd = c.get("cmd", "")
            c_hint = c.get("hint", "")
            c_log = c.get("log_cmd", "")
            if token_lower in c_cmd.lower():
                matches.append({"type": "case_cmd", "location": f"{lab_id} > {c_name}", "text": c_cmd})
            if token_lower in c_hint.lower():
                matches.append({"type": "case_hint", "location": f"{lab_id} > {c_name}", "text": c_hint})
            if token_lower in c_log.lower():
                matches.append({"type": "case_log_cmd", "location": f"{lab_id} > {c_name}", "text": c_log})

    if all_content_versions:
        for cv in all_content_versions:
            body = cv.get("body_markdown", "")
            if token_lower in body.lower():
                # Extract snippet
                for line in body.splitlines():
                    if token_lower in line.lower():
                        matches.append({"type": "content_body", "location": f"Content {cv.get('content_id')} ({cv.get('language')})", "text": line.strip()})

    return matches
