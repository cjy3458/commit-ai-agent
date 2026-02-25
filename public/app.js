/* global marked */

// ── State ──
let selectedProject = null;
let isAnalyzing = false;
let analyzeMode = "commit"; // 'commit' | 'status'
let isSingleProject = false;
let singleProjectName = "";

// ── Aria State Machine ──
function setAriaState(state, opts = {}) {
  const robotWrap = document.getElementById("aria-robot-wrap");
  const bubbleText = document.getElementById("aria-bubble-text");
  const typingDots = document.getElementById("aria-typing-dots");
  const chipDot = document.getElementById("aria-chip-dot");
  const chipText = document.getElementById("aria-chip-text");
  if (!robotWrap || !bubbleText) return;

  // Base state (strip -commit / -status suffix for robot/chip)
  const baseState = state.startsWith("ready") ? "ready" : state;

  // Robot animation class
  robotWrap.className = `aria-robot-wrap ${baseState}`;

  // Header chip
  const chipMap = {
    idle: { cls: "idle", label: "Hanni · 대기 중" },
    ready: { cls: "ready", label: "Hanni · 준비됨" },
    thinking: { cls: "thinking", label: "Hanni · 분석 중..." },
    done: { cls: "done", label: "Hanni · 완료" },
    error: { cls: "error", label: "Hanni · 오류" },
  };
  const cm = chipMap[baseState] || chipMap.idle;
  if (chipDot) chipDot.className = `aria-chip-dot ${cm.cls}`;
  if (chipText) chipText.textContent = cm.label;

  // Bubble messages
  const p = opts.project ? `<strong>${opts.project}</strong>` : "";
  const msgMap = {
    idle: "어떤 프로젝트의 커밋을 분석해드릴까요?",
    "ready-commit": `${p} 최근 커밋을 확인했어요. 분석을 시작할까요? 👀`,
    "ready-status":
      opts.n > 0
        ? `${p}에서 변경된 파일 <strong>${opts.n}개</strong>를 발견했어요. 리뷰해드릴까요?`
        : `${p}에 현재 변경사항이 없어요.`,
    thinking: "코드를 꼼꼼히 살펴보고 있어요",
    done: "분석 완료! 리포트를 확인해보세요. 😊",
    error: "앗, 문제가 발생했어요. 다시 시도해볼까요?",
  };
  const newMsg = msgMap[state] || msgMap.idle;

  // Fade transition
  bubbleText.style.opacity = "0";
  bubbleText.style.transform = "translateY(4px)";
  setTimeout(() => {
    bubbleText.innerHTML = newMsg;
    if (typingDots)
      typingDots.style.display = state === "thinking" ? "inline-flex" : "none";
    bubbleText.style.opacity = "1";
    bubbleText.style.transform = "translateY(0)";
  }, 180);
}

// ── Boot ──
document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  setupTabs();
  setupModeToggle();
  await checkConfig();

  if (isSingleProject) {
    await enterSingleProjectMode();
  } else {
    await loadProjects();
    setAriaState("idle");
  }

  // SSE: post-commit 자동 분석 이벤트 수신
  connectAutoAnalysisEvents();

  // wire static event listeners (elements guaranteed to exist now)
  document
    .getElementById("refresh-projects")
    .addEventListener("click", loadProjects);
  document
    .getElementById("analyze-btn")
    .addEventListener("click", onAnalyzeClick);
  document.getElementById("copy-btn").addEventListener("click", onCopy);
  document.getElementById("close-report-btn").addEventListener("click", () => {
    document.getElementById("report-viewer").style.display = "none";
  });
  document.getElementById("diff-toggle-btn").addEventListener("click", () => {
    togglePre("diff-content", "diff-toggle-btn");
  });
  document
    .getElementById("status-diff-toggle-btn")
    .addEventListener("click", () => {
      togglePre("status-diff-content", "status-diff-toggle-btn");
    });
  document
    .getElementById("refresh-hooks")
    .addEventListener("click", loadHookStatus);
}

// ── Config check ──
async function checkConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    if (!data.hasKey) {
      document.getElementById("api-key-warn").style.display = "flex";
    }
    if (data.isSingleProject) {
      isSingleProject = true;
      singleProjectName = data.singleProjectName || "project";
    }
  } catch {}
}

