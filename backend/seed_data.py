"""
Acceptance Seed Dataset Generator (Section 17 Seed Test).
Creates the dok8s test course containing all exact grader defects specified in Section 17,
plus sample targets, audit entries, manifest rows, continuity rows, and glossary terms.
"""

import json
from .database import get_connection, init_db
from .importer import import_course_export

DOK8S_SEED_LABS = [
    {
        "_id": "seed_lab_02_2",
        "course": "dok8s",
        "chapter": "002",
        "part": "2",
        "description": "Lab 2.2 - Inspecting Container Filesystem",
        "vars": {},
        "start": ["sudo docker run -d --name ubuntu-shell ubuntu:latest sleep 3600"],
        "finish": ["sudo docker rm -f ubuntu-shell"],
        "grade": [
            {
                "name": "case 1 - Check ubuntu-shell container is running",
                "cmd": "sudo docker ps --filter name=ubuntu-shell --format '{{.Names}}' | grep -qx 'ubuntu-shell' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure ubuntu-shell container is running.",
                "debug": "true",
                "log_cmd": "echo \"Container: $(sudo docker ps --filter name=ubuntu-shell --format '{{.Names}}') | Expect: ubuntu-shell\""
            },
            {
                "name": "case 2 - Check that message.txt exists in ubuntu-shell",
                "cmd": "sudo docker cp ubuntu-shell:/lab2-2/message.txt - >/dev/null 2>&1 && echo 1 || echo 0",
                "expect": "1",
                "hint": "Make sure message.txt is created inside the container at /lab2-2/message.txt.",
                "debug": "true",
                "log_cmd": "cho \"File message.txt in container | Expect: exists\"" # GL01: starts with cho
            }
        ]
    },
    {
        "_id": "seed_lab_07_3",
        "course": "dok8s",
        "chapter": "007",
        "part": "3",
        "description": "Lab 7.3 - Kubernetes Pod Multi-Container Setup",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete pod multi-app --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check pod multi-app is running",
                "cmd": "kubectl get pod multi-app -o jsonpath='{.status.phase}' | grep -qx 'Running' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Check pod status with kubectl get pods.",
                "debug": "true",
                "log_cmd": "echo \"Status: $(kubectl get pod multi-app -o jsonpath='{.status.phase}') | Expect: Running\""
            },
            {
                "name": "case 2 - Check container count and primary container health",
                "cmd": "kubectl get pod multi-app -o jsonpath='{.status.containerStatuses[*].ready}' | grep -qx 'true true' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure both containers in multi-app are in ready state.",
                "debug": "true",
                "log_cmd": "echo \"Containers ready: $(kubectl get pod multi-app -o jsonpath='{.status.containerStatuses[*].ready}') | Expect: true true\""
            },
            {
                "name": "case 3 - Redundant check on pod multi-app status",
                "cmd": "kubectl get pod multi-app -o jsonpath='{.status.phase}' | grep -qx 'Running' && echo 1 || echo 0", # GL03: redundant check identical to case 1
                "expect": "1",
                "hint": "Ensure pod status is running.",
                "debug": "true",
                "log_cmd": "echo \"Status: $(kubectl get pod multi-app -o jsonpath='{.status.phase}') | Expect: Running\""
            }
        ]
    },
    {
        "_id": "seed_lab_10_1",
        "course": "dok8s",
        "chapter": "010",
        "part": "1",
        "description": "Lab 10.1 - Node Status and Cluster Health",
        "vars": {"$NUSA_USERNAME": ""}, # GL10: empty var
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Check master node status",
                "cmd": "kubectl get nodes master -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}' | grep -qx 'True' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure master node is Ready.",
                "debug": "true",
                "log_cmd": "Status Node Master: $(kubectl get nodes master) | Expect: Ready" # GL01: starts with Status Node without echo
            },
            {
                "name": "case 2 - Check worker1 node status with user filter",
                "cmd": "kubectl get nodes worker1 -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}' | grep \"$NUSA_USERNAME\" | grep -qx 'True' && echo 1 || echo 0", # GL10 vacuous grep risk
                "expect": "1",
                "hint": "Ensure worker1 is Ready.",
                "debug": "true",
                "log_cmd": "Status Node Worker1: $(kubectl get nodes worker1) | Expect: Ready" # GL01: starts with Status Node
            },
            {
                "name": "case 3 - Check worker2 node status",
                "cmd": "kubectl get nodes worker2 -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}' | grep -qx 'True' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure worker2 is Ready.",
                "debug": "true",
                "log_cmd": "Status Node Worker2: $(kubectl get nodes worker2) | Expect: Ready" # GL01: starts with Status Node
            }
        ]
    },
    {
        "_id": "seed_lab_12_1",
        "course": "dok8s",
        "chapter": "012",
        "part": "1",
        "description": "Lab 12.1 - Deploying a DaemonSet",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete daemonset lab121-daemonset --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check daemonset desired number scheduled",
                "cmd": "kubectl get daemonset lab121-daemonset -o jsonpath='{.status.desiredNumberScheduled}' | grep -qx '2' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure lab51-daemonset is scheduled on all worker nodes.", # GL06: hint says lab51-daemonset while cmd uses lab121-daemonset
                "debug": "true",
                "log_cmd": "echo \"DaemonSet status: $(kubectl get daemonset lab121-daemonset) | Expect: scheduled 2\""
            }
        ]
    },
    {
        "_id": "seed_lab_12_6",
        "course": "dok8s",
        "chapter": "012",
        "part": "6",
        "description": "Lab 12.6 - Scaling a Deployment",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete deployment web-deploy --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check deployment exists",
                "cmd": "kubectl get deployment web-deploy -o jsonpath='{.metadata.name}' | grep -qx 'web-deploy' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Create deployment web-deploy.",
                "debug": "true",
                "log_cmd": "echo \"Deployment: $(kubectl get deployment web-deploy) | Expect: web-deploy\""
            },
            {
                "name": "case 2 - Check deployment image",
                "cmd": "kubectl get deployment web-deploy -o jsonpath='{.spec.template.spec.containers[0].image}' | grep -qx 'nginx:1.24' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Use nginx:1.24 image.",
                "debug": "true",
                "log_cmd": "echo \"Image: $(kubectl get deployment web-deploy -o jsonpath='{.spec.template.spec.containers[0].image}') | Expect: nginx:1.24\""
            },
            {
                "name": "case 3 - Check that web-deploy has 3 replicas", # GL05: Name says 3 replicas, but check expects 2/2
                "cmd": "kubectl get deployment web-deploy -o jsonpath='{.status.readyReplicas}/{\\*.status.replicas}' 2>/dev/null | grep -qx '2/2' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Make sure 3 replicas are running.",
                "debug": "true",
                "log_cmd": "echo \"Replicas: $(kubectl get deployment web-deploy -o jsonpath='{.status.readyReplicas}') | Expect: 2/2\""
            }
        ]
    },
    {
        "_id": "seed_lab_13_4",
        "course": "dok8s",
        "chapter": "013",
        "part": "4",
        "description": "Lab 13.4 - Deployment Rollout and Revisions",
        "vars": {},
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Check rollout status",
                "cmd": "kubectl rollout status deployment/web-deploy --timeout=10s | grep -q 'successfully rolled out' && echo 1 || echo 0", # GL02: same cmd as case 2
                "expect": "1",
                "hint": "Ensure rollout completed.",
                "debug": "true",
                "log_cmd": "echo \"Rollout status: $(kubectl rollout status deployment/web-deploy) | Expect: rolled out\""
            },
            {
                "name": "case 2 - Check rollout revision history",
                "cmd": "kubectl rollout status deployment/web-deploy --timeout=10s | grep -q 'successfully rolled out' && echo 1 || echo 0", # GL02: duplicate cmd
                "expect": "1",
                "hint": "Ensure rollout revision history exists.",
                "debug": "true",
                "log_cmd": "echo \"Rollout history: $(kubectl rollout history deployment/web-deploy) | Expect: revision 2\""
            }
        ]
    },
    {
        "_id": "seed_lab_15_1",
        "course": "dok8s",
        "chapter": "015",
        "part": "1",
        "description": "Lab 15.1 - ClusterIP Services and Testing",
        "vars": {},
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Test service resolution by creating a temporary testing pod",
                "cmd": "kubectl run tmp-test-pod --image=busybox:1.36 --rm -i --restart=Never -- nslookup web-service && echo 1 || echo 0", # GL08: kubectl run in grader cmd
                "expect": "1",
                "hint": "Ensure web-service resolves correctly via cluster DNS.",
                "debug": "true",
                "log_cmd": "echo \"DNS test | Expect: web-service IP\""
            }
        ]
    },
    {
        "_id": "seed_lab_15_2",
        "course": "dok8s",
        "chapter": "015",
        "part": "2",
        "description": "Lab 15.2 - NodePort Service Configuration",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete service lab15-2-service-nodeport --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check service exists",
                "cmd": "kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.type}' | grep -qx 'NodePort' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure lab15-2-service-nodeport is type NodePort.",
                "debug": "true",
                "log_cmd": "echo \"Service Type: $(kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.type}') | Expect: NodePort\""
            },
            {
                "name": "case 2 - Check service target port",
                "cmd": "kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.ports[0].targetPort}' | grep -qx '80' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure targetPort is 80.",
                "debug": "true",
                "log_cmd": "echo \"TargetPort: $(kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.ports[0].targetPort}') | Expect: 80\""
            },
            {
                "name": "case 3 - Check service selector nodeport",
                "cmd": "kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.selector.app}' | grep -qx 'web-backend' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure service selects app=web-backend.",
                "debug": "true",
                "log_cmd": "echo \"Selector: $(kubectl get svc lab5-2-service-nodeport -o jsonpath='{.spec.selector.app}') | Expect: web-backend\"" # GL06: log_cmd uses lab5-2
            },
            {
                "name": "case 4 - Check assigned nodePort number",
                "cmd": "kubectl get svc lab15-2-service-nodeport -o jsonpath='{.spec.ports[0].nodePort}' | grep -qx '30080' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Set nodePort to 30080.",
                "debug": "true",
                "log_cmd": "echo \"NodePort: $(kubectl get svc lab5-2-service-nodeport -o jsonpath='{.spec.ports[0].nodePort}') | Expect: 30080\"" # GL06: log_cmd uses lab5-2
            }
        ]
    },
    {
        "_id": "seed_lab_15_5",
        "course": "dok8s",
        "chapter": "015",
        "part": "5",
        "description": "Lab 15.5 - Endpoints and Service Discovery",
        "vars": {},
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Check endpoints exist",
                "cmd": "kubectl get endpoints web-service -o jsonpath='{.subsets[0].addresses[*].ip}' | grep -v '^$' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure endpoints exist.",
                "debug": "true",
                "log_cmd": "echo \"Endpoints: $(kubectl get endpoints web-service) | Expect: active IPs\""
            },
            {
                "name": "case 2 - Check endpoints port",
                "cmd": "kubectl get endpoints web-service -o jsonpath='{.subsets[0].ports[0].port}' | grep -qx '80' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Port should be 80.",
                "debug": "true",
                "log_cmd": "echo \"Port: 80 | Expect: 80\""
            },
            {
                "name": "ase 3 - Verify endpoint slice generation", # GL04: name starts with 'ase 3'
                "cmd": "kubectl get endpointslice -l kubernetes.io/service-name=web-service -o jsonpath='{.items[0].addressType}' | grep -qx 'IPv4' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure endpoint slice exists.",
                "debug": "true",
                "log_cmd": "echo \"EndpointSlice: IPv4 | Expect: IPv4\""
            }
        ]
    },
    {
        "_id": "seed_lab_15_7",
        "course": "dok8s",
        "chapter": "015",
        "part": "7",
        "description": "Lab 15.7 - Network Policies and Isolation",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete netpol default-deny --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check network policy exists",
                "cmd": "kubectl get netpol default-deny -o jsonpath='{.metadata.name}' | grep -qx 'default-deny' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Create network policy default-deny.",
                "debug": "true",
                "log_cmd": "echo \"Netpol: default-deny | Expect: default-deny\""
            },
            {
                "name": "case 2 - Check policy ingress types",
                "cmd": "kubectl get netpol default-deny -o jsonpath='{.spec.policyTypes[*]}' | grep -q 'Ingress' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure policyTypes contains Ingress.",
                "debug": "true",
                "log_cmd": "echo \"PolicyTypes: Ingress | Expect: Ingress\""
            },
            {
                "name": "case 3 - Check pod selector scope",
                "cmd": "kubectl get netpol default-deny -o jsonpath='{.spec.podSelector}' | grep -qx '{}' && echo 1 || echo 0",
                "expect": "1",
                "hint": "PodSelector should be empty map.",
                "debug": "true",
                "log_cmd": "echo \"PodSelector: {} | Expect: {}\""
            },
            {
                "name": "case 5 - Check denied ingress traffic", # GL04: duplicate 'case 5' and missing 'case 4'
                "cmd": "kubectl describe netpol default-deny | grep -q 'Allowing ingress traffic: <none>' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure ingress traffic is blocked.",
                "debug": "true",
                "log_cmd": "echo \"Denied ingress verified | Expect: <none>\""
            },
            {
                "name": "case 5 - Check egress rule settings", # GL04: duplicate 'case 5'
                "cmd": "kubectl describe netpol default-deny | grep -q 'Allowing egress traffic' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure egress rule is configured.",
                "debug": "true",
                "log_cmd": "echo \"Egress rule verified | Expect: allowed\""
            }
        ]
    },
    {
        "_id": "seed_lab_16_1",
        "course": "dok8s",
        "chapter": "016",
        "part": "1",
        "description": "Lab 16.1 - Configuring Ingress Controller and Rules",
        "vars": {},
        "start": [],
        "finish": ["kubectl delete ingress web-ingress --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Check ingress controller deployment",
                "cmd": "kubectl get deploy ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.readyReplicas}' | grep -qx '1' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure Ingress controller is running.",
                "debug": "true",
                "log_cmd": "echo \"Ingress ready: 1 | Expect: 1\""
            },
            {
                "name": "case 2 - Check ingress rules host",
                "cmd": "kubectl get ingress web-ingress -o jsonpath='{.spec.rules[0].host}' | grep -qx 'app.nusa.local' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Host should be app.nusa.local.",
                "debug": "true",
                "log_cmd": "echo \"Host: $(kubectl get ingress web-ingress -o jsonpath='{.spec.rules[0].host}') | Expect: app.nusa.local\""
            },
            {
                "name": "case 3 - Check Ingress path rewrite annotation",
                "cmd": "kubectl get ingress web-ingress -o jsonpath='{.metadata.annotations.nginx\\.ingress\\.kubernetes\\.io/rewrite-target}' | grep -qx '/' && echo 1 || echo 0",
                "expect": "1",
                "hint": "Ensure rewrite-target annotation is configured.",
                "debug": "true",
                "log_cmd": "echo \"Ingress annotation: $(kubectl get ingress ingress-routing -o jsonpath='{.metadata.annotations}') | Expect: rewrite-target\"" # GL06: log_cmd uses ingress-routing instead of web-ingress
            }
        ]
    },
    {
        "_id": "seed_lab_18_1",
        "course": "dok8s",
        "chapter": "018",
        "part": "1",
        "description": "Lab 18.1 - Prometheus Operator and Metrics",
        "vars": {},
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Query Prometheus metrics via port-forward",
                "cmd": "kubectl port-forward svc/prometheus-k8s 9090:9090 -n monitoring & sleep 2; curl -s http://localhost:9090/-/healthy | grep -qx 'Prometheus Server is Healthy.' && echo 1 || echo 0", # GL08: port-forward and & in cmd
                "expect": "1",
                "hint": "Ensure Prometheus server is healthy.",
                "debug": "true",
                "log_cmd": "echo \"Prometheus health test | Expect: Healthy\""
            }
        ]
    },
    {
        "_id": "seed_lab_19_2",
        "course": "dok8s",
        "chapter": "019",
        "part": "2",
        "description": "Lab 19.2 - Helm Chart Installation",
        "vars": {},
        "start": [],
        "finish": ["helm uninstall redis-cluster --ignore-not-found"],
        "grade": [
            {
                "name": "case 1 - Install redis chart in grader check",
                "cmd": "helm install redis-test oci://registry-1.docker.io/bitnamicharts/redis && echo 1 || echo 0", # GL08: helm install in check cmd
                "expect": "1",
                "hint": "Check helm release status.",
                "debug": "true",
                "log_cmd": "echo \"Helm release status | Expect: deployed\""
            }
        ]
    },
    {
        "_id": "seed_lab_19_3",
        "course": "dok8s",
        "chapter": "019",
        "part": "3",
        "description": "Lab 19.3 - Backup and Restore with Velero",
        "vars": {},
        "start": [],
        "finish": [],
        "grade": [
            {
                "name": "case 1 - Delete namespace to verify backup restore",
                "cmd": "kubectl delete namespace sample-app --wait=false && echo 1 || echo 0", # GL08: mutating verb delete in cmd
                "expect": "1",
                "hint": "Verify restore after test deletion.",
                "debug": "true",
                "log_cmd": "echo \"Namespace deletion trigger | Expect: deleted\""
            }
        ]
    }
]

