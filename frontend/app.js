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
  restoreSavedTheme();
  const initialView = resolveCurrentPageView();
  appState.activeView = initialView;
  activateDomViewPanel(initialView);
  setupNavigation();
  setupGlobalControls();
  setupMetronicControlEnhancer();
  fetchInitialData();
});

function restoreSavedTheme() {
  const saved = localStorage.getItem("theme");
  const html = document.documentElement;
  if (saved === "light") {
    html.classList.remove("dark");
    html.setAttribute("data-theme", "light");
    html.setAttribute("data-theme-mode", "light");
  } else if (saved === "dark") {
    html.classList.add("dark");
    html.setAttribute("data-theme", "dark");
    html.setAttribute("data-theme-mode", "dark");
  }
}

function resolveCurrentPageView() {
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get("view");
  if (queryView) return queryView;

  const bodyView = document.body && document.body.getAttribute("data-page-view");
  if (bodyView) return bodyView;

  const path = (window.location.pathname || "").toLowerCase();
  if (path.endsWith("/courses") || path.endsWith("/courses.html")) return "courses";
  if (path.endsWith("/vms") || path.endsWith("/vms.html")) return "vms";
  if (path.endsWith("/reports") || path.endsWith("/reports.html")) return "reports";
  if (path.endsWith("/runs") || path.endsWith("/runs.html")) return "runs";
  return "runs";
}

function activateDomViewPanel(viewName) {
  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.style.display = "none";
  });
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.style.display = "block";
  }
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(t => {
    if (t.getAttribute("data-view") === viewName) {
      t.classList.add("active");
    } else {
      t.classList.remove("active");
    }
  });
  const breadcrumbEl = document.getElementById("activeViewBreadcrumb");
  if (breadcrumbEl) {
    const titles = {
      runs: "Run Console",
      courses: "Courses Explorer",
      vms: "Test VMs & Credentials",
      reports: "Reports & Exports",
      overview: "Overview",
      validation: "Validation Matrix",
      crosscheck: "Cross-Check",
      findings: "Findings Board",
      audit: "Course Audit",
      manifest: "Version Manifest",
      quizzes: "Quiz Review",
      settings: "Settings & Activity Log"
    };
    breadcrumbEl.textContent = titles[viewName] || viewName;
  }
}

// ==================== Metronic Component Helpers ====================

/** Show a Metronic modal (KTModal) by element id, with a class-based fallback. */
function ktShowModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const inst = window.KTModal && (KTModal.getInstance(el) || KTModal.getOrCreateInstance(el));
  if (inst && typeof inst.show === "function") {
    inst.show();
  } else {
    el.style.display = "block";
    el.classList.add("open");
  }
}

/** Hide a Metronic modal (KTModal) by element id, with a class-based fallback. */
function ktHideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const inst = window.KTModal && KTModal.getInstance(el);
  if (inst && typeof inst.hide === "function") {
    inst.hide();
  } else {
    el.classList.remove("open");
    el.style.display = "none";
  }
}

/**
 * BRIDGE: views not yet migrated to native Metronic markup render raw
 * <input>/<select>/<textarea>. Give them the Metronic control classes
 * (.input / .select / .textarea / .checkbox) as they are inserted.
 */
function applyMetronicControlClasses(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll("input, select, textarea").forEach(el => {
    if (el.dataset.ktEnhanced) return;
    el.dataset.ktEnhanced = "1";
    if (el.closest("#sidebar")) return;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (tag === "select") {
      if (!el.classList.contains("select")) el.classList.add("select", "select-sm");
    } else if (tag === "textarea") {
      if (!el.classList.contains("textarea")) el.classList.add("textarea");
    } else if (type === "checkbox") {
      if (!el.classList.contains("checkbox")) el.classList.add("checkbox", "checkbox-sm");
    } else if (["text", "search", "password", "email", "number", "file"].includes(type)) {
      if (!el.classList.contains("input")) el.classList.add("input");
    }
  });
}

function setupMetronicControlEnhancer() {
  const content = document.getElementById("content");
  if (!content) return;
  applyMetronicControlClasses(content);
  new MutationObserver(() => applyMetronicControlClasses(content))
    .observe(content, { childList: true, subtree: true });
}

function closeMobileSidebar() {
  const sb = document.getElementById("sidebar");
  if (sb) sb.classList.remove("mobile-open");
}
window.closeMobileSidebar = closeMobileSidebar;

const CORE_PAGE_MAP = {
  runs: "runs.html",
  courses: "courses.html",
  vms: "vms.html",
  reports: "reports.html"
};

function setupNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", (e) => {
      const link = tab.querySelector("a[href]");
      const viewName = tab.getAttribute("data-view");
      if (link && link.getAttribute("href") && link.getAttribute("href") !== "#") {
        // Real multi-page navigation via <a href="...">
        closeMobileSidebar();
        return;
      }
      e.preventDefault();
      switchView(viewName);
      closeMobileSidebar();
    });
  });
}