// ── Single Project Mode ──
async function enterSingleProjectMode() {
  // 프로젝트 선택 UI만 숨김 (모드 토글은 유지)
  const header = document.querySelector(".selector-card .card-header");
  const projectGrid = document.getElementById("project-grid");
  const selectedHint = document.getElementById("selected-hint");
  if (header) header.style.display = "none";
  if (projectGrid) projectGrid.style.display = "none";
  if (selectedHint) selectedHint.style.display = "none";

  // 현재 디렉토리를 프로젝트로 자동 선택
  selectedProject = "__self__";

  document.getElementById("analyze-btn").disabled = false;
  const btnText = document.getElementById("analyze-btn-text");
  if (btnText) btnText.textContent = "Hanni에게 분석 요청";

  // 현재 모드에 따라 미리 로드
  if (analyzeMode === "commit") {
    await fetchCommitPreview();
  } else {
    await fetchStatusPreview();
  }
}

// ── Projects ──
async function loadProjects() {
  const grid = document.getElementById("project-grid");
  grid.innerHTML =
    '<div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const res = await fetch("/api/projects");
    const { projects } = await res.json();
    renderProjects(projects);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--danger);font-size:14px">프로젝트 목록을 불러오지 못했습니다: ${err.message}</p>`;
  }
}

function renderProjects(projects) {
  const grid = document.getElementById("project-grid");
  if (!projects || projects.length === 0) {
    grid.innerHTML =
      '<p style="color:var(--text3);font-size:14px">git 프로젝트가 없습니다.</p>';
    return;
  }
  grid.innerHTML = projects
    .map(
      (p) => `
    <div class="project-item" data-name="${p.name}">
      <span class="proj-icon">${getProjectIcon(p.name)}</span>
      <span class="proj-name">${p.name}</span>
    </div>
  `,
    )
    .join("");
  grid.querySelectorAll(".project-item").forEach((el) => {
    el.addEventListener("click", () => selectProject(el));
  });
}

function getProjectIcon(name) {
  if (name.includes("next") || name.includes("react")) return "⚛️";
  if (name.includes("nest") || name.includes("api")) return "🐉";
  if (name.includes("hook")) return "🪝";
  if (name.includes("portfolio")) return "🎨";
  if (name.includes("todo")) return "✅";
  if (name.includes("doc")) return "📚";
  return "📁";
}

// ── Project Selection ──
async function selectProject(el) {
  document
    .querySelectorAll(".project-item")
    .forEach((e) => e.classList.remove("selected"));
  el.classList.add("selected");
  selectedProject = el.dataset.name;
  document.getElementById("selected-hint").textContent =
    `선택됨: ${selectedProject}`;
  document.getElementById("analyze-btn").disabled = false;
  document.getElementById("commit-card").style.display = "none";
  document.getElementById("status-card").style.display = "none";

  if (analyzeMode === "commit") {
    await fetchCommitPreview();
  } else {
    await fetchStatusPreview();
  }
}

async function fetchCommitPreview() {
  const displayName = isSingleProject ? singleProjectName : selectedProject;
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(selectedProject)}/commit`,
    );
    const { commit, error } = await res.json();
    if (error) throw new Error(error);
    renderCommitCard(commit);
    document.getElementById("commit-card").style.display = "block";
    setAriaState("ready-commit", { project: displayName });
  } catch (e) {
    console.warn("commit preview failed:", e.message);
    setAriaState("ready-commit", { project: displayName });
  }
}

async function fetchStatusPreview() {
  const displayName = isSingleProject ? singleProjectName : selectedProject;
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(selectedProject)}/status`,
    );
    const { status, error } = await res.json();
    if (error) throw new Error(error);
    if (status) {
      renderStatusCard(status);
      document.getElementById("status-card").style.display = "block";
      setAriaState("ready-status", {
        project: displayName,
        n: status.totalFiles,
      });
    } else {
      const hint = document.getElementById("selected-hint");
      if (hint) hint.textContent = `${displayName} — 변경사항 없음`;
      setAriaState("ready-status", { project: displayName, n: 0 });
    }
  } catch (e) {
    console.warn("status preview failed:", e.message);
    setAriaState("ready-status", { project: displayName, n: 0 });
  }
}

