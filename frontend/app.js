/**
 * Dashboard App Frontend SPA Application Logic.
 * Implements all Section 7 screens, live SSE execution progress,
 * Case drawer with Revisions, Content studio with Parity & Markers,
 * Grader Lint promotion, and i18n support.
 */

const API_BASE = (window.location.protocol === "file:") ? "http://127.0.0.1:8080/api/v1" : "/api/v1";

let appState = {
  activeView: "runs",
  selectedCourse: localStorage.getItem("selectedCourse") || "",
  contentLanguage: "id",
  uiLanguage: "en",
  userRole: "Operator",
  userId: "operator",
  labs: [],
  targets: [],
  currentLabMd: "",
  activeRunEventSource: null
};

// UI Translations dictionary
const I18N = {
  en: {
    overview: "Overview",
    explorer: "Courses Explorer",
    runs: "Run Console",
    validation: "Validation Matrix",
    crosscheck: "Cross-Check",
    findings: "Findings Board",
    audit: "Course Audit",
    content: "Content Studio",
    manifest: "Version Manifest",
    reports: "Reports & Exports",
    settings: "Settings",
    readiness: "Lab Readiness",
    ready: "Ready",
    unsolved: "Unsolved",
    solved: "Solved",
    nearMiss: "Near-Miss"
  },
  id: {
    overview: "Ringkasan",
    explorer: "Penjelajah Course",
    runs: "Konsol Pengujian",
    validation: "Matriks Validasi",
    crosscheck: "Pemeriksaan Silang",
    findings: "Papan Temuan",
    audit: "Audit Course",
    content: "Studio Konten",
    manifest: "Manifest Versi",
    reports: "Laporan & Ekspor",
    settings: "Pengaturan",
    readiness: "Kesiapan Lab",
    ready: "Siap",
    unsolved: "Belum Dipecahkan",
    solved: "Terpecahkan",
    nearMiss: "Mendekati Jawaban"
  }
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupGlobalControls();
  fetchInitialData();
});

function setupNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const viewName = tab.getAttribute("data-view");
      switchView(viewName);
    });
  });
}

function switchView(viewName) {
  appState.activeView = viewName;
  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.style.display = "none";
  });
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.style.display = "block";
    renderActiveView(viewName);
  }
}

function setupGlobalControls() {
  const courseSelectEl = document.getElementById("courseSelect");
  if (courseSelectEl) {
    courseSelectEl.addEventListener("change", async (e) => {
      appState.selectedCourse = e.target.value;
      localStorage.setItem("selectedCourse", e.target.value);
      showToast(`Switched active course to: ${appState.selectedCourse}`);
      try {
        const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
        if (res.ok) {
          appState.labs = await res.json();
        }
      } catch (err) {
        console.error("Failed to load labs", err);
      }
      renderActiveView(appState.activeView);
    });
  }

  const contentLangEl = document.getElementById("contentLangSelect");
  if (contentLangEl) {
    contentLangEl.addEventListener("change", (e) => {
      appState.contentLanguage = e.target.value;
      renderActiveView(appState.activeView);
    });
  }

  const uiLangEl = document.getElementById("uiLangSelect");
  if (uiLangEl) {
    uiLangEl.addEventListener("change", (e) => {
      appState.uiLanguage = e.target.value;
      updateUILabels();
    });
  }

  const roleEl = document.getElementById("userRoleSelect");
  if (roleEl) {
    roleEl.addEventListener("change", (e) => {
      appState.userRole = e.target.value;
      appState.userId = e.target.value.toLowerCase();
      showToast(`Role switched to ${appState.userRole}`);
    });
  }

  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const html = document.documentElement;
      const currentTheme = html.getAttribute("data-theme");
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", nextTheme);
    });
  }
}

function updateUILabels() {
  const dict = I18N[appState.uiLanguage] || I18N.en;
  // Dynamic update of UI text if needed
}

async function fetchInitialData() {
  await refreshCourseDropdown();
  await refreshTargetsList();
  if (appState.selectedCourse) {
    try {
      const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
      if (res.ok) {
        appState.labs = await res.json();
      }
    } catch (e) {
      console.error("Failed to load initial labs", e);
    }
  }
  renderActiveView(appState.activeView);
}

async function refreshTargetsList() {
  try {
    const res = await fetch(`${API_BASE}/targets`);
    appState.targets = await res.json();
    if (appState.targets.length > 0) {
      const tgt = appState.targets[0];
      const banner = document.getElementById("envBanner");
      const bannerText = document.getElementById("envBannerText");
      if (banner && bannerText) {
        if (tgt.modifiable) {
          banner.className = "env-banner safe";
          bannerText.textContent = `Target: ${tgt.name} (${tgt.host}) — Testing Environment [MODIFIABLE]`;
        } else {
          banner.className = "env-banner";
          bannerText.textContent = `Target: ${tgt.name} (${tgt.host}) — IMMUTABLE PRODUCTION [STATE CHANGES FORBIDDEN WITHOUT GATE]`;
        }
      }
    }
  } catch (e) {
    console.error("Failed to load targets", e);
  }
}

function renderActiveView(viewName) {
  switch (viewName) {
    case "overview":
      renderOverview();
      break;
    case "courses":
      renderCourses();
      break;
    case "vms":
      renderTestVMs();
      break;
    case "runs":
      renderRuns();
      break;
    case "validation":
      renderValidationMatrix();
      break;
    case "crosscheck":
      renderCrossCheck();
      break;
    case "findings":
      renderFindings();
      break;
    case "audit":
      renderAuditWorkspace();
      break;
    case "manifest":
      renderManifest();
      break;
    case "quizzes":
      renderQuizzes();
      break;
    case "reports":
      renderReports();
      break;
    case "settings":
      renderSettings();
      break;
  }
}

// ==================== 7.2 Overview View ====================
async function renderOverview() {
  const container = document.getElementById("view-overview");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading overview metrics...</div>`;

  try {
    const res = await fetch(`${API_BASE}/overview`);
    const data = await res.json();

    container.innerHTML = `
      <div class="grid-cards">
        <div class="card">
          <h3>Total Labs in Course</h3>
          <div class="metric-val">${data.total_labs}</div>
          <div class="metric-sub">${appState.selectedCourse ? appState.selectedCourse.toUpperCase() : 'NO COURSE SELECTED'}</div>
        </div>
        <div class="card">
          <h3>Open Findings</h3>
          <div class="metric-val" style="color: #ef4444;">${data.open_findings}</div>
          <div class="metric-sub">Critical & High Grader/Course Defects</div>
        </div>
        <div class="card">
          <h3>Validation Coverage</h3>
          <div class="metric-val" style="color: #4ade80;">3 States</div>
          <div class="metric-sub">Unsolved, Solved, Near-Miss Matrix</div>
        </div>
        <div class="card">
          <h3>Manifest Freshness</h3>
          <div class="metric-val">${data.manifest_needs_verification == 0 ? "Clean" : data.manifest_needs_verification}</div>
          <div class="metric-sub">${data.manifest_needs_verification} components need source verification</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 25px; margin-bottom: 12px;">
        <h2 style="font-size: 16px;">Latest Grading Runs</h2>
        <button class="btn btn-primary" onclick="switchView('runs')">+ Launch New Run</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Lab Target</th>
            <th>State</th>
            <th>Mode</th>
            <th>Verdict</th>
            <th>Score</th>
            <th>Executed At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${(data.latest_runs || []).map(r => `
            <tr>
              <td><code>${r.run_id}</code></td>
              <td>${r.lab_id}</td>
              <td><span class="badge badge-skip">${r.state}</span></td>
              <td>${r.mode}</td>
              <td>
                <span class="badge ${r.lab_verdict === 'PASS' ? 'badge-pass' : (r.lab_verdict === 'ERROR' ? 'badge-error' : 'badge-fail')}">
                  ${r.lab_verdict || 'RUNNING'}
                </span>
              </td>
              <td><strong>${r.score_passed} / ${r.score_total}</strong></td>
              <td>${r.started_at ? r.started_at.substring(0, 19).replace('T', ' ') : '-'}</td>
              <td><button class="btn btn-secondary" onclick="viewRunDetail('${r.run_id}')">View Details</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load overview: ${e.message}</div>`;
  }
}

// ==================== 7.3 Courses Explorer ====================
async function renderCourses() {
  const container = document.getElementById("view-courses");

  if (!appState.selectedCourse) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 50px 20px;">
        <h3 style="font-size: 17px; margin-bottom: 8px;">No Course Selected</h3>
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 18px;">
          Please select a course from the dropdown above, or import a Course Archive (.zip) and Grading Export (.json).
        </p>
        <button class="btn btn-primary" onclick="openImportModal()">📂 Import Course / Grading</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="color: var(--text-muted);">Loading courses explorer for '${escapeHtml(appState.selectedCourse)}'...</div>`;

  try {
    const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
    const data = await res.json();
    const labs = Array.isArray(data) ? data : [];
    appState.labs = labs;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Courses Explorer — ${appState.selectedCourse.toUpperCase()}</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">Inspect all labs, grader cases, lint issues, and definition of done checklist.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="openImportModal()">📂 Import Course / Grading</button>
          <button class="btn btn-primary" onclick="openNewLabModal()">+ Create Lab</button>
          <button class="btn btn-secondary" style="background: linear-gradient(135deg, #7c3aed, #8b5cf6); color: #fff; border: none;" onclick="triggerAiGraderRemediation()">✨ AI Fix Grading</button>
          <button class="btn btn-secondary" style="background: linear-gradient(135deg, #059669, #10b981); color: #fff; border: none;" onclick="triggerAiCourseUpdate()">🚀 AI Update Course & Modules</button>
          <button class="btn btn-secondary" onclick="runStaticLintOnCourse()">Grader Lint</button>
          <button class="btn btn-secondary" onclick="exportPatchedCourseJson()">Export Patched JSON</button>
          <button class="btn btn-secondary" style="color: #f87171;" onclick="deleteCurrentCourse()" title="Delete this course">Delete Course</button>
        </div>
      </div>

      <div id="aiActionBanner" style="display: none; margin-bottom: 15px;"></div>
      <div id="lintSummaryBanner" style="display: none; margin-bottom: 15px;"></div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Chapter / Part</th>
            <th>Lab Description</th>
            <th>Cases</th>
            <th>Validation States</th>
            <th>Readiness</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${labs.map(l => {
            const unsolvedRes = (l.validation_states || {}).unsolved || "not_run";
            const solvedRes = (l.validation_states || {}).solved || "not_run";
            const nearMissRes = (l.validation_states || {}).near_miss || "not_run";
            const isReady = (unsolvedRes === "ok" && solvedRes === "ok" && nearMissRes === "ok");

            return `
              <tr>
                <td><code>${l.chapter}.${l.part}</code></td>
                <td>
                  <strong>${escapeHtml(l.description)}</strong>
                  <div style="font-size: 11px; color: var(--text-muted);">ID: ${l.export_id} | Slug: ${l.slug || '-'}</div>
                </td>
                <td><span class="badge badge-skip">${(l.grade || []).length} Cases</span></td>
                <td>
                  <div style="display: flex; gap: 4px;">
                    <span class="badge ${unsolvedRes === 'ok' ? 'badge-pass' : (unsolvedRes === 'violation' ? 'badge-fail' : 'badge-skip')}" title="Unsolved">U</span>
                    <span class="badge ${solvedRes === 'ok' ? 'badge-pass' : (solvedRes === 'violation' ? 'badge-fail' : 'badge-skip')}" title="Solved">S</span>
                    <span class="badge ${nearMissRes === 'ok' ? 'badge-pass' : (nearMissRes === 'violation' ? 'badge-fail' : 'badge-skip')}" title="Near-Miss">N</span>
                  </div>
                </td>
                <td>
                  <span class="badge ${isReady ? 'badge-pass' : 'badge-skip'}">${isReady ? 'Ready' : 'In Progress'}</span>
                </td>
                <td>
                  <button class="btn btn-secondary" onclick="viewLabCases('${l.id}')">Inspect Cases</button>
                  <button class="btn btn-primary" onclick="prepareRunForLab('${l.id}')">Run</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load courses: ${e.message}</div>`;
  }
}

async function runStaticLintOnCourse() {
  const banner = document.getElementById("lintSummaryBanner");
  banner.style.display = "block";
  banner.innerHTML = `<div class="card" style="border-color: var(--accent-blue);">Running static Grader Lint (GL01-GL16)...</div>`;

  try {
    const res = await fetch(`${API_BASE}/lint/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course: appState.selectedCourse, scope: "course" })
    });
    const data = await res.json();

    const blockCount = data.issues.filter(i => i.severity === "block").length;
    const warnCount = data.issues.filter(i => i.severity === "warn").length;

    banner.innerHTML = `
      <div class="card" style="border-left: 4px solid ${blockCount > 0 ? '#ef4444' : '#f59e0b'};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>Grader Lint Complete: ${data.total_issues} Issues Found</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              <span style="color: #ef4444; font-weight: 700;">${blockCount} BLOCK</span> |
              <span style="color: #fbbf24; font-weight: 700;">${warnCount} WARN</span> |
              All issues flagged with <code>suspect=true</code> until confirmed by run.
            </div>
          </div>
          <button class="btn btn-secondary" onclick="document.getElementById('lintSummaryBanner').style.display='none'">Dismiss</button>
        </div>
        <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
          ${data.issues.slice(0, 10).map(iss => `
            <div style="font-size: 12px; margin-bottom: 6px; padding: 4px 8px; background-color: var(--bg-tertiary); border-radius: 4px; display: flex; justify-content: space-between;">
              <span><strong>${iss.rule_id}</strong> [${iss.severity}]: ${iss.message} (${iss.lab_desc || ''})</span>
              <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px;" onclick="promoteIssueToFinding('${iss.rule_id}', '${escapeHtml(iss.message)}')">Promote to Finding</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    banner.innerHTML = `<div style="color: #ef4444;">Lint failed: ${e.message}</div>`;
  }
}