function switchView(viewName, extraParams = "") {
  const currentPageView = document.body && document.body.getAttribute("data-page-view");
  if (CORE_PAGE_MAP[viewName] && currentPageView && currentPageView !== viewName) {
    window.location.href = CORE_PAGE_MAP[viewName] + (extraParams ? `?${extraParams}` : "");
    return;
  }
  appState.activeView = viewName;
  activateDomViewPanel(viewName);
  renderActiveView(viewName);
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
      const isDark = html.classList.contains("dark") || html.getAttribute("data-theme") === "dark";
      if (isDark) {
        html.classList.remove("dark");
        html.setAttribute("data-theme", "light");
        html.setAttribute("data-theme-mode", "light");
        localStorage.setItem("theme", "light");
      } else {
        html.classList.add("dark");
        html.setAttribute("data-theme", "dark");
        html.setAttribute("data-theme-mode", "dark");
        localStorage.setItem("theme", "dark");
      }
    });
  }

  const mobileBtn = document.getElementById("mobileSidebarToggleBtn");
  if (mobileBtn) {
    mobileBtn.addEventListener("click", () => {
      const sb = document.getElementById("sidebar");
      if (sb) sb.classList.toggle("mobile-open");
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
        <div class="card p-5">
          <h3>Total Labs in Course</h3>
          <div class="metric-val">${data.total_labs}</div>
          <div class="metric-sub">${appState.selectedCourse ? appState.selectedCourse.toUpperCase() : 'NO COURSE SELECTED'}</div>
        </div>
        <div class="card p-5">
          <h3>Open Findings</h3>
          <div class="metric-val" style="color: #ef4444;">${data.open_findings}</div>
          <div class="metric-sub">Critical & High Grader/Course Defects</div>
        </div>
        <div class="card p-5">
          <h3>Validation Coverage</h3>
          <div class="metric-val" style="color: #4ade80;">3 States</div>
          <div class="metric-sub">Unsolved, Solved, Near-Miss Matrix</div>
        </div>
        <div class="card p-5">
          <h3>Manifest Freshness</h3>
          <div class="metric-val">${data.manifest_needs_verification == 0 ? "Clean" : data.manifest_needs_verification}</div>
          <div class="metric-sub">${data.manifest_needs_verification} components need source verification</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 25px; margin-bottom: 12px;">
        <h2 style="font-size: 16px;">Latest Grading Runs</h2>
        <button class="btn btn-primary" onclick="switchView('runs')">+ Launch New Run</button>
      </div>

      <table class="data-table table align-middle text-gray-700 font-medium text-sm">
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
              <td><span class="badge badge-outline">${r.state}</span></td>
              <td>${r.mode}</td>
              <td>
                <span class="badge ${r.lab_verdict === 'PASS' ? 'badge-success badge-outline' : (r.lab_verdict === 'ERROR' ? 'badge-warning badge-outline' : 'badge-danger badge-outline')}">
                  ${r.lab_verdict || 'RUNNING'}
                </span>
              </td>
              <td><strong>${r.score_passed} / ${r.score_total}</strong></td>
              <td>${r.started_at ? r.started_at.substring(0, 19).replace('T', ' ') : '-'}</td>
              <td><button class="btn btn-light" onclick="viewRunDetail('${r.run_id}')">View Details</button></td>
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
      <div class="card">
        <div class="card-body flex flex-col items-center justify-center py-10 text-center">
          <div class="mb-3"><i class="ki-filled ki-book-open text-3xl text-primary"></i></div>
          <h3 class="text-base font-semibold text-gray-900 mb-1.5">No Course Selected</h3>
          <p class="text-xs text-gray-600 mb-4">
            Please select a course from the dropdown above, or import a Course Archive (.zip) and Grading Export (.json).
          </p>
          <button class="btn btn-sm btn-primary" onclick="openImportModal()">
            <i class="ki-filled ki-cloud-add"></i> Import Course / Grading
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="text-xs text-gray-500">Loading courses explorer for '${escapeHtml(appState.selectedCourse)}'...</div>`;

  try {
    const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
    const data = await res.json();
    const labs = Array.isArray(data) ? data : [];
    appState.labs = labs;

    container.innerHTML = `
      <div id="aiActionBanner" style="display: none; margin-bottom: 16px;"></div>
      <div id="lintSummaryBanner" style="display: none; margin-bottom: 16px;"></div>

      <div class="card card-grid min-w-full">
        <div class="card-header flex-wrap gap-2 py-4">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <h3 class="card-title text-base font-semibold text-gray-900">
                <i class="ki-filled ki-book-open text-primary me-1.5"></i>
                Courses Explorer — ${escapeHtml(appState.selectedCourse.toUpperCase())}
              </h3>
              <span class="badge badge-sm badge-success badge-outline">${labs.length} Labs Only</span>
            </div>
            <span class="text-xs text-gray-600">
              Showing Lab tasks only (non-lab theory &amp; quizzes filtered out). Inspect grader cases, lint issues, and readiness.
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm btn-light" onclick="openImportModal()">
              <i class="ki-filled ki-cloud-add"></i> Import Course / Grading
            </button>
            <button class="btn btn-sm btn-primary" onclick="openNewLabModal()">
              + Create Lab
            </button>
            <button class="btn btn-sm btn-info" onclick="triggerAiGraderRemediation()">
              ✨ AI Fix Grading
            </button>
            <button class="btn btn-sm btn-success" onclick="triggerAiCourseUpdate()">
              🚀 AI Update Course
            </button>
            <button class="btn btn-sm btn-light" onclick="runStaticLintOnCourse()">
              Grader Lint
            </button>
            <button class="btn btn-sm btn-light" onclick="exportPatchedCourseJson()">
              Export Patched JSON
            </button>
            <button class="btn btn-sm btn-danger btn-outline" onclick="deleteCurrentCourse()" title="Delete this course">
              Delete Course
            </button>
          </div>
        </div>

        <div class="card-body p-0">
          <div class="card-table scrollable-x-auto">
            <table class="table table-border align-middle text-gray-700 font-medium text-sm">
              <thead>
                <tr>
                  <th class="w-[120px]">Chapter / Part</th>
                  <th>Lab Description</th>
                  <th class="w-[130px]">Cases</th>
                  <th class="w-[150px]">Validation States</th>
                  <th class="w-[130px]">Readiness</th>
                  <th class="w-[210px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${labs.length === 0 ? `
                  <tr>
                    <td colspan="6" class="text-center py-8 text-gray-500">
                      No labs found in this course. Click <strong>Import Course / Grading</strong> to import a Course ZIP or Grading JSON.
                    </td>
                  </tr>
                ` : labs.map(l => {
                  const unsolvedRes = (l.validation_states || {}).unsolved || "not_run";
                  const solvedRes = (l.validation_states || {}).solved || "not_run";
                  const nearMissRes = (l.validation_states || {}).near_miss || "not_run";
                  const isReady = (unsolvedRes === "ok" && solvedRes === "ok" && nearMissRes === "ok");

                  return `
                    <tr>
                      <td><span class="badge badge-sm badge-outline font-mono">${l.chapter}.${l.part}</span></td>
                      <td>
                        <div class="font-semibold text-gray-900">${escapeHtml(l.description)}</div>
                        <div class="text-xs text-gray-500 font-mono">ID: ${l.export_id} | Slug: ${l.slug || '-'}</div>
                      </td>
                      <td><span class="badge badge-sm badge-primary badge-outline">${(l.grade || []).length} Cases</span></td>
                      <td>
                        <div class="flex gap-1">
                          <span class="badge badge-xs ${unsolvedRes === 'ok' ? 'badge-success badge-outline' : (unsolvedRes === 'violation' ? 'badge-danger badge-outline' : 'badge-outline')}" title="Unsolved">U</span>
                          <span class="badge badge-xs ${solvedRes === 'ok' ? 'badge-success badge-outline' : (solvedRes === 'violation' ? 'badge-danger badge-outline' : 'badge-outline')}" title="Solved">S</span>
                          <span class="badge badge-xs ${nearMissRes === 'ok' ? 'badge-success badge-outline' : (nearMissRes === 'violation' ? 'badge-danger badge-outline' : 'badge-outline')}" title="Near-Miss">N</span>
                        </div>
                      </td>
                      <td>
                        <span class="badge badge-sm ${isReady ? 'badge-success badge-outline' : 'badge-outline'}">${isReady ? 'Ready' : 'In Progress'}</span>
                      </td>
                      <td>
                        <div class="flex items-center gap-2">
                          <button class="btn btn-xs btn-light" onclick="viewLabCases('${l.id}')">Inspect Cases</button>
                          <button class="btn btn-xs btn-primary" onclick="prepareRunForLab('${l.id}')">
                            <i class="ki-filled ki-rocket"></i> Run
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="text-danger">Failed to load courses: ${e.message}</div>`;
  }
}

async function runStaticLintOnCourse() {
  const banner = document.getElementById("lintSummaryBanner");
  banner.style.display = "block";
  banner.innerHTML = `<div class="card p-5" style="border-color: var(--accent-blue);">Running static Grader Lint (GL01-GL16)...</div>`;

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
      <div class="card p-5" style="border-left: 4px solid ${blockCount > 0 ? '#ef4444' : '#f59e0b'};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>Grader Lint Complete: ${data.total_issues} Issues Found</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              <span style="color: #ef4444; font-weight: 700;">${blockCount} BLOCK</span> |
              <span style="color: #fbbf24; font-weight: 700;">${warnCount} WARN</span> |
              All issues flagged with <code>suspect=true</code> until confirmed by run.
            </div>
          </div>
          <button class="btn btn-light" onclick="document.getElementById('lintSummaryBanner').style.display='none'">Dismiss</button>
        </div>
        <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
          ${data.issues.slice(0, 10).map(iss => `
            <div style="font-size: 12px; margin-bottom: 6px; padding: 4px 8px; background-color: var(--bg-tertiary); border-radius: 4px; display: flex; justify-content: space-between;">
              <span><strong>${iss.rule_id}</strong> [${iss.severity}]: ${iss.message} (${iss.lab_desc || ''})</span>
              <button class="btn btn-light" style="padding: 2px 6px; font-size: 10px;" onclick="promoteIssueToFinding('${iss.rule_id}', '${escapeHtml(iss.message)}')">Promote to Finding</button>
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
        <div>[A] Unsolved run fails all required cases: <span class="badge badge-outline">Checked in Matrix</span></div>
        <div>[A] Solved run passes all cases: <span class="badge badge-outline">Checked in Matrix</span></div>
        <div>[A] Manual and tool results agree: <span class="badge badge-outline">Cross-check enabled</span></div>
      </div>
    </div>

    <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Grade Cases (${lab.grade.length})</h4>
    ${lab.grade.map((c, idx) => `
      <div class="card p-5" style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="badge badge-outline">Case ${c.case_index}</span>
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
          <button class="btn btn-light" onclick="proposeRevisionForCase('${c.id}', '${escapeQuotes(c.expect)}')">Propose Revision (Diff)</button>
          <button class="btn btn-primary" onclick="prepareRunForLab('${lab.id}', ${c.case_index})">Run Case</button>
        </div>
      </div>
    `).join('')}
  `;

  drawer.style.display = "flex";
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
  const currentPageView = document.body && document.body.getAttribute("data-page-view");
  if (currentPageView && currentPageView !== "runs") {
    window.location.href = `runs.html?lab=${encodeURIComponent(labId)}`;
    return;
  }
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
  if (appState.selectedCourse && (!appState.labs || appState.labs.length === 0)) {
    try {
      const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
      if (res.ok) {
        const data = await res.json();
        appState.labs = Array.isArray(data) ? data : [];
      }
    } catch (e) {
      console.error("Failed to load labs for Run Console", e);
    }
  }
  const urlLabId = new URLSearchParams(window.location.search).get("lab");
  container.innerHTML = `
    <div class="runs-layout-grid">
      <!-- Left: Run Configuration Console (Metronic Card) -->
      <div class="flex flex-col gap-4">
        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">
              <i class="ki-filled ki-rocket text-primary me-1.5"></i> Launch Grading Run
            </h3>
            <span class="badge badge-xs badge-primary badge-outline">4-Step Pipeline</span>
          </div>
          <div class="card-body flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="form-label text-xs text-gray-600">Target Lab:</label>
              <select id="runLabSelect" class="select select-sm" onchange="loadLabMdForSelectedLab()">
                ${appState.labs.length > 0 ? appState.labs.map(l => `<option value="${l.id}" ${urlLabId === l.id ? 'selected' : ''}>${escapeHtml(l.description || l.title || l.id)} (${l.chapter}.${l.part})</option>`).join('') : '<option value="">(No labs loaded for this course)</option>'}
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="form-label text-xs text-primary font-semibold">⚡ Workflow Mode:</label>
              <select id="runWorkflowSelect" class="select select-sm">
                <option value="4step" selected>⚡ 4-Step Pipeline: Baseline &rarr; Solve &rarr; Manual &rarr; nusactl</option>
                <option value="standard">Standard Run (Single Mode)</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">Target VM:</label>
                <select id="runTargetSelect" class="select select-sm">
                  ${appState.targets.map(t => `<option value="${t.id}">${t.name} [${t.modifiable ? 'MOD' : 'IMM'}]</option>`).join('')}
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">Validation State:</label>
                <select id="runStateSelect" class="select select-sm" onchange="onRunStateChange()">
                  <option value="unsolved">Unsolved (Must FAIL)</option>
                  <option value="solved" selected>Solved (Must PASS)</option>
                  <option value="near-miss">Near-Miss</option>
                  <option value="final">Final Run (Auto-Solve Unsolved &rarr; SOLVED)</option>
                </select>
              </div>
            </div>

            <!-- AI Solver: Follow Lab MD instructions or Solve Challenge Requirements checkbox -->
            <div class="card p-3 bg-light-active border border-gray-200">
              <label class="checkbox-group cursor-pointer">
                <input type="checkbox" id="runFollowLabMdCheckbox" class="checkbox checkbox-sm" checked>
                <span class="checkbox-label font-semibold text-xs text-gray-900">
                  🤖 AI Solver: Follow Instructions, Solve Challenge &amp; Auto-Fix Unsolved Cases
                </span>
              </label>
              <div class="text-xs text-gray-600 mt-1">
                Reads step-by-step Lab MD instructions <em>or</em> synthesizes solution steps from Challenge Requirements &amp; Grader Test Cases. If any case remains unsolved during Final Run, AI iteratively remediates each failed case until its status is <strong>SOLVED</strong>.
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">Execution Mode:</label>
                <select id="runModeSelect" class="select select-sm">
                  <option value="manual">Manual SSH</option>
                  <option value="tool">Tool (nusactl)</option>
                  <option value="both" selected>Both &amp; Cross-Check</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">Variables:</label>
                <input type="text" id="runVarsInput" class="input input-sm" placeholder="$NUSA_USERNAME=nusa">
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="form-label text-xs text-gray-600">Platform Grade Slug (<code>nusactl grade &lt;slug&gt;</code>):</label>
              <div class="flex gap-1.5">
                <input type="text" id="runGradeSlugInput" class="input input-sm font-mono flex-1" placeholder="e.g. glpc-004-1, glpc-009-5">
                <button class="btn btn-sm btn-light shrink-0" onclick="resetToDefaultGradeSlug()" title="Reset to auto-resolved slug">Auto Slug</button>
              </div>
            </div>

            <!-- Git Global Config Credentials Inputs (Optional) -->
            <div id="gitConfigBox" class="card p-3">
              <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-semibold text-primary uppercase">
                  🐙 Git Global Config <span class="text-2xs font-normal text-gray-500">(Optional)</span>
                </span>
                <span id="gitConfigStatusNote" class="text-2xs text-gray-500">Auto-detected from lab</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1">
                  <label class="form-label text-2xs text-gray-600">username akun git:</label>
                  <input type="text" id="runGitUserInput" class="input input-sm font-mono" value="${escapeHtml(localStorage.getItem('gitUsername') || '')}" placeholder="e.g. afifr">
                </div>
                <div class="flex flex-col gap-1">
                  <label class="form-label text-2xs text-gray-600">email akun git:</label>
                  <input type="text" id="runGitEmailInput" class="input input-sm font-mono" value="${escapeHtml(localStorage.getItem('gitEmail') || '')}" placeholder="e.g. afifr@aditraining.id">
                </div>
              </div>
            </div>

            <button class="btn btn-primary justify-center w-full font-semibold" onclick="executeGradingRun()">
              <i class="ki-filled ki-rocket"></i> Run 4-Step Automated Flow
            </button>
          </div>
        </div>

        <!-- Lab MD Preview & Custom Editor Card -->
        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-xs font-semibold text-gray-900">📖 Lab MD Instructions</h3>
            <div class="flex gap-1.5">
              <button class="btn btn-xs btn-info" onclick="runDirectFromMd()" title="Run 4-Step Pipeline directly from this Markdown">⚡ Run MD</button>
              <button class="btn btn-xs btn-light" onclick="previewParsedLabSteps()" title="Preview executable commands extracted by AI">🤖 Steps</button>
              <button class="btn btn-xs btn-light" onclick="toggleEditLabMd()" title="Edit or paste custom Markdown instructions">✏️ Edit MD</button>
            </div>
          </div>
          <div class="card-body flex flex-col gap-2">
            <div id="labMdInfo" class="text-xs text-gray-500">Loading Lab MD...</div>
            <div id="labMdPreview" class="kt-terminal p-2.5 overflow-y-auto" style="max-height: 130px; white-space: pre-wrap;"></div>
            <div id="labMdEditorContainer" style="display: none;">
              <textarea id="labMdEditorInput" class="textarea font-mono text-xs w-full" style="height: 160px;" placeholder="Paste or edit Lab Markdown here..."></textarea>
              <div class="flex justify-end gap-2 mt-2">
                <button class="btn btn-xs btn-light" onclick="toggleEditLabMd()">Cancel</button>
                <button class="btn btn-xs btn-primary" onclick="saveCustomLabMd()">💾 Save Lab MD</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Dynamic Grader Test Cases Card (Non-hardcoded) -->
        <div class="card card-compact">
          <div class="card-header">
            <div class="flex items-center gap-2">
              <h3 class="card-title text-xs font-semibold text-gray-900">🧪 Grader Test Cases</h3>
              <span id="labGradeCountBadge" class="badge badge-xs badge-outline">0 Cases</span>
            </div>
            <button class="btn btn-xs btn-light" onclick="toggleEditLabGrade()" title="Edit or paste dynamic test cases JSON">✏️ Edit Grader</button>
          </div>
          <div class="card-body flex flex-col gap-2">
            <div id="labGradeInfo" class="text-xs text-gray-500">Dynamic test cases loaded from lab configuration</div>
            <div id="labGradePreview" class="kt-terminal p-2.5 overflow-y-auto" style="max-height: 140px;"></div>
            <div id="labGradeEditorContainer" style="display: none;">
              <textarea id="labGradeEditorInput" class="textarea font-mono text-xs w-full" style="height: 180px;" placeholder='Paste or edit Grader Test Cases JSON, e.g. [{"name": "case 1...", "cmd": "...", "expect": "..."}]'></textarea>
              <div class="flex justify-end gap-2 mt-2">
                <button class="btn btn-xs btn-light" onclick="toggleEditLabGrade()">Cancel</button>
                <button class="btn btn-xs btn-primary" onclick="saveCustomLabGrade()">💾 Save Grader</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Live Progress & Output Console (Metronic Card) -->
      <div class="flex flex-col gap-4">
        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">
              <i class="ki-filled ki-technology-2 text-primary me-1.5"></i> Live Execution Stream (SSE)
            </h3>
            <span id="runLiveBadge" class="badge badge-sm badge-outline">Idle</span>
          </div>
          <div class="card-body">
            <div id="runProgressBox" class="kt-terminal p-3.5 overflow-y-auto" style="height: 380px;">
              <div class="text-gray-500">Select options on the left and click "Run 4-Step Automated Flow" to watch live results stream in real-time...</div>
            </div>
          </div>
        </div>

        <!-- Live SSE Case Breakdown (Divided: 1. Manual Bash, 2. Automated nusactl) -->
        <div id="liveResultsPanel" class="flex flex-col gap-4">

          <!-- SECTION 1: MANUAL BASH TEST CASES -->
          <div class="card card-compact">
            <div class="card-header">
              <div class="flex items-center gap-2">
                <h3 class="card-title text-xs font-semibold text-gray-900">🛠️ 1. Manual Test Cases (Manual Bash)</h3>
                <span id="liveCaseStatsSummary" class="badge badge-xs badge-outline">0 / 0 Cases</span>
              </div>
              <div id="liveOverallPill" class="text-xs font-semibold text-gray-500">
                Awaiting manual execution...
              </div>
            </div>

            <div class="card-body flex flex-col gap-3">
              <!-- Manual Pass / Fail Badges Row -->
              <div class="case-badge-grid">
                <!-- Passed Cases Box -->
                <div class="card p-3" style="background: var(--pass-bg); border-color: var(--pass-border);">
                  <div class="flex justify-between items-center mb-1.5">
                    <span class="text-xs font-semibold text-success">✅ Manual Cases Passed:</span>
                    <span id="passedCountBadge" class="badge badge-xs badge-success badge-outline">0</span>
                  </div>
                  <div id="passedCasesPills" class="flex flex-wrap gap-1.5 items-center" style="min-height: 22px;">
                    <span class="text-xs text-gray-500">None yet</span>
                  </div>
                </div>

                <!-- Failed Cases Box -->
                <div class="card p-3" style="background: var(--fail-bg); border-color: var(--fail-border);">
                  <div class="flex justify-between items-center mb-1.5">
                    <span class="text-xs font-semibold text-danger">❌ Manual Cases Failed:</span>
                    <span id="failedCountBadge" class="badge badge-xs badge-danger badge-outline">0</span>
                  </div>
                  <div id="failedCasesPills" class="flex flex-wrap gap-1.5 items-center" style="min-height: 22px;">
                    <span class="text-xs text-gray-500">None yet</span>
                  </div>
                </div>
              </div>

              <!-- Detailed Case Output Inspection Container -->
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="text-2xs font-semibold text-gray-600 uppercase">Manual Case Outputs &amp; Inspection:</span>
                  <button class="btn btn-xs btn-light" onclick="toggleLiveCaseDetails()" id="liveDetailsToggleBtn">Hide Details</button>
                </div>
                <div id="liveCasesTable" class="kt-terminal overflow-y-auto" style="max-height: 200px;">
                  <div class="p-3 text-gray-500 text-xs text-center">Case outputs and command diagnostics will appear here live...</div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 2: AUTOMATED PLATFORM GRADE (nusactl grade) -->
          <div class="card card-compact">
            <div class="card-header">
              <div class="flex items-center gap-2">
                <h3 class="card-title text-xs font-semibold text-gray-900">🚀 2. Automated Platform Grade (nusactl grade)</h3>
                <span id="toolGradeStatusBadge" class="badge badge-xs badge-outline">Awaiting nusactl...</span>
              </div>
              <div id="toolScoreBadge" class="text-xs font-semibold text-gray-600">
                Score: - / 100
              </div>
            </div>

            <div class="card-body flex flex-col gap-3">
              <!-- nusactl Pass / Fail Badges Row -->
              <div class="case-badge-grid">
                <!-- nusactl Passed Cases Box -->
                <div class="card p-3" style="background: var(--pass-bg); border-color: var(--pass-border);">
                  <div class="flex justify-between items-center mb-1.5">
                    <span class="text-xs font-semibold text-success">✅ nusactl Cases Passed:</span>
                    <span id="toolPassedCountBadge" class="badge badge-xs badge-success badge-outline">0</span>
                  </div>
                  <div id="toolPassedCasesPills" class="flex flex-wrap gap-1.5 items-center" style="min-height: 22px;">
                    <span class="text-xs text-gray-500">None yet</span>
                  </div>
                </div>

                <!-- nusactl Failed Cases Box -->
                <div class="card p-3" style="background: var(--fail-bg); border-color: var(--fail-border);">
                  <div class="flex justify-between items-center mb-1.5">
                    <span class="text-xs font-semibold text-danger">❌ nusactl Cases Failed:</span>
                    <span id="toolFailedCountBadge" class="badge badge-xs badge-danger badge-outline">0</span>
                  </div>
                  <div id="toolFailedCasesPills" class="flex flex-wrap gap-1.5 items-center" style="min-height: 22px;">
                    <span class="text-xs text-gray-500">None yet</span>
                  </div>
                </div>
              </div>

              <!-- nusactl Output Preview -->
              <div id="toolGradeOutputContainer" class="kt-terminal p-3 overflow-y-auto" style="max-height: 150px;">
                nusactl output preview will appear here upon Stage 4 completion...
              </div>
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
    appState.currentSolverMode = data.solver_mode || "guided";
    appState.customGradeJson = null;

    const modeBadge = appState.currentSolverMode === "challenge"
      ? `<span class="badge badge-info" style="margin-left: 6px; font-size: 10px;">🏆 Challenge Requirements Solver</span>`
      : `<span class="badge badge-success badge-outline" style="margin-left: 6px; font-size: 10px;">📖 Guided Instruction Solver</span>`;
    if (infoEl) infoEl.innerHTML = `<span style="color: #4ade80;">Source: ${escapeHtml(data.source)}</span> (${appState.currentLabMd.length} chars) ${modeBadge}`;
    if (previewEl) previewEl.textContent = appState.currentLabMd || "(No Lab Markdown available for this lab yet. Click 'Edit MD' to paste one.)";
    if (editorInput) editorInput.value = appState.currentLabMd;

    const noteEl = document.getElementById("gitConfigStatusNote");
    const mdLower = (appState.currentLabMd || "").toLowerCase();
    const hasGit = Boolean(appState.currentLabMd && (
      mdLower.includes("git config") ||
      mdLower.includes("akun git") ||
      mdLower.includes("user.name") ||
      mdLower.includes("gitlab") ||
      mdLower.includes("git clone") ||
      mdLower.includes("git push")
    ));
    if (noteEl) {
      if (hasGit) {
        noteEl.innerHTML = `<span style="color: #4ade80; font-weight: 600;">Active (Git/GitLab detected in lab)</span>`;
      } else {
        noteEl.innerHTML = `<span style="color: var(--text-muted);">Inactive (no git steps in this lab)</span>`;
      }
    }

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
    countBadge.className = cases.length > 0 ? "badge badge-success badge-outline" : "badge badge-outline";
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
  const targetSelect = document.getElementById("runTargetSelect");
  const targetId = targetSelect ? targetSelect.value : null;
  const logBox = document.getElementById("runProgressBox");

  logBox.innerHTML = `[${new Date().toISOString()}] Analyzing Lab MD & Requirements for '${select.options[select.selectedIndex].text}'...\n`;

  const mdLower = (appState.currentLabMd || "").toLowerCase();
  const labUsesGit = Boolean(appState.currentLabMd && (
    mdLower.includes("git config") ||
    mdLower.includes("akun git") ||
    mdLower.includes("user.name") ||
    mdLower.includes("gitlab") ||
    mdLower.includes("git clone") ||
    mdLower.includes("git push")
  ));

  const gitUserInput = document.getElementById("runGitUserInput");
  const gitEmailInput = document.getElementById("runGitEmailInput");
  const gitUsername = labUsesGit && gitUserInput ? gitUserInput.value.trim() : "";
  const gitEmail = labUsesGit && gitEmailInput ? gitEmailInput.value.trim() : "";

  try {
    const res = await fetch(`${API_BASE}/labs/${labId}/parse-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lab_md: appState.currentLabMd,
        custom_grade: appState.customGradeJson || appState.currentLabGrade,
        target_id: targetId,
        git_username: labUsesGit ? (gitUsername || null) : null,
        git_email: labUsesGit ? (gitEmail || null) : null
      })
    });
    const data = await res.json();
    const isChallenge = data.solver_mode === "challenge";
    const headerTitle = isChallenge
      ? "🏆 AI CHALLENGE REQUIREMENTS SOLVER PREVIEW"
      : "📖 AI GUIDED INSTRUCTION PARSER PREVIEW";
    logBox.innerHTML += `\n========================================\n${headerTitle}\nSolver Mode: ${isChallenge ? 'Challenge Mode (Synthesized from Requirements & Grader Cases)' : 'Guided Mode (Step-by-Step Markdown Commands)'}\nTotal Steps Extracted: ${data.total_steps}\n========================================\n`;
    if (data.steps.length === 0) {
      logBox.innerHTML += `No executable commands or requirements found in this Lab.\n`;
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

  const gitUserInput = document.getElementById("runGitUserInput");
  const gitEmailInput = document.getElementById("runGitEmailInput");
  const gitUsername = gitUserInput ? gitUserInput.value.trim() : "";
  const gitEmail = gitEmailInput ? gitEmailInput.value.trim() : "";

  if (gitUsername) localStorage.setItem("gitUsername", gitUsername);
  if (gitEmail) localStorage.setItem("gitEmail", gitEmail);

  // Check if current lab md contains git/gitlab steps
  const mdLower = (appState.currentLabMd || "").toLowerCase();
  const labUsesGit = Boolean(appState.currentLabMd && (
    mdLower.includes("git config") ||
    mdLower.includes("akun git") ||
    mdLower.includes("user.name") ||
    mdLower.includes("gitlab") ||
    mdLower.includes("git clone") ||
    mdLower.includes("git push")
  ));

  const varsObj = {};
  if (rawVars.includes("=")) {
    const parts = rawVars.split("=");
    varsObj[parts[0].trim()] = parts[1].trim();
  }
  // Only inject git variables if this lab actually contains git config steps
  if (labUsesGit) {
    if (gitUsername) varsObj["GIT_USERNAME"] = gitUsername;
    if (gitEmail) varsObj["GIT_EMAIL"] = gitEmail;
  }

  const logBox = document.getElementById("runProgressBox");
  const liveBadge = document.getElementById("runLiveBadge");

  // Live Case Breakdown UI elements (Manual Bash)
  const passedCases = [];
  const failedCases = [];
  const passedCountEl = document.getElementById("passedCountBadge");
  const failedCountEl = document.getElementById("failedCountBadge");
  const passedPillsEl = document.getElementById("passedCasesPills");
  const failedPillsEl = document.getElementById("failedCasesPills");
  const liveTableEl = document.getElementById("liveCasesTable");
  const statsSummaryEl = document.getElementById("liveCaseStatsSummary");
  const overallPillEl = document.getElementById("liveOverallPill");

  // Live Case Breakdown UI elements (Automated nusactl Grade)
  let toolPassedCases = [];
  let toolFailedCases = [];
  const toolStatusBadge = document.getElementById("toolGradeStatusBadge");
  const toolScoreBadge = document.getElementById("toolScoreBadge");
  const toolPassedCountEl = document.getElementById("toolPassedCountBadge");
  const toolFailedCountEl = document.getElementById("toolFailedCountBadge");
  const toolPassedPillsEl = document.getElementById("toolPassedCasesPills");
  const toolFailedPillsEl = document.getElementById("toolFailedCasesPills");
  const toolOutputEl = document.getElementById("toolGradeOutputContainer");

  if (passedCountEl) passedCountEl.textContent = "0";
  if (failedCountEl) failedCountEl.textContent = "0";
  if (passedPillsEl) passedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (failedPillsEl) failedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (liveTableEl) liveTableEl.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 11px; text-align: center;">Awaiting test case execution...</div>';
  if (statsSummaryEl) {
    statsSummaryEl.className = "badge badge-outline";
    statsSummaryEl.textContent = "0 / 0 Cases";
  }
  if (overallPillEl) overallPillEl.textContent = "Awaiting manual execution...";

  if (toolStatusBadge) {
    toolStatusBadge.className = "badge badge-outline";
    toolStatusBadge.textContent = "Awaiting nusactl...";
  }
  if (toolScoreBadge) toolScoreBadge.textContent = "Score: - / 100";
  if (toolPassedCountEl) toolPassedCountEl.textContent = "0";
  if (toolFailedCountEl) toolFailedCountEl.textContent = "0";
  if (toolPassedPillsEl) toolPassedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (toolFailedPillsEl) toolFailedPillsEl.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">None yet</span>';
  if (toolOutputEl) toolOutputEl.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">nusactl output preview will appear here upon Stage 4 completion...</div>';

  liveBadge.className = "badge badge-info";
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
        git_username: labUsesGit ? (gitUsername || null) : null,
        git_email: labUsesGit ? (gitEmail || null) : null,
        vars: varsObj,
        follow_lab_md: followLabMd,
        custom_lab_md: appState.currentLabMd,
        custom_grade: appState.customGradeJson || appState.currentLabGrade
      })
    });
    const data = await res.json();
    const runId = data.run_id;

    logBox.innerHTML += `[${new Date().toISOString()}] Run registered: ${runId}\n[${new Date().toISOString()}] Subscribing to Server-Sent Events (SSE)...\n`;
    liveBadge.className = "badge badge-info";
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
      logBox.innerHTML += `  <span style="color: #94a3b8; font-weight: 600;">Initial Baseline Check:</span> <span class="badge ${p.verdict === 'PASS' ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">${p.verdict} (Unsolved)</span>\n`;
      if (p.stdout) {
        const previewOut = p.stdout.trim().split('\n')[0];
        logBox.innerHTML += `  <span style="color: #64748b; font-size: 11px;">| ${escapeHtml(previewOut)}</span>\n`;
      }
      logBox.innerHTML += `\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    // AI Lab MD Instruction / Challenge Solver SSE listeners
    sse.addEventListener("ai_md_reading", (e) => {
      const p = JSON.parse(e.data);
      const isChallenge = p.solver_mode === "challenge";
      const icon = isChallenge ? "🏆" : "📖";
      const actionLabel = isChallenge
        ? "Analyzing Challenge Requirements & Grader Cases"
        : "Reading Lab MD Instructions";
      logBox.innerHTML += `<span style="color: #c084fc; font-weight: 700;">${icon} [AI AGENT] ${actionLabel}: "${escapeHtml(p.description)}" (${p.md_chars} chars)...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_instructions_parsed", (e) => {
      const p = JSON.parse(e.data);
      appState.totalAiSteps = p.total_steps;
      const isChallenge = p.solver_mode === "challenge";
      const msgLabel = isChallenge
        ? `Synthesized ${p.total_steps} solution steps from Challenge Requirements & Grader Checks`
        : `Extracted ${p.total_steps} instruction steps from Lab MD`;
      logBox.innerHTML += `<span style="color: #38bdf8; font-weight: 700;">📋 [AI AGENT] ${msgLabel}</span>\n<span style="color: #fbbf24; font-weight: 600;">⚡ [AI AGENT] Executing solution steps on target lab VM...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_step_start", (e) => {
      const p = JSON.parse(e.data);
      const total = p.total || appState.totalAiSteps || "?";
      const cleanCmd = (p.cmd || "").replace(/\r?\n/g, " ").trim();
      logBox.innerHTML += `<div id="ai-step-${p.step}" style="margin: 2px 0; line-height: 1.5;"><span style="color: #60a5fa; font-weight: 600;">[Step ${p.step}/${total}]</span> <code style="color: #f1f5f9;">${escapeHtml(cleanCmd)}</code> <span style="color: #fbbf24; font-size: 11px;">... running</span></div>`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_step_done", (e) => {
      const p = JSON.parse(e.data);
      const total = p.total || appState.totalAiSteps || "?";
      const ok = p.exit_code === 0;
      const statusColor = ok ? '#4ade80' : '#f87171';
      const cleanCmd = (p.cmd || "").replace(/\r?\n/g, " ").trim();
      let previewOut = "";
      if (p.stdout && p.stdout.trim()) {
        previewOut = p.stdout.trim().split(/\r?\n/)[0].trim();
      } else if (p.stderr && p.stderr.trim()) {
        previewOut = p.stderr.trim().split(/\r?\n/)[0].trim();
      }
      const stepEl = document.getElementById(`ai-step-${p.step}`);
      const stepContent = `<span style="color: #60a5fa; font-weight: 600;">[Step ${p.step}/${total}]</span> <code style="color: #f1f5f9;">${escapeHtml(cleanCmd)}</code> <span style="color: ${statusColor}; font-weight: 700; font-size: 11px;">&rarr; Exit: ${p.exit_code} ${ok ? 'OK' : 'FAIL'}</span>${previewOut ? ` <span style="color: #94a3b8; font-size: 11px;">| ${escapeHtml(previewOut)}</span>` : ''}`;

      if (stepEl) {
        stepEl.innerHTML = stepContent;
      } else {
        logBox.innerHTML += `<div style="margin: 2px 0; line-height: 1.5;">${stepContent}</div>`;
      }
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
      if (toolStatusBadge) {
        toolStatusBadge.className = "badge badge-info";
        toolStatusBadge.textContent = "Grading with nusactl...";
      }
      if (toolOutputEl) {
        toolOutputEl.innerHTML = `<span style="color: #38bdf8;">Executing <code>${escapeHtml(p.cmd)}</code> on target VM...</span>`;
      }
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

      // Update nusactl section in UI
      if (toolStatusBadge) {
        toolStatusBadge.className = isPass ? "badge badge-success badge-outline" : "badge badge-danger badge-outline";
        toolStatusBadge.textContent = p.verdict;
      }
      const scoreVal = p.score !== undefined ? p.score : (isPass ? 100 : 0);
      if (toolScoreBadge) {
        toolScoreBadge.innerHTML = `Score: <strong style="color: ${scoreVal === 100 ? '#4ade80' : '#f87171'}; font-size: 13px;">${scoreVal} / 100</strong>`;
      }

      toolPassedCases = p.passed_cases || [];
      toolFailedCases = p.failed_cases || [];

      if (toolPassedCountEl) toolPassedCountEl.textContent = toolPassedCases.length;
      if (toolFailedCountEl) toolFailedCountEl.textContent = toolFailedCases.length;

      if (toolPassedPillsEl) {
        if (toolPassedCases.length > 0) {
          toolPassedPillsEl.innerHTML = toolPassedCases.map(c => `<span class="badge badge-success badge-outline" style="font-size: 11px; font-weight: 700;">Case ${c}</span>`).join(' ');
        } else if (isPass) {
          toolPassedPillsEl.innerHTML = `<span class="badge badge-success badge-outline" style="font-size: 11px; font-weight: 700;">All Platform Checks Passed</span>`;
        } else {
          toolPassedPillsEl.innerHTML = `<span style="font-size: 11px; color: var(--text-muted);">None</span>`;
        }
      }

      if (toolFailedPillsEl) {
        if (toolFailedCases.length > 0) {
          toolFailedPillsEl.innerHTML = toolFailedCases.map(c => `<span class="badge badge-danger badge-outline" style="font-size: 11px; font-weight: 700;">Case ${c}</span>`).join(' ');
        } else if (!isPass && toolPassedCases.length === 0) {
          toolFailedPillsEl.innerHTML = `<span class="badge badge-danger badge-outline" style="font-size: 11px; font-weight: 700;">Platform Grade Failed</span>`;
        } else {
          toolFailedPillsEl.innerHTML = `<span style="font-size: 11px; color: var(--text-muted);">None</span>`;
        }
      }

      if (toolOutputEl) {
        const cleanOut = (p.stdout || "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
        toolOutputEl.innerHTML = cleanOut 
          ? `<pre style="margin: 0; white-space: pre-wrap; font-family: var(--font-mono); font-size: 11px; color: #cbd5e1;">${escapeHtml(cleanOut)}</pre>`
          : `<span style="color: var(--text-muted);">(No stdout from nusactl)</span>`;
        if (p.stderr) {
          toolOutputEl.innerHTML += `<div style="color: #f87171; margin-top: 4px; font-size: 11px;">${escapeHtml(p.stderr)}</div>`;
        }
      }
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
          passedPillsEl.innerHTML += `<span class="badge badge-success badge-outline" style="font-size: 11px; font-weight: 700;" title="${escapeHtml(p.name)}">Case ${p.case_index}</span>`;
        }
      } else {
        failedCases.push(p.case_index);
        if (failedCountEl) failedCountEl.textContent = failedCases.length;
        if (failedPillsEl) {
          if (failedCases.length === 1) failedPillsEl.innerHTML = '';
          failedPillsEl.innerHTML += `<span class="badge badge-danger badge-outline" style="font-size: 11px; font-weight: 700;" title="${escapeHtml(p.name)}">Case ${p.case_index}</span>`;
        }
      }

      if (statsSummaryEl) {
        const totalDone = passedCases.length + failedCases.length;
        statsSummaryEl.className = failedCases.length === 0 ? "badge badge-success badge-outline" : "badge badge-danger badge-outline";
        statsSummaryEl.textContent = `${passedCases.length} / ${totalDone} Passed`;
      }

      // Add to detailed Case Output Inspection table
      if (liveTableEl) {
        if (passedCases.length + failedCases.length === 1) liveTableEl.innerHTML = '';
        liveTableEl.innerHTML += `
          <div id="live-case-row-${p.case_index}" style="border-bottom: 1px solid var(--border-color); padding: 8px 12px; font-family: var(--font-mono); font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 700; color: #f8fafc;">Case ${p.case_index}: ${escapeHtml(p.name)}</span>
              <span id="live-case-badge-${p.case_index}" class="badge ${isPass ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">${p.verdict} (${p.duration_ms}ms)</span>
            </div>
            <div id="live-case-body-${p.case_index}" style="color: #94a3b8; display: grid; gap: 2px;">
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

    // AI Iterative Unsolved Case Solver (Post-`nusactl grade` Self-Healing & `nusactl grade` Validation) SSE listeners
    sse.addEventListener("ai_remediation_round_start", (e) => {
      const p = JSON.parse(e.data);
      const caseList = (p.unsolved_cases || []).map(c => `Case ${c}`).join(", ");
      logBox.innerHTML += `\n<div style="background: rgba(245, 158, 11, 0.16); border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0 6px 0; border-radius: 4px; font-weight: 700; color: #fef3c7; font-size: 12px;">
  🔧 [AI POST-NUSACTL CASE SOLVER — ROUND ${p.attempt}/${p.max_attempts}] Detected ${p.unsolved_count} unsolved case(s) after nusactl grade (${escapeHtml(caseList)}). Solving &amp; re-validating with nusactl grade...
</div>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_case_fix_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #fbbf24; font-weight: 700;">🤖 [AI SOLVING CASE ${p.case_index}] ${escapeHtml(p.name)} — Executing ${p.fix_count} targeted remediation step(s)...</span>\n`;
      if (Array.isArray(p.fix_commands)) {
        p.fix_commands.forEach((cmdStr, idx) => {
          logBox.innerHTML += `   <span style="color: #93c5fd; font-size: 11px;">[Fix ${idx + 1}]</span> <code style="color: #e2e8f0; font-size: 11px;">${escapeHtml(cmdStr)}</code>\n`;
        });
      }
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_case_ready_for_validation", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `   <span style="color: #a7f3d0; font-size: 11px;">✓ Case ${p.case_index} fix applied (ready for validation via <code>${escapeHtml(p.validate_cmd || 'nusactl grade')}</code>)</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_nusactl_validation_start", (e) => {
      const p = JSON.parse(e.data);
      logBox.innerHTML += `<span style="color: #38bdf8; font-weight: 700;">🔍 [AI NUSACTL VALIDATION] Fixes complete! Validating solved state via <code>${escapeHtml(p.cmd)}</code> (Attempt ${p.attempt})...</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_nusactl_validation_complete", (e) => {
      const p = JSON.parse(e.data);
      const ok = p.verdict === "PASS";
      logBox.innerHTML += `  <span style="color: ${ok ? '#4ade80' : '#fbbf24'}; font-weight: 700;">[AI NUSACTL VALIDATION RESULT: ${p.verdict}]</span> Score: ${p.score}/100 &rarr; Status: ${p.status}\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("ai_case_fix_complete", (e) => {
      const p = JSON.parse(e.data);
      const isSolved = p.verdict === "PASS" || p.status === "SOLVED";
      const color = isSolved ? "#4ade80" : "#f87171";
      logBox.innerHTML += `  <span style="color: ${color}; font-weight: 700;">${isSolved ? '✅' : '⚠️'} [CASE ${p.case_index} ${p.status}] ${escapeHtml(p.name)} &rarr; Validated by <code>${escapeHtml(p.validated_by || 'nusactl grade')}</code> (${p.verdict})</span>\n`;
      logBox.scrollTop = logBox.scrollHeight;

      if (isSolved) {
        const fIdx = failedCases.indexOf(p.case_index);
        if (fIdx !== -1) failedCases.splice(fIdx, 1);
        if (!passedCases.includes(p.case_index)) passedCases.push(p.case_index);

        if (passedCountEl) passedCountEl.textContent = passedCases.length;
        if (failedCountEl) failedCountEl.textContent = failedCases.length;

        if (passedPillsEl) {
          passedPillsEl.innerHTML = passedCases.map(c => `<span class="badge badge-success badge-outline" style="font-size: 11px; font-weight: 700;">Case ${c} (SOLVED)</span>`).join(' ');
        }
        if (failedPillsEl) {
          failedPillsEl.innerHTML = failedCases.length > 0
            ? failedCases.map(c => `<span class="badge badge-danger badge-outline" style="font-size: 11px; font-weight: 700;">Case ${c}</span>`).join(' ')
            : '<span style="font-size: 11px; color: var(--text-muted);">None (All Solved)</span>';
        }
        if (statsSummaryEl) {
          const totalDone = passedCases.length + failedCases.length;
          statsSummaryEl.className = failedCases.length === 0 ? "badge badge-success badge-outline" : "badge badge-danger badge-outline";
          statsSummaryEl.textContent = `${passedCases.length} / ${totalDone} Passed (SOLVED)`;
        }

        const badgeEl = document.getElementById(`live-case-badge-${p.case_index}`);
        if (badgeEl) {
          badgeEl.className = "badge badge-success badge-outline";
          badgeEl.textContent = "SOLVED / PASS";
        }
        const bodyEl = document.getElementById(`live-case-body-${p.case_index}`);
        if (bodyEl && p.stdout !== undefined) {
          bodyEl.innerHTML += `<div style="color: #4ade80; font-weight: 600;">✨ Remediated by AI Solver &amp; Validated via <code>${escapeHtml(p.validated_by || 'nusactl grade')}</code> &rarr; Actual: <code>${escapeHtml(p.stdout)}</code> (Status: SOLVED)</div>`;
        }
      }
    });

    sse.addEventListener("ai_remediation_complete", (e) => {
      const p = JSON.parse(e.data);
      const ok = Boolean(p.all_solved);
      logBox.innerHTML += `<span style="color: ${ok ? '#4ade80' : '#fbbf24'}; font-weight: 700;">🎯 [AI CASE SOLVER COMPLETE] ${p.solved_count}/${p.total_count} cases now PASS (Validated via ${escapeHtml(p.validated_by || 'nusactl grade')}) — Status: ${ok ? 'SOLVED' : 'PARTIAL'}</span>\n\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("pipeline_complete", (e) => {
      const p = JSON.parse(e.data);
      const isPass = p.final_verdict === 'PASS';
      logBox.innerHTML += `\n<div style="background: rgba(34, 197, 94, 0.12); border: 1px solid #22c55e; border-radius: 6px; padding: 12px; margin-top: 10px;">
  <strong style="color: #4ade80; font-size: 13px;">🎉 4-STEP AUTOMATED PIPELINE COMPLETE</strong>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 10px; font-size: 12px;">
    <div>1. Baseline Pre-Grade: <span class="badge badge-danger badge-outline">${escapeHtml(p.stage_1_baseline.verdict)}</span></div>
    <div>2. Instructions Executed: <span class="badge badge-success badge-outline">${p.stage_2_instructions.steps_count} steps</span></div>
    <div>3. Manual Bash Grade: <span class="badge ${p.stage_3_manual.verdict === 'PASS' ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">${p.stage_3_manual.score_passed}/${p.stage_3_manual.score_total} (${p.stage_3_manual.verdict})</span></div>
    <div>4. Platform Tool Grade: <span class="badge ${p.stage_4_tool.verdict === 'PASS' ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">${p.stage_4_tool.verdict} (${escapeHtml(p.stage_4_tool.slug)})</span></div>
  </div>
  <div style="margin-top: 10px; font-weight: 700; color: #f8fafc; font-size: 13px;">
    Overall Workflow Verdict: <span class="badge ${isPass ? 'badge-success badge-outline' : 'badge-danger badge-outline'}" style="font-size: 13px;">${p.final_verdict}</span>
  </div>
</div>\n`;
      logBox.scrollTop = logBox.scrollHeight;
    });

    sse.addEventListener("run_complete", (e) => {
      const p = JSON.parse(e.data);
      liveBadge.className = p.lab_verdict === 'PASS' ? 'badge badge-success badge-outline' : 'badge badge-danger badge-outline';
      liveBadge.textContent = p.lab_verdict;

      const pList = (p.passed_cases && p.passed_cases.length > 0) ? p.passed_cases.map(c => `Case ${c}`).join(", ") : (passedCases.length > 0 ? passedCases.map(c => `Case ${c}`).join(", ") : "None");
      const fList = (p.failed_cases && p.failed_cases.length > 0) ? p.failed_cases.map(c => `Case ${c}`).join(", ") : (failedCases.length > 0 ? failedCases.map(c => `Case ${c}`).join(", ") : "None");

      const toolData = p.tool_grade || {};
      const toolVerdict = toolData.verdict || (toolStatusBadge ? toolStatusBadge.textContent : "N/A");
      const toolScore = toolData.score !== undefined ? `${toolData.score}/100` : (toolScoreBadge ? toolScoreBadge.textContent.replace('Score: ', '').trim() : "N/A");
      const toolPList = (toolData.passed_cases && toolData.passed_cases.length > 0) ? toolData.passed_cases.map(c => `Case ${c}`).join(", ") : (toolPassedCases.length > 0 ? toolPassedCases.map(c => `Case ${c}`).join(", ") : (toolVerdict === 'PASS' ? "All platform checks passed" : "None"));
      const toolFList = (toolData.failed_cases && toolData.failed_cases.length > 0) ? toolData.failed_cases.map(c => `Case ${c}`).join(", ") : (toolFailedCases.length > 0 ? toolFailedCases.map(c => `Case ${c}`).join(", ") : "None");

      logBox.innerHTML += `\n========================================\n` +
        `🏁 RUN COMPLETE: TEST CASES RESULTS DIVIDED\n` +
        `----------------------------------------\n` +
        `🛠️ 1. MANUAL BASH GRADE:\n` +
        `   • Verdict: ${p.lab_verdict} (Score: ${p.score_passed}/${p.score_total})\n` +
        `   • ✅ Passed Cases: ${pList}\n` +
        `   • ❌ Failed Cases: ${fList}\n` +
        `----------------------------------------\n` +
        `🚀 2. AUTOMATED PLATFORM GRADE (nusactl):\n` +
        `   • Verdict: ${toolVerdict} (Score: ${toolScore})\n` +
        `   • ✅ Passed Cases: ${toolPList}\n` +
        `   • ❌ Failed Cases: ${toolFList}\n` +
        `----------------------------------------\n` +
        `Overall Validation: ${p.validation}\n` +
        `========================================\n`;
      logBox.scrollTop = logBox.scrollHeight;

      if (overallPillEl) {
        overallPillEl.innerHTML = `<span class="badge ${p.lab_verdict === 'PASS' ? 'badge-success badge-outline' : 'badge-danger badge-outline'}" style="font-size: 12px; font-weight: 700;">Manual: ${p.lab_verdict} (${p.score_passed}/${p.score_total})</span>`;
      }
      sse.close();
    });
  } catch (e) {
    logBox.innerHTML += `Error: ${e.message}\n`;
    liveBadge.className = "badge badge-warning badge-outline";
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
        <div><strong>State:</strong> <span class="badge badge-outline">${run.state}</span></div>
        <div><strong>Verdict:</strong> <span class="badge ${run.lab_verdict === 'PASS' ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">${run.lab_verdict}</span></div>
        <div><strong>Score:</strong> ${run.score_passed} / ${run.score_total}</div>
        <div><strong>Validation:</strong> ${run.validation}</div>
      </div>

      <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Case Results (${(run.results || []).length})</h4>
      ${(run.results || []).map(r => `
        <div class="card p-5" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong>Case ${r.case_index}: ${escapeHtml(r.name)}</strong>
            <span class="badge ${r.verdict === 'PASS' ? 'badge-success badge-outline' : (r.verdict === 'ERROR' ? 'badge-warning badge-outline' : 'badge-danger badge-outline')}">${r.verdict}</span>
          </div>
          <div style="font-size: 12px; margin-bottom: 4px;">Expect: <code>${escapeHtml(r.expect)}</code> | Actual: <code>${escapeHtml(r.actual)}</code></div>
          <pre class="code-block" style="margin-top: 6px;">${escapeHtml(r.stdout || '(no stdout)')}</pre>
        </div>
      `).join('')}
    `;
    drawer.style.display = "flex";
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

      <table class="data-table table align-middle text-gray-700 font-medium text-sm">
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
  if (!cell) return `<span class="badge badge-outline">NOT RUN</span>`;
  if (cell.result === "ok") {
    return `<span class="badge badge-success badge-outline" title="${escapeHtml(cell.reason)}">✓ OK</span>`;
  } else {
    return `<span class="badge badge-danger badge-outline" title="${escapeHtml(cell.reason)}">⚠ VIOLATION</span>`;
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

    <div class="card p-5" style="border-left: 4px solid #4ade80; margin-bottom: 16px;">
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
        <span class="badge ${f.priority === 'critical' ? 'badge-danger badge-outline' : (f.priority === 'high' ? 'badge-warning badge-outline' : 'badge-outline')}">
          ${f.priority}
        </span>
        <span class="badge ${isConfirmed ? 'badge-success badge-outline' : 'badge-outline'}">
          ${isConfirmed ? 'Confirmed' : 'Unconfirmed'}
        </span>
      </div>
      <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${escapeHtml(f.title)}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Loc: ${escapeHtml(f.location)}</div>
      <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(f.evidence || '')}</div>
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px;">
        ${!isConfirmed ? `<button class="btn btn-light" style="font-size: 10px; padding: 2px 6px;" onclick="confirmFinding('${f.id}')">Confirm</button>` : ''}
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
        <button class="btn btn-light" onclick="exportAuditMarkdown()">Export Audit Document (Markdown)</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${audits.map(a => `
          <div class="card p-5">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div>
                <strong style="font-size: 15px;">Module Audit: ${a.ref} (${a.language.toUpperCase()})</strong>
                <span class="badge badge-info" style="margin-left: 8px;">${a.review_state}</span>
              </div>
              <span class="badge badge-success badge-outline">${a.status_key}</span>
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
  container.innerHTML = `<div class="text-xs text-gray-500">Loading Test VMs...</div>`;

  try {
    const res = await fetch(`${API_BASE}/targets`);
    const targets = await res.json();
    appState.targets = targets;

    container.innerHTML = `
      <div class="vms-layout-grid">
        <!-- Left: Add / Configure VM Form (Metronic Card) -->
        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">
              <i class="ki-filled ki-data text-primary me-1.5"></i> Add / Configure Testing VM
            </h3>
            <span class="badge badge-xs badge-primary badge-outline">SSH + nusactl</span>
          </div>

          <div class="card-body flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label class="form-label text-xs text-gray-600 uppercase">VM Name / Label:</label>
              <input type="text" id="vmNameInput" class="input input-sm" placeholder="e.g. Lab Testing VM (Ubuntu 24.04)">
            </div>

            <div class="grid gap-2.5" style="grid-template-columns: 2fr 1fr;">
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600 uppercase">IP Host / Hostname:</label>
                <input type="text" id="vmHostInput" class="input input-sm font-mono" placeholder="192.168.10.50 or 127.0.0.1">
              </div>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600 uppercase">Port:</label>
                <input type="number" id="vmPortInput" class="input input-sm font-mono" value="22">
              </div>
            </div>

            <div class="border-t border-t-gray-200 dark:border-t-coal-100 pt-3 flex flex-col gap-2.5">
              <span class="text-xs font-semibold text-primary uppercase">1. SSH Credentials</span>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">SSH Username:</label>
                <input type="text" id="vmUserInput" class="input input-sm font-mono" placeholder="e.g. student or root">
              </div>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">SSH Password:</label>
                <div class="flex gap-1.5">
                  <input type="password" id="vmPassInput" class="input input-sm flex-1" placeholder="Enter SSH password">
                  <button type="button" class="btn btn-sm btn-icon btn-light" onclick="togglePassVisibility('vmPassInput')" title="Toggle password">👁</button>
                </div>
              </div>
            </div>

            <div class="border-t border-t-gray-200 dark:border-t-coal-100 pt-3 flex flex-col gap-2.5">
              <span class="text-xs font-semibold text-primary uppercase">2. nusactl Tool Credentials</span>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">nusactl Username (<code>$NUSA_USERNAME</code>):</label>
                <input type="text" id="vmNusaUserInput" class="input input-sm font-mono" placeholder="e.g. student or nusa">
              </div>
              <div class="flex flex-col gap-1">
                <label class="form-label text-xs text-gray-600">nusactl Password:</label>
                <div class="flex gap-1.5">
                  <input type="password" id="vmNusaPassInput" class="input input-sm flex-1" placeholder="Enter nusactl password">
                  <button type="button" class="btn btn-sm btn-icon btn-light" onclick="togglePassVisibility('vmNusaPassInput')" title="Toggle password">👁</button>
                </div>
              </div>
            </div>

            <div class="card p-3 bg-light-active">
              <label class="checkbox-group cursor-pointer">
                <input type="checkbox" id="vmModifiableInput" class="checkbox checkbox-sm" checked>
                <span class="checkbox-label font-semibold text-xs text-gray-900">Allow VM State Modification (start/finish/solutions)</span>
              </label>
              <div class="text-2xs text-gray-500 mt-1">If unchecked, target is treated as immutable and all state-changing commands require operator gates.</div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="form-label text-xs text-gray-600 uppercase">Notes / Description:</label>
              <input type="text" id="vmNotesInput" class="input input-sm" placeholder="e.g. Local runner testing VM">
            </div>

            <div id="connectionStatusBanner" style="display: none;"></div>
          </div>

          <div class="card-footer flex gap-2.5">
            <button class="btn btn-sm btn-light flex-1 justify-center" onclick="testInputVMConnection()">
              ⚡ Test Connection
            </button>
            <button class="btn btn-sm btn-primary flex-1 justify-center" onclick="saveTestVM()">
              Save VM Configuration
            </button>
          </div>
        </div>

        <!-- Right: List of Configured VMs -->
        <div class="flex flex-col gap-3.5">
          <div class="card card-compact">
            <div class="card-header">
              <h3 class="card-title text-sm font-semibold text-gray-900">
                Configured Testing Environments
              </h3>
              <span class="badge badge-sm badge-primary badge-outline">${targets.length} Targets</span>
            </div>
          </div>

          ${targets.length === 0 ? `
            <div class="card">
              <div class="card-body py-10 text-center text-gray-500">
                No testing VMs configured yet. Use the form on the left to add your first VM.
              </div>
            </div>
          ` : `
            <div class="flex flex-col gap-3.5">
              ${targets.map(t => `
                <div class="card card-compact">
                  <div class="card-header">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-sm font-semibold text-gray-900">${escapeHtml(t.name)}</span>
                      <span class="text-xs text-gray-500 font-mono">
                        Host: ${escapeHtml(t.host)}:${t.port || 22} | SSH User: ${escapeHtml(t.user)}
                      </span>
                    </div>
                    <span class="badge badge-sm ${t.modifiable ? 'badge-success badge-outline' : 'badge-danger badge-outline'}">
                      ${t.modifiable ? 'MODIFIABLE' : 'IMMUTABLE'}
                    </span>
                  </div>

                  <div class="card-body">
                    <div class="grid grid-cols-2 gap-2.5 text-xs">
                      <div class="card p-2.5">
                        <span class="text-2xs text-gray-500 uppercase">SSH Password</span>
                        <span class="font-semibold ${t.has_password ? 'text-success' : 'text-gray-600'}">${t.has_password ? '✓ Configured' : '(None / Key only)'}</span>
                      </div>
                      <div class="card p-2.5">
                        <span class="text-2xs text-gray-500 uppercase">nusactl User</span>
                        <span class="font-mono font-semibold text-gray-900">${escapeHtml(t.nusactl_username || '(Not set)')}</span>
                      </div>
                      <div class="card p-2.5">
                        <span class="text-2xs text-gray-500 uppercase">nusactl Password</span>
                        <span class="font-semibold ${t.has_nusactl_password ? 'text-success' : 'text-gray-600'}">${t.has_nusactl_password ? '✓ Configured' : '(Not set)'}</span>
                      </div>
                      <div class="card p-2.5">
                        <span class="text-2xs text-gray-500 uppercase">Notes</span>
                        <span class="text-gray-700">${escapeHtml(t.notes || 'None')}</span>
                      </div>
                    </div>
                  </div>

                  <div class="card-footer flex justify-end gap-2">
                    <button class="btn btn-xs btn-light" onclick="testExistingVMConnection('${t.id}')">Test SSH Ping</button>
                    <button class="btn btn-xs btn-primary" onclick="setActiveTargetVM('${t.id}')">Set Active Target</button>
                    <button class="btn btn-xs btn-danger btn-outline" onclick="deleteTargetVM('${t.id}')">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="text-danger">Failed to load Test VMs: ${e.message}</div>`;
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
  banner.innerHTML = `<div class="card p-5" style="border-left: 3px solid #38bdf8;">Testing connection to ${user}@${host}:${port}...</div>`;

  try {
    const res = await fetch(`${API_BASE}/targets/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host, port, user, password: pass })
    });
    const data = await res.json();
    if (data.status === "ok") {
      banner.innerHTML = `<div class="card p-5" style="border-left: 3px solid #4ade80; color: #4ade80;">✓ ${escapeHtml(data.message)}</div>`;
    } else {
      banner.innerHTML = `<div class="card p-5" style="border-left: 3px solid #ef4444; color: #ef4444;">✕ ${escapeHtml(data.message)}</div>`;
    }
  } catch (e) {
    banner.innerHTML = `<div class="card p-5" style="border-left: 3px solid #ef4444; color: #ef4444;">Connection test failed: ${e.message}</div>`;
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

      <div class="card p-5" style="margin-bottom: 16px;">
        <h4 style="font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Impact Search (FR-AUD-05 / Sec 9.5)</h4>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="impactSearchInput" placeholder="Enter component or version (e.g. v1.28.2 or nginx)..." style="flex: 1;">
          <button class="btn btn-primary" onclick="executeImpactSearch()">Search Course Impact</button>
        </div>
        <div id="impactResultsBox" style="margin-top: 10px; display: none;"></div>
      </div>

      <table class="data-table table align-middle text-gray-700 font-medium text-sm">
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
              <td><span class="badge badge-outline">${r.source_code || 'none'}</span></td>
              <td>${escapeHtml(r.decision || '')}</td>
              <td>${r.check_date}</td>
              <td>
                <span class="badge ${r.status === 'verified' ? 'badge-success badge-outline' : 'badge-warning badge-outline'}">${r.status}</span>
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

      <table class="data-table table align-middle text-gray-700 font-medium text-sm">
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
    <div class="flex flex-col gap-5">
      <div class="card card-compact">
        <div class="card-header flex-wrap gap-2">
          <div class="flex flex-col gap-0.5">
            <h3 class="card-title text-base font-semibold text-gray-900">
              <i class="ki-filled ki-chart-line text-primary me-1.5"></i> Reports &amp; Exports (Section 7.17 / Sec 13)
            </h3>
            <span class="text-xs text-gray-600">Export Lab Reports, Course Audit Documents, JUnit XML for CI, and Patched Course Export.</span>
          </div>
          <div class="flex items-center gap-2">
            <label class="form-label text-xs text-gray-600" style="width: auto;">Select Lab:</label>
            <select id="reportLabSelect" class="select select-sm" style="min-width: 240px;">
              ${(appState.labs || []).map(l => `<option value="${l.id}">${escapeHtml(l.description)} (${l.chapter}.${l.part})</option>`).join('') || '<option value="">(No labs loaded)</option>'}
            </select>
          </div>
        </div>
      </div>

      <div class="grid-cards">
        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">Lab Test Report</h3>
            <span class="badge badge-xs badge-primary badge-outline">Markdown</span>
          </div>
          <div class="card-body text-xs text-gray-600">
            Summary, case results, 3-state validation matrix, cross-check status, findings, and redacted debug logs.
          </div>
          <div class="card-footer">
            <button class="btn btn-sm btn-primary w-full justify-center" onclick="exportLabReport()">
              Download Markdown Report
            </button>
          </div>
        </div>

        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">JUnit XML Export</h3>
            <span class="badge badge-xs badge-info badge-outline">CI / XML</span>
          </div>
          <div class="card-body text-xs text-gray-600">
            Standard JUnit XML test suite per lab and test case per grade check. ERROR mapped to error, FAIL to failure.
          </div>
          <div class="card-footer">
            <button class="btn btn-sm btn-light w-full justify-center" onclick="exportJUnitXml()">
              Download JUnit XML
            </button>
          </div>
        </div>

        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">Course Audit Document</h3>
            <span class="badge badge-xs badge-success badge-outline">Markdown</span>
          </div>
          <div class="card-body text-xs text-gray-600">
            Full course audit document following Course Baseline Section 6 structure in the active content language.
          </div>
          <div class="card-footer">
            <button class="btn btn-sm btn-primary w-full justify-center" onclick="exportAuditMarkdown()">
              Download Audit Markdown
            </button>
          </div>
        </div>

        <div class="card card-compact">
          <div class="card-header">
            <h3 class="card-title text-sm font-semibold text-gray-900">Patched Course Export</h3>
            <span class="badge badge-xs badge-warning badge-outline">JSON</span>
          </div>
          <div class="card-body text-xs text-gray-600">
            Applies approved grader revisions only and generates a deterministic patched course export JSON package.
          </div>
          <div class="card-footer">
            <button class="btn btn-sm btn-light w-full justify-center" onclick="exportPatchedCourseJson()">
              Download Patched Export
            </button>
          </div>
        </div>
      </div>

      <!-- Secondary Audit & Verification Workspaces -->
      <div class="card card-compact">
        <div class="card-header">
          <h3 class="card-title text-sm font-semibold text-gray-900">
            <i class="ki-filled ki-element-11 text-primary me-1.5"></i> Audit &amp; Verification Sub-Views
          </h3>
          <span class="badge badge-xs badge-outline">Secondary Modules</span>
        </div>
        <div class="card-body flex flex-wrap gap-2">
          <button class="btn btn-sm btn-light" onclick="switchView('overview')">Overview Metrics</button>
          <button class="btn btn-sm btn-light" onclick="switchView('validation')">3-State Validation Matrix</button>
          <button class="btn btn-sm btn-light" onclick="switchView('findings')">Findings &amp; Defects Board</button>
          <button class="btn btn-sm btn-light" onclick="switchView('audit')">Course Audit Workspace</button>
          <button class="btn btn-sm btn-light" onclick="switchView('manifest')">Version Manifest</button>
          <button class="btn btn-sm btn-light" onclick="switchView('settings')">Activity Log &amp; Settings</button>
        </div>
      </div>
    </div>
  `;
}

function exportLabReport() {
  const sel = document.getElementById("reportLabSelect");
  const labId = (sel && sel.value) ? sel.value : (appState.labs[0] && appState.labs[0].id);
  if (labId) {
    window.open(`${API_BASE}/reports/lab/${labId}?format=md`, "_blank");
  } else {
    showToast("No lab available to export.");
  }
}

function exportJUnitXml() {
  const sel = document.getElementById("reportLabSelect");
  const labId = (sel && sel.value) ? sel.value : (appState.labs[0] && appState.labs[0].id);
  if (labId) {
    window.open(`${API_BASE}/reports/lab/${labId}?format=junit`, "_blank");
  } else {
    showToast("No lab available to export.");
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

      <div class="card p-5" style="margin-bottom: 20px;">
        <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Targets & SSH Configuration</h4>
        <div style="font-size: 12px; color: var(--text-secondary);">
          Targets configured: ${appState.targets.map(t => `<strong>${t.name}</strong> (${t.host}) [${t.modifiable ? 'MODIFIABLE' : 'IMMUTABLE'}]`).join(', ')}
        </div>
      </div>

      <div class="card p-5">
        <h4 style="font-size: 13px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Activity Log (Immutable)</h4>
        <table class="data-table table align-middle text-gray-700 font-medium text-sm">
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
                <td><span class="badge badge-outline">${l.user_id}</span></td>
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
  ktShowModal("newLabModal");
}

function closeNewLabModal() {
  ktHideModal("newLabModal");
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
  ktShowModal("importModal");
}

function closeImportModal() {
  ktHideModal("importModal");
  selectedZipBase64 = null;
  selectedGradeJsonContent = null;
  const zipInput = document.getElementById("importZipFileInput");
  if (zipInput) zipInput.value = "";
  const gradeInput = document.getElementById("importGradeFileInput");
  if (gradeInput) gradeInput.value = "";
  const gradeText = document.getElementById("importGradeJsonText");
  if (gradeText) gradeText.value = "";
  const zipLabel = document.getElementById("zipSelectedLabel");
  if (zipLabel) zipLabel.textContent = "";
}

function handleZipFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = String(event.target.result || "");
    selectedZipBase64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : dataUrl;
    document.getElementById("zipSelectedLabel").textContent = `✓ Selected: ${file.name} (${Math.round(file.size / 1024)} KB) — Only Lab sections will be imported`;
  };
  reader.readAsDataURL(file);
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

async function applyImportedCourseState(data) {
  const importedSlug = data.course_slug || data.course;
  if (importedSlug) {
    appState.selectedCourse = importedSlug;
    localStorage.setItem("selectedCourse", importedSlug);
  }
  await refreshCourseDropdown();
  if (appState.selectedCourse) {
    try {
      const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(appState.selectedCourse)}/labs`);
      if (res.ok) {
        const labsData = await res.json();
        appState.labs = Array.isArray(labsData) ? labsData : [];
      }
    } catch (e) {
      console.error("Failed to refresh labs after import", e);
    }
  }
  renderActiveView(appState.activeView);
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
      body: JSON.stringify({ sample: sampleName })
    });
    const data = await res.json();
    if (res.ok && data.status === "success") {
      const labsCount = data.labs_imported !== undefined ? data.labs_imported : (data.total || 0);
      showToast(`Imported ${data.course_title}: ${labsCount} Labs loaded`);
      closeImportModal();
      await applyImportedCourseState(data);
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
      const labsCount = data.labs_imported !== undefined ? data.labs_imported : (data.total || 0);
      showToast(`Imported ${data.course_title || data.course}: ${labsCount} Labs loaded`);
      closeImportModal();
      await applyImportedCourseState(data);
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
      await applyImportedCourseState(data.details || { course_slug: data.sample });
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
  banner.innerHTML = `<div class="card p-5" style="border-left: 4px solid #8b5cf6;">AI Grading Test Agent is analyzing labs, modernizing checks, and generating log_cmd...</div>`;

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
      <div class="card p-5" style="border-left: 4px solid #8b5cf6; background: rgba(139, 92, 246, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #a78bfa; font-size: 14px;">✨ AI Grading Test Agent: Remediated ${data.total_cases_remediated} Checks</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Generated descriptive <code>log_cmd</code>, corrected typos (cho &rarr; echo), bounded timeouts, modernized commands (docker compose, ss, ip), and removed mutating verbs.
              <span class="badge badge-info" style="margin-left: 6px;">AI Proposed Revisions Created</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${!autoApply ? `<button class="btn btn-primary" onclick="triggerAiGraderRemediation(true)">Approve & Apply All AI Fixes</button>` : ''}
            <button class="btn btn-light" onclick="document.getElementById('aiActionBanner').style.display='none'">Dismiss</button>
          </div>
        </div>
        <div style="margin-top: 10px; max-height: 220px; overflow-y: auto;">
          ${(data.revisions || []).slice(0, 10).map(r => `
            <div style="font-size: 12px; margin-bottom: 6px; padding: 6px 10px; background-color: var(--bg-tertiary); border-radius: 4px;">
              <strong>${escapeHtml(r.case_name)}</strong> &rarr;
              <code>${Object.keys(r.diff).join(', ')} updated</code>
              <span class="badge badge-info" style="font-size: 10px; float: right;">${r.status}</span>
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
  banner.innerHTML = `<div class="card p-5" style="border-left: 4px solid #10b981;">AI Course Update Agent is analyzing syllabus, updating modules, and drafting new industry modules...</div>`;

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
      <div class="card p-5" style="border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.08);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: #34d399; font-size: 14px;">🚀 AI Course Update Agent: Added New Industry-Standard Module</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Added <strong>Module 6: ${escapeHtml(data.new_module_title)}</strong> with 2 Submodules and <strong>${escapeHtml(data.new_lab_added)}</strong> adhering to Section 5 plain-language rules.
              <span class="badge badge-info" style="margin-left: 6px;">AI Proposed Draft</span>
            </div>
          </div>
          <button class="btn btn-light" onclick="document.getElementById('aiActionBanner').style.display='none'">Dismiss</button>
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