// ── Commit Card ──
function renderCommitCard(c) {
  document.getElementById("commit-meta").innerHTML = `
    <div class="meta-item"><div class="meta-label">해시</div><div class="meta-value hash">${c.shortHash}</div></div>
    <div class="meta-item"><div class="meta-label">메시지</div><div class="meta-value">${escHtml(c.message)}</div></div>
    <div class="meta-item"><div class="meta-label">작성자</div><div class="meta-value">${escHtml(c.author)}</div></div>
    <div class="meta-item"><div class="meta-label">날짜</div><div class="meta-value">${escHtml(c.date)}</div></div>
  `;
  const pre = document.getElementById("diff-content");
  pre.textContent = c.diffContent || "(diff 없음)";
  pre.style.display = "none";
  document.getElementById("diff-toggle-btn").textContent = "diff 보기 ▾";
}

// ── Status Card ──
function renderStatusCard(s) {
  const badges = [
    s.stagedCount
      ? `<span class="stat-chip staged">${s.stagedCount} staged</span>`
      : "",
    s.modifiedCount
      ? `<span class="stat-chip modified">${s.modifiedCount} modified</span>`
      : "",
    s.deletedCount
      ? `<span class="stat-chip deleted">${s.deletedCount} deleted</span>`
      : "",
    s.untrackedCount
      ? `<span class="stat-chip untracked">${s.untrackedCount} untracked</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  document.getElementById("status-meta").innerHTML = `
    <div class="meta-item" style="grid-column:1/-1">
      <div class="meta-label">변경된 파일 (총 ${s.totalFiles}개)</div>
      <div class="meta-value" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${badges || '<span style="color:var(--text3)">변경사항 없음</span>'}</div>
    </div>
  `;
  const pre = document.getElementById("status-diff-content");
  pre.textContent = s.diffContent || "(diff 없음)";
  pre.style.display = "none";
  document.getElementById("status-diff-toggle-btn").textContent = "diff 보기 ▾";
}

// ── Mode Toggle ──
function setupModeToggle() {
  document
    .getElementById("mode-commit")
    ?.addEventListener("click", () => switchMode("commit"));
  document
    .getElementById("mode-status")
    ?.addEventListener("click", () => switchMode("status"));
}

function switchMode(mode) {
  analyzeMode = mode;
  document
    .querySelectorAll(".mode-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`mode-${mode}`).classList.add("active");
  document.getElementById("commit-card").style.display = "none";
  document.getElementById("status-card").style.display = "none";
  document.getElementById("result-card").style.display = "none";

  const btnText = document.getElementById("analyze-btn-text");
  if (btnText)
    btnText.textContent =
      mode === "commit" ? "Hanni에게 분석 요청" : "Hanni에게 리뷰 요청";

  if (!selectedProject) return;
  if (mode === "commit") fetchCommitPreview();
  else fetchStatusPreview();
}

// ── Analyze button ──
function onAnalyzeClick() {
  if (analyzeMode === "commit") startAnalysis("/api/analyze");
  else startAnalysis("/api/analyze-status");
}

// ── Generic SSE Analysis ──
async function startAnalysis(endpoint) {
  if (isAnalyzing || !selectedProject) return;
  isAnalyzing = true;

  const resultCard = document.getElementById("result-card");
  const analysisBody = document.getElementById("analysis-body");
  const reportSaved = document.getElementById("report-saved");
  const analyzeBtn = document.getElementById("analyze-btn");
  const btnIcon = analyzeBtn.querySelector(".btn-icon");

  resultCard.style.display = "block";
  analysisBody.innerHTML = "";
  reportSaved.textContent = "";
  document.getElementById("copy-btn").style.display = "none"; // 분석 시작 시 숨김
  setStatus("loading", "Hanni가 코드를 살펴보고 있어요...");
  setAriaState("thinking");
  analyzeBtn.disabled = true;
  btnIcon.textContent = "⏳";

  let fullText = "";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: selectedProject }),
    });

    // 400 에러 처리 (API 키 없음 등)
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: `HTTP ${res.status}` }));
      setStatus("error", `오류: ${err.error}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "status") {
            setStatus("loading", data.message);
          } else if (data.type === "commit") {
            renderCommitCard(data.commit);
            document.getElementById("commit-card").style.display = "block";
          } else if (data.type === "working-status") {
            renderStatusCard(data.workingStatus);
            document.getElementById("status-card").style.display = "block";
          } else if (data.type === "analysis") {
            fullText = data.analysis;
            analysisBody.innerHTML = marked.parse(data.analysis);
            if (data.reportFilename) {
              reportSaved.textContent = `✓ 저장됨: ${data.reportFilename}`;
            }
          } else if (data.type === "done") {
            setStatus("done", "✅ 분석 완료!");
            setAriaState("done");
            document.getElementById("copy-btn").style.display = "inline-flex"; // 완료 시에만 표시
          } else if (data.type === "error") {
            setStatus("error", `오류: ${data.message}`);
            setAriaState("error");
          }
        } catch {}
      }
    }
  } catch (err) {
    setStatus("error", `네트워크 오류: ${err.message}`);
    setAriaState("error");
  } finally {
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    btnIcon.textContent = "🤖";
    document.getElementById("copy-btn")._text = fullText;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── Status bar ──
function setStatus(type, msg) {
  const bar = document.getElementById("status-bar");
  const dot = bar.querySelector(".status-dot");
  const msgEl = document.getElementById("status-msg");
  msgEl.textContent = msg;
  dot.className = "status-dot " + type;
  bar.className = "status-bar " + (type === "loading" ? "" : type);
}

// ── Copy ──
function onCopy() {
  const btn = document.getElementById("copy-btn");
  const text = btn._text || document.getElementById("analysis-body").innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✓ 복사됨";
    setTimeout(() => {
      btn.textContent = "📋 복사";
    }, 2000);
  });
}