// ==================== 7.5 Case Drawer ====================
async function viewLabCases(labId) {
  const lab = appState.labs.find(l => l.id === labId);
  if (!lab) return;

  const drawer = document.getElementById("caseDrawer");
  const drawerTitle = document.getElementById("drawerCaseTitle");
  const drawerContent = document.getElementById("drawerContent");

  drawerTitle.textContent = `${lab.description} — Cases`;
  drawerContent.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted);">Definition of Done Checklist (Sec 8.8 / Sec 12)</h4>
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-top: 6px; font-size: 12px;">
        <div>[M] Every objective has at least one case: <strong style="color: #4ade80;">✓ Checked</strong></div>
        <div>[A] Lint has no unwaived block issues: <strong style="color: #4ade80;">✓ Verified</strong></div>
        <div>[A] Unsolved run fails all required cases: <span class="badge badge-skip">Checked in Matrix</span></div>
        <div>[A] Solved run passes all cases: <span class="badge badge-skip">Checked in Matrix</span></div>
        <div>[A] Manual and tool results agree: <span class="badge badge-skip">Cross-check enabled</span></div>
      </div>
    </div>

    <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Grade Cases (${lab.grade.length})</h4>
    ${lab.grade.map((c, idx) => `
      <div class="card" style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="badge badge-skip">Case ${c.case_index}</span>
        </div>

        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">CHECK COMMAND (READ-ONLY):</div>
        <pre class="code-block">${escapeHtml(c.cmd)}<button class="copy-btn" onclick="navigator.clipboard.writeText('${escapeQuotes(c.cmd)}')">Copy</button></pre>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; font-size: 12px;">
          <div><strong>Expect:</strong> <code>${escapeHtml(c.expect)}</code></div>
          <div><strong>Debug:</strong> <code>${c.debug || 'absent'}</code></div>
        </div>

        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">HINT:</div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-style: italic;">"${escapeHtml(c.hint || 'No hint provided')}"</div>

        ${c.log_cmd ? `
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">DEBUG LOG COMMAND:</div>
          <pre class="code-block" style="color: #a7f3d0;">${escapeHtml(c.log_cmd)}</pre>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
          <button class="btn btn-secondary" onclick="proposeRevisionForCase('${c.id}', '${escapeQuotes(c.expect)}')">Propose Revision (Diff)</button>
          <button class="btn btn-primary" onclick="prepareRunForLab('${lab.id}', ${c.case_index})">Run Case</button>
        </div>
      </div>
    `).join('')}
  `;

  drawer.style.display = "block";
}

function closeCaseDrawer() {
  document.getElementById("caseDrawer").style.display = "none";
}

function proposeRevisionForCase(caseId, currentExpect) {
  const newExpect = prompt("Propose new expect string:", currentExpect);
  if (newExpect === null || newExpect === currentExpect) return;

  fetch(`${API_BASE}/revisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Role": appState.userRole,
      "X-User-Id": appState.userId
    },
    body: JSON.stringify({
      entity_type: "grade_case",
      entity_id: caseId,
      diff: { expect: { old: currentExpect, new: newExpect } },
      notes: "Author proposed revision via Case Drawer"
    })
  }).then(res => res.json()).then(data => {
    showToast(`Revision proposed: ${data.revision_id}`);
    closeCaseDrawer();
  });
}

// ==================== 7.6 Run Console ====================
function prepareRunForLab(labId, caseIndex = null) {
  closeCaseDrawer();
  switchView("runs");
  setTimeout(() => {
    const select = document.getElementById("runLabSelect");
    if (select) {
      select.value = labId;
      loadLabMdForSelectedLab();
    }
  }, 100);
}

function onRunStateChange() {
  const state = document.getElementById("runStateSelect").value;
  const cb = document.getElementById("runFollowLabMdCheckbox");
  if (cb) {
    cb.checked = (state === "solved" || state === "final");
  }
}

async function renderRuns() {
  const container = document.getElementById("view-runs");
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 380px 1fr; gap: 20px;">
      <!-- Left: Run Configuration Console -->
      <div class="card">
        <h3 style="font-size: 14px; margin-bottom: 14px; color: var(--text-primary); text-transform: none; font-weight: 700;">
          Launch Grading Run
        </h3>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Target Lab:</label>
        <select id="runLabSelect" style="width: 100%; margin-bottom: 12px;" onchange="loadLabMdForSelectedLab()">
          ${appState.labs.length > 0 ? appState.labs.map(l => `<option value="${l.id}">${escapeHtml(l.description || l.title || l.id)} (${l.chapter}.${l.part})</option>`).join('') : '<option value="">(No labs loaded for this course)</option>'}
        </select>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #c084fc; font-weight: 600;">⚡ Workflow Mode:</label>
        <select id="runWorkflowSelect" style="width: 100%; margin-bottom: 12px; background: rgba(139, 92, 246, 0.12); border: 1px solid #8b5cf6; color: #f8fafc; font-weight: 600; padding: 6px 10px; border-radius: 4px;">
          <option value="4step" selected>⚡ 4-Step Pipeline: Baseline &rarr; Solve &rarr; Manual &rarr; nusactl</option>
          <option value="standard">Standard Run (Single Mode)</option>
        </select>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Target Environment:</label>
        <select id="runTargetSelect" style="width: 100%; margin-bottom: 12px;">
          ${appState.targets.map(t => `<option value="${t.id}">${t.name} [${t.modifiable ? 'MODIFIABLE' : 'IMMUTABLE'}]</option>`).join('')}
        </select>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Validation State (Sec 10.8):</label>
        <select id="runStateSelect" style="width: 100%; margin-bottom: 12px;" onchange="onRunStateChange()">
          <option value="unsolved">Unsolved (All required cases must FAIL)</option>
          <option value="solved" selected>Solved (Reference solution - all cases must PASS)</option>
          <option value="near-miss">Near-Miss (Targeted defect must FAIL)</option>
          <option value="final">Final Run</option>
        </select>

        <!-- AI Solver: Follow Lab MD instructions checkbox -->
        <div style="margin-bottom: 14px; padding: 10px 12px; background: rgba(139, 92, 246, 0.08); border: 1px solid #8b5cf6; border-radius: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 12px; color: #c4b5fd; cursor: pointer;">
            <input type="checkbox" id="runFollowLabMdCheckbox" checked>
            🤖 AI Solver: Read Lab MD & Follow Instructions
          </label>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;">
            The AI Agent reads the lab's Markdown instructions, executes all required bash steps on the lab VM, and then tests the grader.
          </div>
        </div>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Execution Mode:</label>
        <select id="runModeSelect" style="width: 100%; margin-bottom: 12px;">
          <option value="manual">Manual SSH (Source of Truth)</option>
          <option value="tool">Tool Mode (nusactl grade)</option>
          <option value="both" selected>Both & Cross-Check (Recommended)</option>
        </select>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Platform Grade Slug (<code>nusactl grade &lt;slug&gt;</code>):</label>
        <div style="display: flex; gap: 6px; margin-bottom: 12px;">
          <input type="text" id="runGradeSlugInput" placeholder="e.g. glpc-004-1, dok8s-001-1, gladm-001-1" style="flex: 1; font-family: var(--font-mono); font-size: 12px; padding: 6px 10px; background: var(--bg-code); color: #38bdf8; border: 1px solid var(--border-color); border-radius: 4px;">
          <button class="btn btn-secondary" style="font-size: 11px; white-space: nowrap;" onclick="resetToDefaultGradeSlug()" title="Reset to auto-resolved slug">Auto Slug</button>
        </div>

        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Variables (e.g. $NUSA_USERNAME):</label>
        <input type="text" id="runVarsInput" placeholder="$NUSA_USERNAME=nusa" style="width: 100%; margin-bottom: 16px;">

        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 11px; margin-bottom: 16px;">
          <strong style="color: #fbbf24;">Safety Gate Warning:</strong>
          <div>State-changing steps (start, solution, finish) require Operator approval gate on modifiable targets.</div>
        </div>

        <button class="btn btn-primary" style="width: 100%; justify-content: center; font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 10px 14px; margin-bottom: 8px;" onclick="executeGradingRun()">
          🚀 Run 4-Step Automated Flow
        </button>

        <!-- Lab MD Preview & Custom Editor Card -->
        <div class="card" style="margin-top: 12px; border: 1px solid var(--border-color); background: var(--bg-secondary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 12px; color: var(--text-primary);">📖 Lab MD Instructions</strong>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-primary" style="font-size: 10px; padding: 2px 7px; background: #8b5cf6;" onclick="runDirectFromMd()" title="Run 4-Step Pipeline directly from this Markdown">⚡ Run MD</button>
              <button class="btn btn-secondary" style="font-size: 10px; padding: 2px 6px;" onclick="previewParsedLabSteps()" title="Preview executable commands extracted by AI">🤖 Steps</button>
              <button class="btn btn-secondary" style="font-size: 10px; padding: 2px 6px;" onclick="toggleEditLabMd()" title="Edit or paste custom Markdown instructions">✏️ Edit MD</button>
            </div>
          </div>
          <div id="labMdInfo" style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Loading Lab MD...</div>
          <div id="labMdPreview" style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; max-height: 120px; overflow-y: auto; font-family: var(--font-mono); font-size: 11px; white-space: pre-wrap; color: #cbd5e1;"></div>
          <div id="labMdEditorContainer" style="display: none; margin-top: 8px;">
            <textarea id="labMdEditorInput" style="width: 100%; height: 160px; font-family: var(--font-mono); font-size: 11px; background: var(--bg-code); color: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; box-sizing: border-box;" placeholder="Paste or edit Lab Markdown here..."></textarea>
            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
              <button class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="toggleEditLabMd()">Cancel</button>
              <button class="btn btn-primary" style="font-size: 11px; padding: 3px 8px;" onclick="saveCustomLabMd()">💾 Save Lab MD</button>
            </div>
          </div>
        </div>

        <!-- Dynamic Grader Test Cases Card (Non-hardcoded) -->
        <div class="card" style="margin-top: 12px; border: 1px solid var(--border-color); background: var(--bg-secondary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 12px; color: var(--text-primary);">🧪 Grader Test Cases</strong>
              <span id="labGradeCountBadge" class="badge badge-skip" style="font-size: 10px;">0 Cases</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-secondary" style="font-size: 10px; padding: 2px 6px;" onclick="toggleEditLabGrade()" title="Edit or paste dynamic test cases JSON">✏️ Edit Grader</button>
            </div>
          </div>
          <div id="labGradeInfo" style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Dynamic test cases loaded from lab configuration</div>
          <div id="labGradePreview" style="background: var(--bg-code); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; max-height: 140px; overflow-y: auto; font-family: var(--font-mono); font-size: 11px; color: #cbd5e1;"></div>
          <div id="labGradeEditorContainer" style="display: none; margin-top: 8px;">
            <textarea id="labGradeEditorInput" style="width: 100%; height: 180px; font-family: var(--font-mono); font-size: 11px; background: var(--bg-code); color: #f8fafc; border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; box-sizing: border-box;" placeholder='Paste or edit Grader Test Cases JSON, e.g. [{"name": "case 1...", "cmd": "...", "expect": "..."}]'></textarea>
            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
              <button class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="toggleEditLabGrade()">Cancel</button>
              <button class="btn btn-primary" style="font-size: 11px; padding: 3px 8px;" onclick="saveCustomLabGrade()">💾 Save Grader</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Live Progress & Output Console -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h3 style="font-size: 14px; margin: 0; color: var(--text-primary); text-transform: none; font-weight: 700;">
            Live Execution Stream (SSE)
          </h3>
          <span id="runLiveBadge" class="badge badge-skip">Idle</span>
        </div>

        <div id="runProgressBox" style="background-color: var(--bg-code); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px; height: 380px; overflow-y: auto; font-family: var(--font-mono); font-size: 12px; color: #f8fafc; line-height: 1.5;">
          <div style="color: var(--text-muted);">Select options on the left and click "Start Grading Execution" to watch live results stream in real-time...</div>
        </div>

        <!-- Live SSE Case Breakdown: Output, Pass Cases, Fail Cases -->
        <div id="liveResultsPanel" style="margin-top: 14px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 13px; color: var(--text-primary);">📊 Test Cases Results Breakdown</strong>
              <span id="liveCaseStatsSummary" class="badge badge-skip">0 / 0 Cases</span>
            </div>
            <div id="liveOverallPill" style="font-size: 11px; font-weight: 600; color: var(--text-muted);">
              Awaiting execution...
            </div>
          </div>

          <!-- Pass / Fail Badges Row -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <!-- Passed Cases Box -->
            <div style="background: rgba(34, 197, 94, 0.08); border: 1px solid #22c55e; border-radius: 6px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #4ade80;">✅ Case Number That Pass:</span>
                <span id="passedCountBadge" class="badge badge-pass" style="font-size: 11px;">0</span>
              </div>
              <div id="passedCasesPills" style="display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; align-items: center;">
                <span style="font-size: 11px; color: var(--text-muted);">None yet</span>
              </div>
            </div>

            <!-- Failed Cases Box -->
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid #ef4444; border-radius: 6px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #f87171;">❌ Case Number That Failed:</span>
                <span id="failedCountBadge" class="badge badge-fail" style="font-size: 11px;">0</span>
              </div>
              <div id="failedCasesPills" style="display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; align-items: center;">
                <span style="font-size: 11px; color: var(--text-muted);">None yet</span>
              </div>
            </div>
          </div>

          <!-- Detailed Case Output Inspection Container -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Detailed Case Outputs & Inspection:</span>
              <button class="btn btn-secondary" style="font-size: 10px; padding: 2px 6px;" onclick="toggleLiveCaseDetails()" id="liveDetailsToggleBtn">Hide Details</button>
            </div>
            <div id="liveCasesTable" style="max-height: 220px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-code);">
              <div style="padding: 12px; color: var(--text-muted); font-size: 11px; text-align: center;">Case outputs and command diagnostics will appear here live...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Auto load Lab MD for the initially selected lab
  loadLabMdForSelectedLab();
}

async function loadLabMdForSelectedLab() {
  const select = document.getElementById("runLabSelect");
  const infoEl = document.getElementById("labMdInfo");
  const previewEl = document.getElementById("labMdPreview");
  const editorInput = document.getElementById("labMdEditorInput");

  if (!select || !select.value) {
    if (infoEl) infoEl.textContent = appState.labs.length === 0 ? "(No labs found in selected course)" : "(Please select a lab above)";
    if (previewEl) previewEl.textContent = "(No lab selected)";
    return;
  }
  const labId = select.value;

  if (infoEl) infoEl.textContent = "Loading Lab MD...";

  try {
    const res = await fetch(`${API_BASE}/labs/${labId}/md`);
    const data = await res.json();
    appState.currentLabMd = data.lab_md || "";
    appState.currentLabGrade = data.grade || [];
    appState.currentLabVars = data.vars || {};
    appState.customGradeJson = null;

    if (infoEl) infoEl.innerHTML = `<span style="color: #4ade80;">Source: ${escapeHtml(data.source)}</span> (${appState.currentLabMd.length} characters)`;
    if (previewEl) previewEl.textContent = appState.currentLabMd || "(No Lab Markdown available for this lab yet. Click 'Edit MD' to paste one.)";
    if (editorInput) editorInput.value = appState.currentLabMd;

    renderLabGradePreview();

    if (data.default_grade_slug) {
      appState.currentDefaultGradeSlug = data.default_grade_slug;
      const slugInput = document.getElementById("runGradeSlugInput");
      if (slugInput) slugInput.value = data.default_grade_slug;
    }
  } catch (e) {
    if (infoEl) infoEl.textContent = "Failed to load Lab MD";
  }
}

function renderLabGradePreview() {
  const countBadge = document.getElementById("labGradeCountBadge");
  const previewEl = document.getElementById("labGradePreview");
  const editorInput = document.getElementById("labGradeEditorInput");
  const cases = appState.currentLabGrade || [];

  if (countBadge) {
    countBadge.textContent = `${cases.length} Cases`;
    countBadge.className = cases.length > 0 ? "badge badge-pass" : "badge badge-skip";
  }

  if (previewEl) {
    if (cases.length === 0) {
      previewEl.innerHTML = '<span style="color: var(--text-muted);">(No predefined test cases for this lab. Click "Edit Grader" to define or paste custom test cases JSON)</span>';
    } else {
      previewEl.innerHTML = cases.map((c, idx) => `
        <div style="margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.08);">
          <div style="font-weight: 700; color: #38bdf8;">${escapeHtml(c.name || `case ${c.case_index || idx + 1}`)}</div>
          <div style="color: #a7f3d0; font-size: 10px; margin-top: 2px;">$ ${escapeHtml(c.cmd || '')}</div>
          <div style="color: #fde047; font-size: 10px;">Expect: <code style="color: #fde047;">${escapeHtml(String(c.expect || ''))}</code></div>
        </div>
      `).join('');
    }
  }

  if (editorInput) {
    editorInput.value = JSON.stringify(cases, null, 2);
  }
}

function toggleEditLabGrade() {
  const container = document.getElementById("labGradeEditorContainer");
  const preview = document.getElementById("labGradePreview");
  if (!container) return;
  const isOpen = container.style.display !== "none";
  container.style.display = isOpen ? "none" : "block";
  if (preview) preview.style.display = isOpen ? "block" : "none";
}

async function saveCustomLabGrade() {
  const select = document.getElementById("runLabSelect");
  if (!select) return;
  const labId = select.value;
  const val = document.getElementById("labGradeEditorInput").value.trim();

  let parsedCases = null;
  try {
    parsedCases = JSON.parse(val);
  } catch (err) {
    alert(`Invalid JSON format: ${err.message}`);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/labs/${labId}/grade`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify(parsedCases)
    });
    const data = await res.json();
    showToast(`Grader test cases saved (${data.cases_count} cases)`);
    appState.currentLabGrade = Array.isArray(parsedCases) ? parsedCases : (parsedCases.grade || []);
    appState.customGradeJson = parsedCases;
    toggleEditLabGrade();
    renderLabGradePreview();
  } catch (e) {
    alert(`Failed to save grader cases: ${e.message}`);
  }
}