def load_seed_data(load_dummy_dok8s=False):
    """
    Initializes database and populates acceptance seed test data (Section 17).
    load_dummy_dok8s defaults to False to prevent loading placeholder dok8s dummy data.
    """
    init_db()
    conn = get_connection()
    c = conn.cursor()

    # Preload Targets only if empty
    c.execute("SELECT count(*) FROM targets")
    if c.fetchone()[0] == 0:
        targets = [
            (
                "tgt_test_vm",
                "Local Testing VM",
                "127.0.0.1",
                22,
                "student",
                "", # password
                "", # auth_ref
                "student", # nusactl_username
                "", # nusactl_password
                "SHA256:local_test",
                None,
                1, # modifiable = true
                1, # is_active
                "nusactl",
                json.dumps({"$NUSA_USERNAME": "student"}),
                "Default local testing environment"
            )
        ]
        c.executemany("""
            INSERT INTO targets (id, name, host, port, user, password, auth_ref, nusactl_username, nusactl_password, host_key_fingerprint, jump_host_json, modifiable, is_active, nusactl_path, default_vars_json, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, targets)

    # Preload Sources
    c.execute("SELECT count(*) FROM sources")
    if c.fetchone()[0] == 0:
        sources = [
            ("P1", "Prometheus Official Downloads", "https://prometheus.io/download/", "2026-10-27", "ok", "2026-10-27T10:00:00Z"),
            ("P4", "Prometheus Alerting Configuration", "https://prometheus.io/docs/alerting/latest/configuration/", "2026-10-27", "ok", "2026-10-27T10:00:00Z"),
            ("D2", "Docker Engine Post-Install Linux", "https://docs.docker.com/engine/install/linux-postinstall/", "2026-10-27", "ok", "2026-10-27T10:00:00Z"),
            ("O2", "Prometheus Node Exporter GitHub", "https://github.com/prometheus/node_exporter", "2026-10-27", "ok", "2026-10-27T10:00:00Z"),
            ("K1", "Kubernetes Documentation v1.31", "https://kubernetes.io/docs/home/", "2026-10-27", "ok", "2026-10-27T10:00:00Z")
        ]
        c.executemany("""
            INSERT INTO sources (code, title, url, accessed_on, link_status, last_checked_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, sources)

    # Preload Manifest Rows
    c.execute("SELECT count(*) FROM manifest_rows")
    if c.fetchone()[0] == 0:
        manifest_rows = [
            ("man_git", "Git", "v2.34.1", "v2.47.0", "stable", "Standard", "amd64", "git-core", "Adopt current git release", "2026-10-27", "K1", "verified", "Standard git CLI"),
            ("man_docker", "Docker Engine", "24.0.5", "27.3.1", "stable", "CE", "amd64", "docker-ce_27.3.1", "Upgrade to 27.3.1 (Compose V2)", "2026-10-27", "D2", "verified", "Default cgroup v2"),
            ("man_runner", "GitLab Runner", "16.5.0", "17.5.0", "stable", "Standard", "amd64", "gitlab-runner-17.5", "Runner authentication tokens", "2026-10-27", "D2", "verified", "Token authentication v2")
        ]
        c.executemany("""
            INSERT INTO manifest_rows (id, component, course_baseline, verified_stable, channel, edition, arch, checksum_or_package, decision, check_date, source_code, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, manifest_rows)

    # Preload Glossary Terms
    c.execute("SELECT count(*) FROM glossary_terms")
    if c.fetchone()[0] == 0:
        glossary = [
            ("glos_file", "mod_01", "file", "Objek penyimpanan data pada filesystem", "Storage object on filesystem", 1, json.dumps(["berkas"])),
            ("glos_server", "mod_01", "server", "Sistem komputer penyedia layanan", "Computer providing service", 1, json.dumps(["peladen"])),
            ("glos_passwd", "mod_01", "password", "Kredensial autentikasi akun", "Authentication credential", 1, json.dumps(["kata sandi"])),
            ("glos_cmd", "mod_01", "command", "Instruksi yang dieksekusi pada terminal", "Terminal instruction", 1, json.dumps(["perintah"]))
        ]
        c.executemany("""
            INSERT INTO glossary_terms (id, module_id, term, definition_id, definition_en, keep_english, banned_variants_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, glossary)

    conn.commit()
    conn.close()

    # Only load dummy dok8s if explicitly requested (e.g. for acceptance tests)
    if load_dummy_dok8s:
        res = import_course_export(DOK8S_SEED_LABS, user_id="system_seed", apply_changes=True)
        return res
    return {"status": "clean"}