// ── Auto Analysis via SSE (+ polling fallback) ──
let autoAnalysisPollTimer = null;
let autoAnalysisShownFilename = null; // 이미 표시한 리포트 중복 방지

function connectAutoAnalysisEvents() {
  const evtSource = new EventSource("/api/events");

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      handleAutoAnalysisEvent(data);
    } catch {}
  };

  evtSource.onerror = () => {
    // EventSource 자동 재연결됨 — 별도 처리 불필요
  };
}

function handleAutoAnalysisEvent(data) {
  if (isAnalyzing) return; // 수동 분석 중엔 방해 안 함
  if (data.type === "analysis-started") {
    showAutoAnalysisStarted(data.projectName);
    startAutoAnalysisPoll(); // SSE가 끊겨도 완료를 폴링으로 감지
  } else if (data.type === "analysis-done") {
    stopAutoAnalysisPoll();
    if (data.filename !== autoAnalysisShownFilename) {
      autoAnalysisShownFilename = data.filename;
      showAutoAnalysisDone(data);
    }
  } else if (data.type === "analysis-error") {
    stopAutoAnalysisPoll();
    setStatus("error", `자동 분석 오류: ${data.message}`);
    setAriaState("error");
  }
}

// SSE가 analysis-done을 못 받았을 때를 대비한 2초 폴링
function startAutoAnalysisPoll() {
  stopAutoAnalysisPoll();
  autoAnalysisPollTimer = setInterval(async () => {
    if (isAnalyzing) return;
    try {
      const res = await fetch("/api/auto-analysis/state");
      const state = await res.json();
      if (state.status === "done" && state.filename !== autoAnalysisShownFilename) {
        autoAnalysisShownFilename = state.filename;
        stopAutoAnalysisPoll();
        showAutoAnalysisDone(state);
      }
    } catch {}
  }, 2000);
}

function stopAutoAnalysisPoll() {
  if (autoAnalysisPollTimer) {
    clearInterval(autoAnalysisPollTimer);
    autoAnalysisPollTimer = null;
  }
}