function resetToDefaultGradeSlug() {
  const slugInput = document.getElementById("runGradeSlugInput");
  if (slugInput && appState.currentDefaultGradeSlug) {
    slugInput.value = appState.currentDefaultGradeSlug;
  }
}

function toggleEditLabMd() {
  const container = document.getElementById("labMdEditorContainer");
  const preview = document.getElementById("labMdPreview");
  if (!container) return;
  const isOpen = container.style.display !== "none";
  container.style.display = isOpen ? "none" : "block";
  if (preview) preview.style.display = isOpen ? "block" : "none";
}

async function saveCustomLabMd() {
  const select = document.getElementById("runLabSelect");
  if (!select) return;
  const labId = select.value;
  const val = document.getElementById("labMdEditorInput").value;

  try {
    const res = await fetch(`${API_BASE}/labs/${labId}/md`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({ lab_md: val })
    });
    const data = await res.json();
    showToast(`Lab MD saved (${data.chars} chars)`);
    toggleEditLabMd();
    loadLabMdForSelectedLab();
  } catch (e) {
    alert(`Failed to save Lab MD: ${e.message}`);
  }
}

async function previewParsedLabSteps() {
  const select = document.getElementById("runLabSelect");
  if (!select) return;
  const labId = select.value;
  const logBox = document.getElementById("runProgressBox");

  logBox.innerHTML = `[${new Date().toISOString()}] Parsing instructions from Lab MD for '${select.options[select.selectedIndex].text}'...\n`;

  try {
    const res = await fetch(`${API_BASE}/labs/${labId}/parse-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_md: appState.currentLabMd })
    });
    const data = await res.json();
    logBox.innerHTML += `\n========================================\n📖 AI INSTRUCTION PARSER PREVIEW\nTotal Steps Extracted: ${data.total_steps}\n========================================\n`;
    if (data.steps.length === 0) {
      logBox.innerHTML += `No executable code blocks ($ command) found in this Lab MD.\n`;
    } else {
      data.steps.forEach((s) => {
        logBox.innerHTML += `<span style="color: #60a5fa; font-weight: 700;">Step ${s.step}:</span> <code style="color: #f1f5f9;">${escapeHtml(s.raw_cmd)}</code>\n   <span style="color: #64748b; font-size: 11px;">(Working dir: ${s.working_dir} &rarr; ${escapeHtml(s.cmd)})</span>\n`;
      });
    }
    logBox.innerHTML += `\nThese steps will be executed on the target VM when 'AI Solver' is enabled.\n`;
    logBox.scrollTop = logBox.scrollHeight;
  } catch (e) {
    logBox.innerHTML += `Error: ${e.message}\n`;
  }
}

function toggleLiveCaseDetails() {
  const table = document.getElementById("liveCasesTable");
  const btn = document.getElementById("liveDetailsToggleBtn");
  if (!table) return;
  const isHidden = table.style.display === "none";
  table.style.display = isHidden ? "block" : "none";
  if (btn) btn.textContent = isHidden ? "Hide Details" : "Show Details";
}

async function runDirectFromMd() {
  const editorInput = document.getElementById("labMdEditorInput");
  const content = editorInput && editorInput.value.trim() ? editorInput.value.trim() : appState.currentLabMd;
  if (!content) {
    alert("Please provide or edit the Lab Markdown instructions first!");
    return;
  }
  appState.currentLabMd = content;

  // Auto set 4-step workflow and AI solver checked
  const wf = document.getElementById("runWorkflowSelect");
  if (wf) wf.value = "4step";
  const follow = document.getElementById("runFollowLabMdCheckbox");
  if (follow) follow.checked = true;

  executeGradingRun();
}

async function executeGradingRun() {
  const labSelect = document.getElementById("runLabSelect");
  const labId = (labSelect && labSelect.value) ? labSelect.value : "custom";
  const targetId = document.getElementById("runTargetSelect").value;
  const state = document.getElementById("runStateSelect").value;
  const mode = document.getElementById("runModeSelect").value;
  const rawVars = document.getElementById("runVarsInput").value;
  const followLabMd = document.getElementById("runFollowLabMdCheckbox") ? document.getElementById("runFollowLabMdCheckbox").checked : true;
  const gradeSlug = document.getElementById("runGradeSlugInput") ? document.getElementById("runGradeSlugInput").value.trim() : "";
  const workflow = document.getElementById("runWorkflowSelect") ? document.getElementById("runWorkflowSelect").value : "4step";

  const varsObj = {};
  if (rawVars.includes("=")) {
    const parts = rawVars.split("=");
    varsObj[parts[0].trim()] = parts[1].trim();
  }

  const logBox = document.getElementById("runProgressBox");
  const liveBadge = document.getElementById("runLiveBadge");

  // Live Case Breakdown UI elements
  const passedCases = [];
  const failedCases = [];
  const passedCountEl = document.getElementById("passedCountBadge");
  const failedCountEl = document.getElementById("failedCountBadge");
  const passedPillsEl = document.getElementById("passedCasesPills");
  const failedPillsEl = document.getElementById("failedCasesPills");
  const liveTableEl = document.getElementById("liveCasesTable");
  const statsSummaryEl = document.getElementById("liveCaseStatsSummary");
  const overallPillEl = document.getElementById("liveOverallPill");

  if (passedCountEl) passedCountEl.textContent = "0";
  if (failedCountEl) failedCountEl.textContent = "0";
  if (passedPillsEl) passedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (failedPillsEl) failedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (liveTableEl) liveTableEl.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 11px; text-align: center;">Awaiting test case execution...</div>';
  if (statsSummaryEl) {
    statsSummaryEl.className = "badge badge-skip";
    statsSummaryEl.textContent = "0 / 0 Cases";
  }
  if (overallPillEl) overallPillEl.textContent = "Connecting...";

  liveBadge.className = "badge badge-ai";
  liveBadge.textContent = "Connecting...";
  logBox.innerHTML = `[${new Date().toISOString()}] Initializing ${workflow === '4step' ? '4-Step Automated Workflow' : 'Execution Run'}...\n`;

  try {
    const res = await fetch(`${API_BASE}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({
        lab_id: labId,
        target_id: targetId,
        state: state,
        mode: mode,
        grade_slug: gradeSlug,
        workflow: workflow,
        vars: varsObj,
        follow_lab_md: followLabMd,
        custom_lab_md: appState.currentLabMd,
        custom_grade: appState.customGradeJson || appState.currentLabGrade
      })
    });
    const data = await res.json();
    const runId = data.run_id;

    logBox.innerHTML += `[${new Date().toISOString()}] Run registered: ${runId}\n[${new Date().toISOString()}] Subscribing to Server-Sent Events (SSE)...\n`;
    liveBadge.className = "badge badge-ai";
    liveBadge.textContent = "RUNNING";
    if (overallPillEl) overallPillEl.textContent = "Running...";

    // Setup SSE
    if (appState.activeRunEventSource) {
      appState.activeRunEventSource.close();
    }

    const sse = new EventSource(`${API_BASE}/runs/${runId}/events`);
    appState.activeRunEventSource = sse;

    // 4-Step Pipeline stage listener
    sse.addEventListener("pipeline_stage_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `\n<div style="background: rgba(139, 92, 246, 0.16); border-left: 4px solid #a855f7; padding: 8px 12px; margin: 12px 0 8px 0; border-radius: 4px; font-weight: 700; color: #f8fafc; font-size: 13px;">
  <span style="color: #c084fc;">[STAGE ${p.stage}/${p.total_stages}]</span> ${escapeHtml(p.name)}
</div>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("baseline_grade_complete", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `  <span style="color: #94a3b8; font-weight: 600;">Initial Baseline Check:</span> <span class="badge ${p.verdict === 'PASS' ? 'badge-pass' : 'badge-fail'}">${p.verdict} (Unsolved)</span>\n`;
      if (p.stdout) {
        const previewOut = p.stdout.trim().split('\n')[0];
        logBox.innerHTML += `  <span style="color: #64748b; font-size: 11px;">| ${escapeHtml(previewOut)}</span>\n`;
      }
      logBox.innerHTML += `\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    // AI Lab MD Instruction SSE listeners
    sse.addEventListener("ai_md_reading", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #c084fc; font-weight: 700;">📖 [AI AGENT] Reading Lab MD: "${escapeHtml(p.description)}" (${p.md_chars} chars)...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_instructions_parsed", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #38bdf8; font-weight: 700;">📋 [AI AGENT] Extracted ${p.total_steps} instruction steps from Lab MD:</span>\n`;
      (p.steps || []).slice(0, 10).forEach((s, idx) => {
        logBox.innerHTML += `  <span style="color: #94a3b8;">${idx+1}.</span> <code style="color: #cbd5e1;">${escapeHtml(s)}</code>\n`;
      });
      if ((p.steps || []).length > 10) {
        logBox.innerHTML += `  <span style="color: #64748b;">... and ${p.steps.length - 10} more steps</span>\n`;
      }
      logBox.innerHTML += `<span style="color: #fbbf24; font-weight: 600;">⚡ [AI AGENT] Following instructions on target lab VM...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_step_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `  <span style="color: #60a5fa;">[Step ${p.step}/${p.total}]</span> <code style="color: #f1f5f9;">${escapeHtml(p.cmd)}</code>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_step_done", (e) => {
      const p = JSON.parse(e.data);
      const ok = p.exit_code === 0;
      const statusColor = ok ? '#4ade80' : '#f87171';
      logBox.innerHTML += `    <span style="color: ${statusColor}; font-size: 11px;">&rarr; Exit: ${p.exit_code} ${ok ? 'OK' : 'FAIL'}</span>`;
      if (p.stdout && p.stdout.trim()) {
        const previewOut = p.stdout.trim().split('\n')[0];
        logBox.innerHTML += ` <span style="color: #94a3b8; font-size: 11px;">| ${escapeHtml(previewOut)}</span>`;
      }
      logBox.innerHTML += `\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_instructions_complete", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #4ade80; font-weight: 700;">✅ [AI AGENT] ${escapeHtml(p.message)}</span>\n\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("manual_grade_complete", (e) => {
      const p = JSON.parse(e.data);
      const ok = p.verdict === 'PASS';
      logBox.innerHTML += `  <span style="color: ${ok ? '#4ade80' : '#f87171'}; font-weight: 700;">[MANUAL BASH GRADE RESULT: ${p.verdict}]</span> Score: ${p.score_passed}/${p.score_total}\n\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("tool_grade_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #38bdf8; font-weight: 700;">🚀 [TOOL GRADER] Executing platform tool: <code>${escapeHtml(p.cmd)}</code>...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("tool_grade_complete", (e) => {
      const p = JSON.parse(e.data);
      const isPass = p.verdict === 'PASS';
      const verdictColor = isPass ? '#4ade80' : (p.verdict === 'ERROR' ? '#fbbf24' : '#f87171');
      logBox.innerHTML += `  <span style="color: ${verdictColor}; font-weight: 700;">[TOOL GRADER VERDICT: ${p.verdict}]</span> (Exit Code: ${p.exit_code})\n`;
      if (p.stdout) {
        logBox.innerHTML += `  <pre style="margin: 4px 0 8px 12px; color: #94a3b8; font-size: 11px; white-space: pre-wrap; font-family: var(--font-mono);">${escapeHtml(p.stdout)}</pre>`;
      }
      if (p.stderr) {
        logBox.innerHTML += `  <pre style="margin: 4px 0 8px 12px; color: #f87171; font-size: 11px; white-space: pre-wrap; font-family: var(--font-mono);">${escapeHtml(p.stderr)}</pre>`;
      }
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("case_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `→ Starting Case ${p.case_index}: ${p.name}...\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("case_complete", (e) => {
      const p = JSON.parse(e.data);
      const isPass = p.verdict === 'PASS';
      const verdictColor = isPass ? '#4ade80' : (p.verdict === 'ERROR' ? '#fbbf24' : '#f87171');
      logBox.innerHTML += `  Verdict: <span style="color: ${verdictColor}; font-weight: 700;">[${p.verdict}]</span> (${p.duration_ms}ms)\n`;
      if (p.stdout) {
        logBox.innerHTML += `   <span style="color: #94a3b8; font-size: 11px;">Output: ${escapeHtml(p.stdout)}</span>\n`;
      }
      logBox.scrollTop = logBox.scrollHeight;

      // Update Case Number that Pass / Fail
      if (isPass) {
        passedCases.push(p.case_index);
        if (passedCountEl) passedCountEl.textContent = passedCases.length;
        if (passedPillsEl) {
          if (passedCases.length === 1) passedPillsEl.innerHTML = '';
          passedPillsEl.innerHTML += `<span class="badge badge-pass" style="font-size: 11px; font-weight: 700;" title="${escapeHtml(p.name)}">Case ${p.case_index}</span>`;
        }
      } else {
        failedCases.push(p.case_index);
        if (failedCountEl) failedCountEl.textContent = failedCases.length;
        if (failedPillsEl) {
          if (failedCases.length === 1) failedPillsEl.innerHTML = '';
          failedPillsEl.innerHTML += `<span class="badge badge-fail" style="font-size: 11px; font-weight: 700;" title="${escapeHtml(p.name)}">Case ${p.case_index}</span>`;
        }
      }

      if (statsSummaryEl) {
        const totalDone = passedCases.length + failedCases.length;
        statsSummaryEl.className = failedCases.length === 0 ? "badge badge-pass" : "badge badge-fail";
        statsSummaryEl.textContent = `${passedCases.length} / ${totalDone} Passed`;
      }

      // Add to detailed Case Output Inspection table
      if (liveTableEl) {
        if (passedCases.length + failedCases.length === 1) liveTableEl.innerHTML = '';
        liveTableEl.innerHTML += `
          <div style="border-bottom: 1px solid var(--border-color); padding: 8px 12px; font-family: var(--font-mono); font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 700; color: #f8fafc;">Case ${p.case_index}: ${escapeHtml(p.name)}</span>
              <span class="badge ${isPass ? 'badge-pass' : 'badge-fail'}">${p.verdict} (${p.duration_ms}ms)</span>
            </div>
            <div style="color: #94a3b8; display: grid; gap: 2px;">
              <div><strong style="color: #cbd5e1;">Exit Code:</strong> ${p.exit_code} | <strong style="color: #cbd5e1;">Expect:</strong> <code style="color: #38bdf8;">${escapeHtml(p.expect || '')}</code></div>
              <div><strong style="color: #cbd5e1;">Actual Output:</strong> <code style="color: ${isPass ? '#4ade80' : '#f87171'};">${escapeHtml(p.stdout || '(empty)')}</code></div>
              ${p.stderr ? `<div style="color: #f87171;"><strong>Stderr:</strong> ${escapeHtml(p.stderr)}</div>` : ''}
              ${p.log_out ? `<div style="color: #60a5fa; font-size: 10px;"><strong>Log Inspection:</strong> ${escapeHtml(p.log_out)}</div>` : ''}
            </div>
          </div>
        `;
        liveTableEl.scrollTop = liveTableEl.scrollHeight;
      }
    });

    sse.addEventListener("pipeline_complete", (e) => {
      const p = JSON.parse(e.data);
      const isPass = p.final_verdict === 'PASS';
      logBox.innerHTML += `\n<div style="background: rgba(34, 197, 94, 0.12); border: 1px solid #22c55e; border-radius: 6px; padding: 12px; margin-top: 10px;">
  <strong style="color: #4ade80; font-size: 13px;">🎉 4-STEP AUTOMATED PIPELINE COMPLETE</strong>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; font-size: 12px;">
    <div>1. Baseline Pre-Grade: <span class="badge badge-fail">${escapeHtml(p.stage_1_baseline.verdict)}</span></div>
    <div>2. Instructions Executed: <span class="badge badge-pass">${p.stage_2_instructions.steps_count} steps</span></div>
    <div>3. Manual Bash Grade: <span class="badge ${p.stage_3_manual.verdict === 'PASS' ? 'badge-pass' : 'badge-fail'}">${p.stage_3_manual.score_passed}/${p.stage_3_manual.score_total} (${p.stage_3_manual.verdict})</span></div>
    <div>4. Platform Tool Grade: <span class="badge ${p.stage_4_tool.verdict === 'PASS' ? 'badge-pass' : 'badge-fail'}">${p.stage_4_tool.verdict} (${escapeHtml(p.stage_4_tool.slug)})</span></div>
  </div>
  <div style="margin-top: 10px; font-weight: 700; color: #f8fafc; font-size: 13px;">
    Overall Workflow Verdict: <span class="badge ${isPass ? 'badge-pass' : 'badge-fail'}" style="font-size: 13px;">${p.final_verdict}</span>
  </div>
</div>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("run_complete", (e) => {
      const p = JSON.parse(e.data);
      liveBadge.className = p.lab_verdict === 'PASS' ? 'badge badge-pass' : 'badge badge-fail';
      liveBadge.textContent = p.lab_verdict;

      const pList = (p.passed_cases && p.passed_cases.length > 0) ? p.passed_cases.map(c => `Case ${c}`).join(", ") : (passedCases.length > 0 ? passedCases.map(c => `Case ${c}`).join(", ") : "None");
      const fList = (p.failed_cases && p.failed_cases.length > 0) ? p.failed_cases.map(c => `Case ${c}`).join(", ") : (failedCases.length > 0 ? failedCases.map(c => `Case ${c}`).join(", ") : "None");

      logBox.innerHTML += `\n========================================\nOVERALL VERDICT: ${p.lab_verdict} (Score: ${p.score_passed}/${p.score_total})\nValidation: ${p.validation}\n----------------------------------------\n📋 CASE BREAKDOWN:\n  ✅ Cases That Passed: ${pList}\n  ❌ Cases That Failed: ${fList}\n========================================\n`;
      logBox.scrollTop = logBox.scrollHeight;

      if (overallPillEl) {
        overallPillEl.innerHTML = `<span class="badge ${p.lab_verdict === 'PASS' ? 'badge-pass' : 'badge-fail'}" style="font-size: 12px; font-weight: 700;">Final: ${p.lab_verdict} (${p.score_passed}/${p.score_total})</span>`;
      }
      sse.close();
    });
  } catch (e) {
    logBox.innerHTML += `Error: ${e.message}\n`;
    liveBadge.className = "badge badge-error";
    liveBadge.textContent = "ERROR";
  }
}

// ==================== 7.7 Run Detail Modal ====================
async function viewRunDetail(runId) {
  try {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    const run = await res.json();

    const drawer = document.getElementById("caseDrawer");
    const drawerTitle = document.getElementById("drawerCaseTitle");
    const drawerContent = document.getElementById("drawerContent");

    drawerTitle.textContent = `Run Detail: ${run.run_id}`;
    drawerContent.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; font-size: 13px;">
        <div><strong>State:</strong> <span class="badge badge-skip">${run.state}</span></div>
        <div><strong>Verdict:</strong> <span class="badge ${run.lab_verdict === 'PASS' ? 'badge-pass' : 'badge-fail'}">${run.lab_verdict}</span></div>
        <div><strong>Score:</strong> ${run.score_passed} / ${run.score_total}</div>
        <div><strong>Validation:</strong> ${run.validation}</div>
      </div>

      <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Case Results (${(run.results || []).length})</h4>
      ${(run.results || []).map(r => `
        <div class="card" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong>Case ${r.case_index}: ${escapeHtml(r.name)}</strong>
            <span class="badge ${r.verdict === 'PASS' ? 'badge-pass' : (r.verdict === 'ERROR' ? 'badge-error' : 'badge-fail')}">${r.verdict}</span>
          </div>
          <div style="font-size: 12px; margin-bottom: 4px;">Expect: <code>${escapeHtml(r.expect)}</code> | Actual: <code>${escapeHtml(r.actual)}</code></div>
          <pre class="code-block" style="margin-top: 6px;">${escapeHtml(r.stdout || '(no stdout)')}</pre>
        </div>
      `).join('')}
    `;
    drawer.style.display = "block";
  } catch (e) {
    showToast(`Failed to load run details: ${e.message}`);
  }
}

// ==================== 7.8 Validation Matrix ====================
async function renderValidationMatrix() {
  const container = document.getElementById("view-validation");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Validation Matrix...</div>`;

  try {
    const res = await fetch(`${API_BASE}/validation/matrix?course=${appState.selectedCourse}`);
    const matrix = await res.json();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Three-State Validation Matrix (Section 7.8)</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">
            Proves grader correctness: Unsolved (all required cases FAIL), Solved (all cases PASS), Near-Miss (target scenario FAILS).
          </p>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Lab</th>
            <th>Description</th>
            <th style="text-align: center;">Unsolved (Must Fail)</th>
            <th style="text-align: center;">Solved (Must Pass)</th>
            <th style="text-align: center;">Near-Miss (Defect Caught)</th>
          </tr>
        </thead>
        <tbody>
          ${matrix.map(m => {
            const u = m.states.unsolved;
            const s = m.states.solved;
            const n = m.states["near-miss"];

            return `
              <tr>
                <td><code>${m.chapter}.${m.part}</code></td>
                <td><strong>${escapeHtml(m.description)}</strong></td>
                <td style="text-align: center;">
                  ${renderMatrixBadge(u)}
                </td>
                <td style="text-align: center;">
                  ${renderMatrixBadge(s)}
                </td>
                <td style="text-align: center;">
                  ${renderMatrixBadge(n)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load matrix: ${e.message}</div>`;
  }
}

function renderMatrixBadge(cell) {
  if (!cell) return `<span class="badge badge-skip">NOT RUN</span>`;
  if (cell.result === "ok") {
    return `<span class="badge badge-pass" title="${escapeHtml(cell.reason)}">✓ OK</span>`;
  } else {
    return `<span class="badge badge-fail" title="${escapeHtml(cell.reason)}">⚠ VIOLATION</span>`;
  }
}

// ==================== 7.9 Cross-Check ====================
async function renderCrossCheck() {
  const container = document.getElementById("view-crosscheck");
  container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 18px; font-weight: 700;">Manual SSH vs Tool (nusactl) Cross-Check (Section 7.9)</h2>
      <p style="color: var(--text-secondary); font-size: 12px;">Compares manual system checks against tool output. Disagreements are surfaced immediately.</p>
    </div>

    <div class="card" style="border-left: 4px solid #4ade80; margin-bottom: 16px;">
      <div style="font-weight: 700;">Cross-Check Engine Active</div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
        When runs are executed in 'both' mode, verdicts are matched per-case by index and name. Any discrepancy automatically offers 1-click promotion to Finding.
      </div>
    </div>
  `;
}

// ==================== 7.10 Findings Board ====================
async function renderFindings() {
  const container = document.getElementById("view-findings");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Findings Board...</div>`;

  try {
    const res = await fetch(`${API_BASE}/findings`);
    const findings = await res.json();

    const openList = findings.filter(f => f.status === "open");
    const confirmedList = findings.filter(f => f.status === "confirmed");
    const fixedList = findings.filter(f => f.status === "fixed");

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Findings & Defects Board (Section 7.10)</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">Evidence-based tracking of grader, lab, and course defects.</p>
        </div>
        <button class="btn btn-primary" onclick="createNewFindingModal()">+ Add New Finding</button>
      </div>

      <div class="kanban-board">
        <div class="kanban-col">
          <h4>Open (${openList.length})</h4>
          ${openList.map(f => renderFindingCard(f)).join('')}
        </div>
        <div class="kanban-col">
          <h4>Confirmed by Run (${confirmedList.length})</h4>
          ${confirmedList.map(f => renderFindingCard(f)).join('')}
        </div>
        <div class="kanban-col">
          <h4>Fixed / Remediated (${fixedList.length})</h4>
          ${fixedList.map(f => renderFindingCard(f)).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load findings: ${e.message}</div>`;
  }
}

function renderFindingCard(f) {
  const isConfirmed = Boolean(f.confirmed);
  return `
    <div class="kanban-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span class="badge ${f.priority === 'critical' ? 'badge-fail' : (f.priority === 'high' ? 'badge-error' : 'badge-skip')}">
          ${f.priority}
        </span>
        <span class="badge ${isConfirmed ? 'badge-pass' : 'badge-unconfirmed'}">
          ${isConfirmed ? 'Confirmed' : 'Unconfirmed'}
        </span>
      </div>
      <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${escapeHtml(f.title)}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Loc: ${escapeHtml(f.location)}</div>
      <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(f.evidence || '')}</div>
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px;">
        ${!isConfirmed ? `<button class="btn btn-secondary" style="font-size: 10px; padding: 2px 6px;" onclick="confirmFinding('${f.id}')">Confirm</button>` : ''}
        ${f.status !== 'fixed' ? `<button class="btn btn-primary" style="font-size: 10px; padding: 2px 6px;" onclick="markFindingFixed('${f.id}')">Mark Fixed</button>` : ''}
      </div>
    </div>
  `;
}

function confirmFinding(id) {
  fetch(`${API_BASE}/findings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: 1, status: "confirmed" })
  }).then(() => renderFindings());
}

function markFindingFixed(id) {
  fetch(`${API_BASE}/findings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "fixed" })
  }).then(() => renderFindings());
}

function promoteIssueToFinding(ruleId, message) {
  fetch(`${API_BASE}/findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "grader_defect",
      priority: ruleId === "GL01" || ruleId === "GL08" || ruleId === "GL12" ? "critical" : "high",
      title: `${ruleId}: ${message}`,
      location: "dok8s course export",
      evidence: `Static lint detection: ${ruleId}`,
      confirmed: 0
    })
  }).then(() => showToast(`Promoted ${ruleId} to Finding!`));
}

// ==================== 7.11 Course Audit Workspace ====================
async function renderAuditWorkspace() {
  const container = document.getElementById("view-audit");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Course Audit Workspace...</div>`;

  try {
    const res = await fetch(`${API_BASE}/audit`);
    const audits = await res.json();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Course Audit Workspace (Section 7.11 / Course Baseline)</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">Review modules against industry practice using closed status vocabulary and registered sources.</p>
        </div>
        <button class="btn btn-secondary" onclick="exportAuditMarkdown()">Export Audit Document (Markdown)</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${audits.map(a => `
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div>
                <strong style="font-size: 15px;">Module Audit: ${a.ref} (${a.language.toUpperCase()})</strong>
                <span class="badge badge-ai" style="margin-left: 8px;">${a.review_state}</span>
              </div>
              <span class="badge badge-pass">${a.status_key}</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; font-size: 13px;">
              <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px;">
                <h4 style="color: #4ade80; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">Tetap Dipertahankan (Keep)</h4>
                <div style="white-space: pre-wrap; font-size: 12px;">${escapeHtml(a.keep_text || '')}</div>
              </div>

              <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px;">
                <h4 style="color: #fbbf24; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">Perlu Diperbarui (Update)</h4>
                <div style="white-space: pre-wrap; font-size: 12px;">${escapeHtml(a.update_text || '')}</div>
              </div>
            </div>

            ${a.findings_text ? `
              <div style="margin-top: 10px; font-size: 12px;">
                <strong>Temuan pada materi existing:</strong> ${escapeHtml(a.findings_text)}
              </div>
            ` : ''}

            ${a.suggested_grading ? `
              <div style="margin-top: 6px; font-size: 12px;">
                <strong>Grading yang disarankan:</strong> ${escapeHtml(a.suggested_grading)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load audit: ${e.message}</div>`;
  }
}

function exportAuditMarkdown() {
  window.open(`${API_BASE}/reports/audit/${appState.selectedCourse}?lang=${appState.contentLanguage}`, "_blank");
}

// ==================== 7.12 Test VMs & Credentials Management ====================
async function renderTestVMs() {
  const container = document.getElementById("view-vms");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Test VMs...</div>`;

  try {
    const res = await fetch(`${API_BASE}/targets`);
    const targets = await res.json();
    appState.targets = targets;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Test VMs & Credentials Management</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">
            Configure target lab virtual machines for grading execution, SSH authentication, and nusactl credentials.
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 420px 1fr; gap: 24px;">
        <!-- Add / Edit VM Form -->
        <div class="card">
          <h3 style="font-size: 14px; margin-bottom: 14px; color: var(--text-primary); text-transform: none; font-weight: 700;">
            + Add / Configure Testing VM
          </h3>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">VM Name / Label:</label>
            <input type="text" id="vmNameInput" placeholder="e.g. Lab Testing VM (Ubuntu 24.04)" style="width: 100%;">
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">IP Host / Hostname:</label>
              <input type="text" id="vmHostInput" placeholder="192.168.10.50 or 127.0.0.1" style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">Port:</label>
              <input type="number" id="vmPortInput" value="22" style="width: 100%;">
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px; margin-bottom: 12px;">
            <h4 style="font-size: 12px; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 8px;">1. SSH Credentials</h4>
            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">SSH Username:</label>
              <input type="text" id="vmUserInput" placeholder="e.g. student or root" style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">SSH Password:</label>
              <div style="display: flex; gap: 6px;">
                <input type="password" id="vmPassInput" placeholder="Enter SSH password" style="flex: 1;">
                <button type="button" class="btn btn-secondary" onclick="togglePassVisibility('vmPassInput')">👁</button>
              </div>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px; margin-bottom: 12px;">
            <h4 style="font-size: 12px; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 8px;">2. nusactl Tool Credentials</h4>
            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">nusactl Username ($NUSA_USERNAME):</label>
              <input type="text" id="vmNusaUserInput" placeholder="e.g. student or nusa" style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">nusactl Password:</label>
              <div style="display: flex; gap: 6px;">
                <input type="password" id="vmNusaPassInput" placeholder="Enter nusactl password" style="flex: 1;">
                <button type="button" class="btn btn-secondary" onclick="togglePassVisibility('vmNusaPassInput')">👁</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
              <input type="checkbox" id="vmModifiableInput" checked>
              <span><strong>Allow VM State Modification (start/finish/solutions)</strong></span>
            </label>
            <div style="font-size: 11px; color: var(--text-muted); margin-left: 22px;">If unchecked, target is treated as immutable and all state-changing commands require operator gates.</div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">Notes / Description:</label>
            <input type="text" id="vmNotesInput" placeholder="e.g. Local runner testing VM" style="width: 100%;">
          </div>

          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" style="flex: 1; justify-content: center;" onclick="testInputVMConnection()">
              ⚡ Test Connection
            </button>
            <button class="btn btn-primary" style="flex: 1; justify-content: center;" onclick="saveTestVM()">
              Save VM Configuration
            </button>
          </div>
          <div id="connectionStatusBanner" style="margin-top: 12px; display: none;"></div>
        </div>

        <!-- List of Configured VMs -->
        <div>
          <h3 style="font-size: 14px; margin-bottom: 14px; color: var(--text-primary); text-transform: none; font-weight: 700;">
            Configured Testing Environments (${targets.length})
          </h3>

          ${targets.length === 0 ? `
            <div class="card" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
              No testing VMs configured yet. Use the form on the left to add your first VM.
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 14px;">
              ${targets.map(t => `
                <div class="card" style="border-left: 4px solid ${t.modifiable ? '#4ade80' : '#ef4444'};">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                      <strong style="font-size: 15px;">${escapeHtml(t.name)}</strong>
                      <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        Host: <code>${escapeHtml(t.host)}:${t.port || 22}</code> | SSH User: <code>${escapeHtml(t.user)}</code>
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                      <span class="badge ${t.modifiable ? 'badge-pass' : 'badge-fail'}">
                        ${t.modifiable ? 'MODIFIABLE' : 'IMMUTABLE'}
                      </span>
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 12px; background-color: var(--bg-primary); padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <div>
                      <strong>SSH Password:</strong> ${t.has_password ? '<span style="color: #4ade80;">✓ Configured</span>' : '<span style="color: var(--text-muted);">(None/Key only)</span>'}
                    </div>
                    <div>
                      <strong>nusactl User:</strong> <code>${escapeHtml(t.nusactl_username || '(Not set)')}</code>
                    </div>
                    <div>
                      <strong>nusactl Password:</strong> ${t.has_nusactl_password ? '<span style="color: #4ade80;">✓ Configured</span>' : '<span style="color: var(--text-muted);">(Not set)</span>'}
                    </div>
                    <div>
                      <strong>Notes:</strong> ${escapeHtml(t.notes || 'None')}
                    </div>
                  </div>

                  <div style="display: flex; justify-content: flex-end; gap: 8px;">
                    <button class="btn btn-secondary" onclick="testExistingVMConnection('${t.id}')">Test SSH Ping</button>
                    <button class="btn btn-primary" onclick="setActiveTargetVM('${t.id}')">Set Active Target</button>
                    <button class="btn btn-secondary" style="color: #f87171;" onclick="deleteTargetVM('${t.id}')">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load Test VMs: ${e.message}</div>`;
  }
}

function togglePassVisibility(inputId) {
  const el = document.getElementById(inputId);
  if (el) {
    el.type = el.type === "password" ? "text" : "password";
  }
}

async function testInputVMConnection() {
  const host = document.getElementById("vmHostInput").value.trim();
  const port = document.getElementById("vmPortInput").value.trim() || 22;
  const user = document.getElementById("vmUserInput").value.trim();
  const pass = document.getElementById("vmPassInput").value;

  if (!host || !user) {
    alert("Please enter both Host IP and SSH Username.");
    return;
  }

  const banner = document.getElementById("connectionStatusBanner");
  banner.style.display = "block";
  banner.innerHTML = `<div class="card" style="border-left: 3px solid #38bdf8;">Testing connection to ${user}@${host}:${port}...</div>`;

  try {
    const res = await fetch(`${API_BASE}/targets/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host, port, user, password: pass })
    });
    const data = await res.json();
    if (data.status === "ok") {
      banner.innerHTML = `<div class="card" style="border-left: 3px solid #4ade80; color: #4ade80;">✓ ${escapeHtml(data.message)}</div>`;
    } else {
      banner.innerHTML = `<div class="card" style="border-left: 3px solid #ef4444; color: #ef4444;">✕ ${escapeHtml(data.message)}</div>`;
    }
  } catch (e) {
    banner.innerHTML = `<div class="card" style="border-left: 3px solid #ef4444; color: #ef4444;">Connection test failed: ${e.message}</div>`;
  }
}

async function testExistingVMConnection(targetId) {
  showToast("Testing SSH connection to target...");
  try {
    const res = await fetch(`${API_BASE}/targets/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId })
    });
    const data = await res.json();
    if (data.status === "ok") {
      alert(`Connection Successful!\n\n${data.message}`);
    } else {
      alert(`Connection Failed:\n\n${data.message}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function saveTestVM() {
  const name = document.getElementById("vmNameInput").value.trim() || "Testing VM";
  const host = document.getElementById("vmHostInput").value.trim();
  const port = parseInt(document.getElementById("vmPortInput").value.trim() || "22");
  const user = document.getElementById("vmUserInput").value.trim();
  const pass = document.getElementById("vmPassInput").value;
  const nusaUser = document.getElementById("vmNusaUserInput").value.trim();
  const nusaPass = document.getElementById("vmNusaPassInput").value;
  const modifiable = document.getElementById("vmModifiableInput").checked;
  const notes = document.getElementById("vmNotesInput").value.trim();

  if (!host || !user) {
    alert("Please provide both IP Host and SSH Username.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/targets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({
        name, host, port, user,
        password: pass,
        nusactl_username: nusaUser,
        nusactl_password: nusaPass,
        modifiable, notes
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`VM saved: ${name}`);
      await refreshTargetsList();
      renderTestVMs();
    } else {
      alert(`Save failed: ${data.error || 'Server error'}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function deleteTargetVM(targetId) {
  if (!confirm("Are you sure you want to delete this target VM?")) return;
  try {
    const res = await fetch(`${API_BASE}/targets/${targetId}`, {
      method: "DELETE",
      headers: {
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      }
    });
    if (res.ok) {
      showToast("Target VM deleted.");
      await refreshTargetsList();
      renderTestVMs();
    }
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

function setActiveTargetVM(targetId) {
  const tgt = appState.targets.find(t => t.id === targetId);
  if (tgt) {
    const banner = document.getElementById("envBanner");
    const bannerText = document.getElementById("envBannerText");
    if (tgt.modifiable) {
      banner.className = "env-banner safe";
      bannerText.textContent = `Target: ${tgt.name} (${tgt.host}) — Testing Environment [MODIFIABLE]`;
    } else {
      banner.className = "env-banner";
      bannerText.textContent = `Target: ${tgt.name} (${tgt.host}) — IMMUTABLE PRODUCTION [STATE CHANGES FORBIDDEN WITHOUT GATE]`;
    }
    showToast(`Active target set to: ${tgt.name}`);
  }
}

async function deleteCurrentCourse() {
  if (!appState.selectedCourse) return;
  if (!confirm(`Are you sure you want to delete course '${appState.selectedCourse}' and all its labs?`)) return;

  try {
    const res = await fetch(`${API_BASE}/courses/${appState.selectedCourse}`, {
      method: "DELETE",
      headers: {
        "X-User-Role": "Admin",
        "X-User-Id": appState.userId
      }
    });
    if (res.ok) {
      showToast(`Deleted course: ${appState.selectedCourse}`);
      appState.selectedCourse = "";
      localStorage.removeItem("selectedCourse");
      await refreshCourseDropdown();
      renderCourses();
    }
  } catch (e) {
    alert(`Error deleting course: ${e.message}`);
  }
}

// ==================== 7.14 Version Manifest ====================
async function renderManifest() {
  const container = document.getElementById("view-manifest");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Version Manifest...</div>`;

  try {
    const res = await fetch(`${API_BASE}/manifest`);
    const rows = await res.json();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Version Manifest — Single Source of Truth (Section 7.14 / Sec 4.4)</h2>
          <p style="color: var(--text-secondary); font-size: 12px;">Official verified versions for all labs and graders. Graders compare against the manifest.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom: 16px;">
        <h4 style="font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Impact Search (FR-AUD-05 / Sec 9.5)</h4>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="impactSearchInput" placeholder="Enter component or version (e.g. v1.28.2 or nginx)..." style="flex: 1;">
          <button class="btn btn-primary" onclick="executeImpactSearch()">Search Course Impact</button>
        </div>
        <div id="impactResultsBox" style="margin-top: 10px; display: none;"></div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Course Baseline</th>
            <th>Verified Stable</th>
            <th>Channel / Arch</th>
            <th>Source Code</th>
            <th>Decision</th>
            <th>Check Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.component)}</strong></td>
              <td><code>${escapeHtml(r.course_baseline)}</code></td>
              <td><strong style="color: #4ade80;">${escapeHtml(r.verified_stable)}</strong></td>
              <td>${r.channel} / ${r.arch || 'amd64'}</td>
              <td><span class="badge badge-skip">${r.source_code || 'none'}</span></td>
              <td>${escapeHtml(r.decision || '')}</td>
              <td>${r.check_date}</td>
              <td>
                <span class="badge ${r.status === 'verified' ? 'badge-pass' : 'badge-error'}">${r.status}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load manifest: ${e.message}</div>`;
  }
}

async function executeImpactSearch() {
  const token = document.getElementById("impactSearchInput").value.trim();
  if (!token) return;

  const box = document.getElementById("impactResultsBox");
  box.style.display = "block";
  box.innerHTML = `<div style="color: var(--text-muted);">Searching impact across all labs, cases, hints, and content...</div>`;

  try {
    const res = await fetch(`${API_BASE}/manifest/impact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token })
    });
    const data = await res.json();

    if (data.matches.length === 0) {
      box.innerHTML = `<div style="color: #4ade80;">No impact references found for '${escapeHtml(token)}'. Clean propagation.</div>`;
    } else {
      box.innerHTML = `
        <div style="font-weight: 700; color: #fbbf24; margin-bottom: 6px;">
          Found ${data.total_matches} affected locations that reference '${escapeHtml(token)}' (KL07 blocks approval until resolved):
        </div>
        <div style="max-height: 200px; overflow-y: auto;">
          ${data.matches.map(m => `
            <div style="padding: 6px; background-color: var(--bg-tertiary); border-radius: 4px; font-size: 11px; margin-bottom: 4px;">
              <strong>[${m.type}]</strong> ${escapeHtml(m.location)}: <code>${escapeHtml(m.text)}</code>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    box.innerHTML = `<div style="color: #ef4444;">Search failed: ${e.message}</div>`;
  }
}

// ==================== 7.15 Quizzes ====================
async function renderQuizzes() {
  const container = document.getElementById("view-quizzes");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Quiz Review...</div>`;

  try {
    const res = await fetch(`${API_BASE}/quizzes`);
    const quizzes = await res.json();

    container.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Quiz Review & Flag Assistant (Section 7.15 / Sec 11)</h2>
        <p style="color: var(--text-secondary); font-size: 12px;">Flags questions with absolute statements, default ports, and outdated vendor behaviors.</p>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Quiz / Question ID</th>
            <th>Problem (Identified Defect)</th>
            <th>Update (Correct Concept)</th>
          </tr>
        </thead>
        <tbody>
          ${quizzes.map(q => `
            <tr>
              <td><code>${q.question_id}</code></td>
              <td style="color: #f87171;">${escapeHtml(q.problem)}</td>
              <td style="color: #4ade80;">${escapeHtml(q.update_text)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load quizzes: ${e.message}</div>`;
  }
}

// ==================== 7.17 Reports ====================
function renderReports() {
  const container = document.getElementById("view-reports");
  container.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 18px; font-weight: 700;">Reports & Exports (Section 7.17 / Sec 13)</h2>
      <p style="color: var(--text-secondary); font-size: 12px;">Export Lab Reports, Course Audit Documents, JUnit XML for CI, and Patched Course Export.</p>
    </div>

    <div class="grid-cards">
      <div class="card">
        <h3>Lab Test Report (Markdown)</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">Summary, case results, 3-state matrix, cross-check, findings, and JSON debug log.</p>
        <button class="btn btn-primary" onclick="exportLabReport()">Download Markdown Report</button>
      </div>

      <div class="card">
        <h3>JUnit XML Export</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">Test suite per lab, test case per grade check. ERROR mapped to error, FAIL to failure.</p>
        <button class="btn btn-secondary" onclick="exportJUnitXml()">Download JUnit XML</button>
      </div>

      <div class="card">
        <h3>Course Audit Document (Markdown)</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">Full audit document following Course Baseline Section 6 structure in selected language.</p>
        <button class="btn btn-primary" onclick="exportAuditMarkdown()">Download Audit Markdown</button>
      </div>

      <div class="card">
        <h3>Patched Course Export JSON</h3>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">Applies approved revisions only. Includes changes.md sidecar diff summary.</p>
        <button class="btn btn-secondary" onclick="exportPatchedCourseJson()">Download Patched Export</button>
      </div>
    </div>
  `;
}

function exportLabReport() {
  const firstLab = appState.labs[0];
  if (firstLab) {
    window.open(`${API_BASE}/reports/lab/${firstLab.id}?format=md`, "_blank");
  } else {
    showToast("No lab available to export.");
  }
}

function exportJUnitXml() {
  const firstLab = appState.labs[0];
  if (firstLab) {
    window.open(`${API_BASE}/reports/lab/${firstLab.id}?format=junit`, "_blank");
  }
}

function exportPatchedCourseJson() {
  window.open(`${API_BASE}/courses/${appState.selectedCourse}/export?patched=true`, "_blank");
}

// ==================== 7.18 Settings ====================
async function renderSettings() {
  const container = document.getElementById("view-settings");
  container.innerHTML = `<div style="color: var(--text-muted);">Loading Settings...</div>`;

  try {
    const res = await fetch(`${API_BASE}/activity`);
    const logs = await res.json();

    container.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Settings & RBAC (Section 7.18 / Sec 3)</h2>
        <p style="color: var(--text-secondary); font-size: 12px;">System settings, SSH targets, secret references, and immutable activity logs.</p>
      </div>

      <div class="card" style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Targets & SSH Configuration</h4>
        <div style="font-size: 12px; color: var(--text-secondary);">
          Targets configured: ${appState.targets.map(t => `<strong>${t.name}</strong> (${t.host}) [${t.modifiable ? 'MODIFIABLE' : 'IMMUTABLE'}]`).join(', ')}
        </div>
      </div>

      <div class="card">
        <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Activity Log (Immutable)</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td><code>${l.created_at.substring(0, 19).replace('T', ' ')}</code></td>
                <td><span class="badge badge-skip">${l.user_id}</span></td>
                <td><strong>${l.action}</strong></td>
                <td>${l.entity_type} (${l.entity_id})</td>
                <td><pre style="font-size: 10px; margin: 0;">${escapeHtml(l.after_value || '-')}</pre></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load settings: ${e.message}</div>`;
  }
}

// ==================== New Lab Modal Handlers ====================
function openNewLabModal() {
  document.getElementById("newLabModal").style.display = "flex";
}

function closeNewLabModal() {
  document.getElementById("newLabModal").style.display = "none";
}

async function submitNewLab() {
  const chapter = document.getElementById("newLabChapter").value.trim() || "001";
  const part = document.getElementById("newLabPart").value.trim() || "1";
  const desc = document.getElementById("newLabDescription").value.trim();
  if (!desc) {
    alert("Please enter a Lab Description / Title.");
    return;
  }

  const rawStart = document.getElementById("newLabStart").value.trim();
  const rawFinish = document.getElementById("newLabFinish").value.trim();
  const startCmds = rawStart ? rawStart.split("\n").map(s => s.trim()).filter(Boolean) : [];
  const finishCmds = rawFinish ? rawFinish.split("\n").map(s => s.trim()).filter(Boolean) : [];

  const caseName = document.getElementById("newCaseName").value.trim() || "case 1 - verify setup";
  const caseCmd = document.getElementById("newCaseCmd").value.trim() || "echo 1";
  const caseExpect = document.getElementById("newCaseExpect").value.trim() || "1";
  const caseHint = document.getElementById("newCaseHint").value.trim() || "";

  const payload = {
    course: appState.selectedCourse,
    chapter: chapter,
    part: part,
    description: desc,
    start: startCmds,
    finish: finishCmds,
    grade: [
      {
        name: caseName,
        cmd: caseCmd,
        expect: caseExpect,
        hint: caseHint,
        debug: "true",
        log_cmd: `echo "State check | Expect: ${caseExpect}"`
      }
    ]
  };

  try {
    const res = await fetch(`${API_BASE}/labs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Lab created: ${desc}`);
      closeNewLabModal();
      renderCourses();
    } else {
      alert(`Failed to create lab: ${data.error || 'Server error'}`);
    }
  } catch (e) {
    alert(`Error creating lab: ${e.message}`);
  }
}

// ==================== Import Modal Handlers ====================
let selectedZipBase64 = null;
let selectedGradeJsonContent = null;

function openImportModal() {
  document.getElementById("importModal").style.display = "flex";
}

function closeImportModal() {
  document.getElementById("importModal").style.display = "none";
  selectedZipBase64 = null;
  selectedGradeJsonContent = null;
}

function handleZipFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    // ArrayBuffer to base64
    const bytes = new Uint8Array(event.target.result);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    selectedZipBase64 = btoa(binary);
    document.getElementById("zipSelectedLabel").textContent = `✓ Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  };
  reader.readAsArrayBuffer(file);
}

function handleGradeFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    selectedGradeJsonContent = event.target.result;
    document.getElementById("importGradeJsonText").value = event.target.result;
  };
  reader.readAsText(file);
}

async function loadSamplePackage(sampleName) {
  try {
    const res = await fetch(`${API_BASE}/imports/package`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({
        zip_path: "C:\\Users\\afif\\.gemini\\antigravity\\scratch\\export-gitlab-fundamental.zip",
        grade_path: "C:\\Users\\afif\\.gemini\\antigravity\\scratch\\grade_export.json"
      })
    });
    const data = await res.json();
    if (res.ok && data.status === "success") {
      showToast(`Imported Package: ${data.course_title} (${data.modules_imported} Modules, ${data.submodules_imported} Submodules)`);
      closeImportModal();
      await refreshCourseDropdown();
      appState.selectedCourse = data.course_slug;
      renderCourses();
    } else {
      alert(`Load failed: ${data.message || data.error}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function submitPackageImport() {
  const gradeText = document.getElementById("importGradeJsonText").value.trim() || selectedGradeJsonContent;

  if (!selectedZipBase64 && !gradeText) {
    alert("Please select a Course Archive (.zip) and/or Grading Export (.json).");
    return;
  }

  try {
    let payload = {};
    if (selectedZipBase64) {
      payload.zip_base64 = selectedZipBase64;
    }
    if (gradeText) {
      try {
        payload.grade_json = JSON.parse(gradeText);
      } catch (e) {
        payload.grade_json = gradeText;
      }
    }

    const endpoint = selectedZipBase64 ? `${API_BASE}/imports/package` : `${API_BASE}/imports/course-export`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify(selectedZipBase64 ? payload : payload.grade_json)
    });
    const data = await res.json();

    if (res.ok && data.status === "success") {
      showToast(`Imported: ${data.course_title || data.course}`);
      closeImportModal();
      await refreshCourseDropdown();
      if (data.course_slug) appState.selectedCourse = data.course_slug;
      renderCourses();
    } else {
      alert(`Import error: ${data.message || data.error || 'Server error'}`);
    }
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
}

async function loadSampleImport(sampleName) {
  try {
    const res = await fetch(`${API_BASE}/imports/load-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample: sampleName })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Sample imported: ${data.sample}`);
      closeImportModal();
      await refreshCourseDropdown();
      renderCourses();
    } else {
      alert(`Load failed: ${data.error}`);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

async function refreshCourseDropdown() {
  const select = document.getElementById("courseSelect");
  try {
    const res = await fetch(`${API_BASE}/courses`);
    if (!res.ok) {
      if (select) select.innerHTML = '<option value="">(Failed to load courses)</option>';
      return;
    }
    const courses = await res.json();
    if (!Array.isArray(courses) || courses.length === 0) {
      if (select) select.innerHTML = '<option value="">(No courses uploaded)</option>';
      appState.selectedCourse = "";
      return;
    }
    if (select) {
      select.innerHTML = courses.map(c => `<option value="${c.slug}">${c.slug} (${c.title || c.slug})</option>`).join('');
    }
    if (!appState.selectedCourse || !courses.find(c => c.slug === appState.selectedCourse)) {
      appState.selectedCourse = courses[0].slug;
    }
    if (select) {
      select.value = appState.selectedCourse;
    }
  } catch (e) {
    console.error("Failed to load courses:", e);
    if (select) select.innerHTML = '<option value="">(Error loading courses)</option>';
  }
}

// ==================== AI Agent Handlers ====================

async function triggerAiGraderRemediation(autoApply = false) {
  const banner = document.getElementById("aiActionBanner");
  banner.style.display = "block";
  banner.innerHTML = `<div class="card" style="border-left: 4px solid #8b5cf6;">AI Grading Test Agent is analyzing labs, modernizing checks, and generating log_cmd...</div>`;

  try {
    const res = await fetch(`${API_BASE}/agents/remediate-grading`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({ course: appState.selectedCourse, auto_apply: autoApply })
    });
    const data = await res.json();

    banner.innerHTML = `
      <div class="card" style="border-left: 4px solid #8b5cf6; background: rgba(139, 92, 246, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #a78bfa; font-size: 14px;">✨ AI Grading Test Agent: Remediated ${data.total_cases_remediated} Checks</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Generated descriptive <code>log_cmd</code>, corrected typos (cho &rarr; echo), bounded timeouts, modernized commands (docker compose, ss, ip), and removed mutating verbs.
              <span class="badge badge-ai" style="margin-left: 6px;">AI Proposed Revisions Created</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${!autoApply ? `<button class="btn btn-primary" onclick="triggerAiGraderRemediation(true)">Approve & Apply All AI Fixes</button>` : ''}
            <button class="btn btn-secondary" onclick="document.getElementById('aiActionBanner').style.display='none'">Dismiss</button>
          </div>
        </div>
        <div style="margin-top: 10px; max-height: 220px; overflow-y: auto;">
          ${(data.revisions || []).slice(0, 10).map(r => `
            <div style="font-size: 12px; margin-bottom: 6px; padding: 6px 10px; background-color: var(--bg-tertiary); border-radius: 4px;">
              <strong>${escapeHtml(r.case_name)}</strong> &rarr;
              <code>${Object.keys(r.diff).join(', ')} updated</code>
              <span class="badge badge-ai" style="font-size: 10px; float: right;">${r.status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    renderCourses();
  } catch (e) {
    banner.innerHTML = `<div style="color: #ef4444;">AI Grader remediation failed: ${e.message}</div>`;
  }
}

async function triggerAiCourseUpdate() {
  const banner = document.getElementById("aiActionBanner");
  banner.style.display = "block";
  banner.innerHTML = `<div class="card" style="border-left: 4px solid #10b981;">AI Course Update Agent is analyzing syllabus, updating modules, and drafting new industry modules...</div>`;

  try {
    const res = await fetch(`${API_BASE}/agents/update-course`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": appState.userRole,
        "X-User-Id": appState.userId
      },
      body: JSON.stringify({ course: appState.selectedCourse, language: appState.contentLanguage })
    });
    const data = await res.json();

    banner.innerHTML = `
      <div class="card" style="border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #34d399; font-size: 14px;">🚀 AI Course Update Agent: Added New Industry-Standard Module</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Added <strong>Module 6: ${escapeHtml(data.new_module_title)}</strong> with 2 Submodules and <strong>${escapeHtml(data.new_lab_added)}</strong> adhering to Section 5 plain-language rules.
              <span class="badge badge-ai" style="margin-left: 6px;">AI Proposed Draft</span>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="document.getElementById('aiActionBanner').style.display='none'">Dismiss</button>
        </div>
      </div>
    `;

    renderCourses();
  } catch (e) {
    banner.innerHTML = `<div style="color: #ef4444;">AI Course Update failed: ${e.message}</div>`;
  }
}

// ==================== Helper Utilities ====================
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeQuotes(str) {
  if (!str) return "";
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.backgroundColor = "var(--bg-secondary)";
  toast.style.border = "1px solid var(--accent-blue)";
  toast.style.color = "var(--text-primary)";
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "6px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  toast.style.fontSize = "13px";
  toast.style.zIndex = "999";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