function showAutoAnalysisStarted(projectName) {
  const resultCard = document.getElementById("result-card");
  const analysisBody = document.getElementById("analysis-body");
  const reportSaved = document.getElementById("report-saved");
  resultCard.style.display = "block";
  analysisBody.innerHTML = "";
  reportSaved.textContent = "";
  document.getElementById("copy-btn").style.display = "none";
  setStatus("loading", `${projectName} 커밋 자동 분석 중...`);
  setAriaState("thinking");
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAutoAnalysisDone({ filename, content }) {
  const analysisBody = document.getElementById("analysis-body");
  const reportSaved = document.getElementById("report-saved");
  const copyBtn = document.getElementById("copy-btn");
  analysisBody.innerHTML = marked.parse(content);
  reportSaved.textContent = `✓ 저장됨: ${filename}`;
  setStatus("done", "✅ 자동 분석 완료!");
  setAriaState("done");
  copyBtn.style.display = "inline-flex";
  copyBtn._text = content;
}

// ── Reports Tab ──
async function loadReports() {
  const listEl = document.getElementById("reports-list");
  listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
  try {
    const res = await fetch("/api/reports");
    const { reports } = await res.json();
    if (!reports.length) {
      listEl.innerHTML =
        '<p class="empty-state">아직 저장된 리포트가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = reports
      .map((r) => {
        const parts = r.replace(".md", "").split("-");
        const date = parts.slice(-2).join(" ");
        const proj = parts.slice(0, -2).join("-");
        return `<div class="report-item" data-file="${r}">
        <span class="report-item-name">📄 ${proj}</span>
        <span class="report-item-date">${date}</span>
      </div>`;
      })
      .join("");
    listEl.querySelectorAll(".report-item").forEach((el) => {
      el.addEventListener("click", () => openReport(el.dataset.file));
    });
  } catch {
    listEl.innerHTML =
      '<p class="empty-state">리포트를 불러오지 못했습니다.</p>';
  }
}

async function openReport(filename) {
  const viewer = document.getElementById("report-viewer");
  const body = document.getElementById("report-viewer-body");
  document.getElementById("report-viewer-title").textContent = filename.replace(
    ".md",
    "",
  );
  body.innerHTML = '<p style="color:var(--text2)">불러오는 중...</p>';
  viewer.style.display = "block";
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
    const { content } = await res.json();
    body.innerHTML = marked.parse(content);
  } catch {
    body.innerHTML =
      '<p style="color:var(--danger)">리포트를 불러오지 못했습니다.</p>';
  }
  viewer.scrollIntoView({ behavior: "smooth" });
}

// ── Tabs ──
function setupTabs() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document
        .querySelectorAll(".nav-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + tab).classList.add("active");
      if (tab === "reports") loadReports();
      if (tab === "hooks") loadHookStatus();
    });
  });
}

// ── Hooks Tab ──
async function loadHookStatus() {
  const listEl = document.getElementById("hook-projects-list");
  listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
  try {
    const res = await fetch("/api/hooks/status");
    const { projects } = await res.json();
    if (!projects || projects.length === 0) {
      listEl.innerHTML =
        '<p class="empty-state">git 프로젝트를 찾을 수 없습니다.</p>';
      return;
    }
    listEl.innerHTML = projects
      .map((p) => {
        const pcInstalled = p.postCommit?.installed;
        const ppInstalled = p.prePush?.installed;
        const allInstalled = pcInstalled && ppInstalled;
        const noneInstalled = !pcInstalled && !ppInstalled;
        const statusBadge = allInstalled
          ? '<span class="hook-badge installed">설치됨</span>'
          : noneInstalled
            ? '<span class="hook-badge not-installed">미설치</span>'
            : '<span class="hook-badge partial">일부 설치</span>';

        const displayName = p.displayName || p.name;
        return `<div class="hook-project-row" data-name="${escHtml(p.name)}">
          <div class="hook-project-info">
            <span class="hook-project-name">${escHtml(displayName)}</span>
            ${statusBadge}
            <span class="hook-detail">post-commit: ${pcInstalled ? "✅" : "❌"} &nbsp; pre-push: ${ppInstalled ? "✅" : "❌"}</span>
          </div>
          <div class="hook-project-actions">
            ${
              allInstalled
                ? `<button class="btn-ghost hook-remove-btn" data-name="${escHtml(p.name)}">제거</button>`
                : `<button class="btn-secondary hook-install-btn" data-name="${escHtml(p.name)}">설치</button>`
            }
          </div>
        </div>`;
      })
      .join("");

    listEl.querySelectorAll(".hook-install-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleHookAction("install", btn.dataset.name, btn));
    });
    listEl.querySelectorAll(".hook-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleHookAction("remove", btn.dataset.name, btn));
    });
  } catch {
    listEl.innerHTML =
      '<p class="empty-state" style="color:var(--danger)">훅 상태를 불러오지 못했습니다.</p>';
  }
}

async function handleHookAction(action, projectName, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = action === "install" ? "설치 중..." : "제거 중...";
  try {
    const res = await fetch(`/api/hooks/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "요청 실패");
    await loadHookStatus(); // 새로고침
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    alert(`오류: ${err.message}`);
  }
}

// ── Helpers ──
function togglePre(preId, btnId) {
  const pre = document.getElementById(preId);
  const btn = document.getElementById(btnId);
  const shown = pre.style.display !== "none";
  pre.style.display = shown ? "none" : "block";
  btn.textContent = shown ? "diff 보기 ▾" : "diff 닫기 ▴";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
