/* global marked */

// ── State ──
let selectedProject = null;
let isAnalyzing = false;
let analyzeMode = 'commit'; // 'commit' | 'status'

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  setupTabs();
  setupModeToggle();
  await checkConfig();
  await loadProjects();

  // wire static event listeners (elements guaranteed to exist now)
  document.getElementById('refresh-projects').addEventListener('click', loadProjects);
  document.getElementById('analyze-btn').addEventListener('click', onAnalyzeClick);
  document.getElementById('copy-btn').addEventListener('click', onCopy);
  document.getElementById('close-report-btn').addEventListener('click', () => {
    document.getElementById('report-viewer').style.display = 'none';
  });
  document.getElementById('diff-toggle-btn').addEventListener('click', () => {
    togglePre('diff-content', 'diff-toggle-btn');
  });
  document.getElementById('status-diff-toggle-btn').addEventListener('click', () => {
    togglePre('status-diff-content', 'status-diff-toggle-btn');
  });
}

// ── Config check ──
async function checkConfig() {
  try {
    const res = await fetch('/api/config');
    const { hasKey } = await res.json();
    if (!hasKey) {
      document.getElementById('api-key-warn').style.display = 'flex';
    }
  } catch {}
}

// ── Projects ──
async function loadProjects() {
  const grid = document.getElementById('project-grid');
  grid.innerHTML = '<div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    const res = await fetch('/api/projects');
    const { projects } = await res.json();
    renderProjects(projects);
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--danger);font-size:14px">프로젝트 목록을 불러오지 못했습니다: ${err.message}</p>`;
  }
}

function renderProjects(projects) {
  const grid = document.getElementById('project-grid');
  if (!projects || projects.length === 0) {
    grid.innerHTML = '<p style="color:var(--text3);font-size:14px">git 프로젝트가 없습니다.</p>';
    return;
  }
  grid.innerHTML = projects.map(p => `
    <div class="project-item" data-name="${p.name}">
      <span class="proj-icon">${getProjectIcon(p.name)}</span>
      <span class="proj-name">${p.name}</span>
    </div>
  `).join('');
  grid.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => selectProject(el));
  });
}

function getProjectIcon(name) {
  if (name.includes('next') || name.includes('react')) return '⚛️';
  if (name.includes('nest') || name.includes('api')) return '🐉';
  if (name.includes('hook')) return '🪝';
  if (name.includes('portfolio')) return '🎨';
  if (name.includes('todo')) return '✅';
  if (name.includes('doc')) return '📚';
  return '📁';
}

// ── Project Selection ──
async function selectProject(el) {
  document.querySelectorAll('.project-item').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedProject = el.dataset.name;
  document.getElementById('selected-hint').textContent = `선택됨: ${selectedProject}`;
  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('commit-card').style.display = 'none';
  document.getElementById('status-card').style.display = 'none';

  if (analyzeMode === 'commit') {
    await fetchCommitPreview();
  } else {
    await fetchStatusPreview();
  }
}

async function fetchCommitPreview() {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(selectedProject)}/commit`);
    const { commit, error } = await res.json();
    if (error) throw new Error(error);
    renderCommitCard(commit);
    document.getElementById('commit-card').style.display = 'block';
  } catch (e) {
    console.warn('commit preview failed:', e.message);
  }
}

async function fetchStatusPreview() {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(selectedProject)}/status`);
    const { status, error } = await res.json();
    if (error) throw new Error(error);
    if (status) {
      renderStatusCard(status);
      document.getElementById('status-card').style.display = 'block';
    } else {
      document.getElementById('selected-hint').textContent = `${selectedProject} — 변경사항 없음`;
    }
  } catch (e) {
    console.warn('status preview failed:', e.message);
  }
}

// ── Commit Card ──
function renderCommitCard(c) {
  document.getElementById('commit-meta').innerHTML = `
    <div class="meta-item"><div class="meta-label">해시</div><div class="meta-value hash">${c.shortHash}</div></div>
    <div class="meta-item"><div class="meta-label">메시지</div><div class="meta-value">${escHtml(c.message)}</div></div>
    <div class="meta-item"><div class="meta-label">작성자</div><div class="meta-value">${escHtml(c.author)}</div></div>
    <div class="meta-item"><div class="meta-label">날짜</div><div class="meta-value">${escHtml(c.date)}</div></div>
  `;
  const pre = document.getElementById('diff-content');
  pre.textContent = c.diffContent || '(diff 없음)';
  pre.style.display = 'none';
  document.getElementById('diff-toggle-btn').textContent = 'diff 보기 ▾';
}

// ── Status Card ──
function renderStatusCard(s) {
  const badges = [
    s.stagedCount    ? `<span class="stat-chip staged">${s.stagedCount} staged</span>` : '',
    s.modifiedCount  ? `<span class="stat-chip modified">${s.modifiedCount} modified</span>` : '',
    s.deletedCount   ? `<span class="stat-chip deleted">${s.deletedCount} deleted</span>` : '',
    s.untrackedCount ? `<span class="stat-chip untracked">${s.untrackedCount} untracked</span>` : '',
  ].filter(Boolean).join('');

  document.getElementById('status-meta').innerHTML = `
    <div class="meta-item" style="grid-column:1/-1">
      <div class="meta-label">변경된 파일 (총 ${s.totalFiles}개)</div>
      <div class="meta-value" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${badges || '<span style="color:var(--text3)">변경사항 없음</span>'}</div>
    </div>
  `;
  const pre = document.getElementById('status-diff-content');
  pre.textContent = s.diffContent || '(diff 없음)';
  pre.style.display = 'none';
  document.getElementById('status-diff-toggle-btn').textContent = 'diff 보기 ▾';
}

// ── Mode Toggle ──
function setupModeToggle() {
  document.getElementById('mode-commit')?.addEventListener('click', () => switchMode('commit'));
  document.getElementById('mode-status')?.addEventListener('click', () => switchMode('status'));
}

function switchMode(mode) {
  analyzeMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');
  document.getElementById('commit-card').style.display = 'none';
  document.getElementById('status-card').style.display = 'none';
  document.getElementById('result-card').style.display = 'none';

  if (!selectedProject) return;
  if (mode === 'commit') fetchCommitPreview();
  else fetchStatusPreview();
}

// ── Analyze button ──
function onAnalyzeClick() {
  if (analyzeMode === 'commit') startAnalysis('/api/analyze');
  else startAnalysis('/api/analyze-status');
}

// ── Generic SSE Analysis ──
async function startAnalysis(endpoint) {
  if (isAnalyzing || !selectedProject) return;
  isAnalyzing = true;

  const resultCard = document.getElementById('result-card');
  const analysisBody = document.getElementById('analysis-body');
  const reportSaved = document.getElementById('report-saved');
  const analyzeBtn = document.getElementById('analyze-btn');
  const btnIcon = analyzeBtn.querySelector('.btn-icon');

  resultCard.style.display = 'block';
  analysisBody.innerHTML = '';
  reportSaved.textContent = '';
  setStatus('loading', '분석 준비 중...');
  analyzeBtn.disabled = true;
  btnIcon.textContent = '⏳';

  let fullText = '';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: selectedProject }),
    });

    // 400 에러 처리 (API 키 없음 등)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setStatus('error', `오류: ${err.error}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'status') {
            setStatus('loading', data.message);
          } else if (data.type === 'commit') {
            renderCommitCard(data.commit);
            document.getElementById('commit-card').style.display = 'block';
          } else if (data.type === 'working-status') {
            renderStatusCard(data.workingStatus);
            document.getElementById('status-card').style.display = 'block';
          } else if (data.type === 'analysis') {
            fullText = data.analysis;
            analysisBody.innerHTML = marked.parse(data.analysis);
            if (data.reportFilename) {
              reportSaved.textContent = `✓ 저장됨: ${data.reportFilename}`;
            }
          } else if (data.type === 'done') {
            setStatus('done', '✅ 분석 완료!');
          } else if (data.type === 'error') {
            setStatus('error', `오류: ${data.message}`);
          }
        } catch {}
      }
    }
  } catch (err) {
    setStatus('error', `네트워크 오류: ${err.message}`);
  } finally {
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    btnIcon.textContent = '🔍';
    document.getElementById('copy-btn')._text = fullText;
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Status bar ──
function setStatus(type, msg) {
  const bar = document.getElementById('status-bar');
  const dot = bar.querySelector('.status-dot');
  const msgEl = document.getElementById('status-msg');
  msgEl.textContent = msg;
  dot.className = 'status-dot ' + type;
  bar.className = 'status-bar ' + (type === 'loading' ? '' : type);
}

// ── Copy ──
function onCopy() {
  const btn = document.getElementById('copy-btn');
  const text = btn._text || document.getElementById('analysis-body').innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ 복사됨';
    setTimeout(() => { btn.textContent = '📋 복사'; }, 2000);
  });
}

// ── Reports Tab ──
async function loadReports() {
  const listEl = document.getElementById('reports-list');
  listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';
  try {
    const res = await fetch('/api/reports');
    const { reports } = await res.json();
    if (!reports.length) {
      listEl.innerHTML = '<p class="empty-state">아직 저장된 리포트가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = reports.map(r => {
      const parts = r.replace('.md', '').split('-');
      const date = parts.slice(-2).join(' ');
      const proj = parts.slice(0, -2).join('-');
      return `<div class="report-item" data-file="${r}">
        <span class="report-item-name">📄 ${proj}</span>
        <span class="report-item-date">${date}</span>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.report-item').forEach(el => {
      el.addEventListener('click', () => openReport(el.dataset.file));
    });
  } catch {
    listEl.innerHTML = '<p class="empty-state">리포트를 불러오지 못했습니다.</p>';
  }
}

async function openReport(filename) {
  const viewer = document.getElementById('report-viewer');
  const body = document.getElementById('report-viewer-body');
  document.getElementById('report-viewer-title').textContent = filename.replace('.md', '');
  body.innerHTML = '<p style="color:var(--text2)">불러오는 중...</p>';
  viewer.style.display = 'block';
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
    const { content } = await res.json();
    body.innerHTML = marked.parse(content);
  } catch {
    body.innerHTML = '<p style="color:var(--danger)">리포트를 불러오지 못했습니다.</p>';
  }
  viewer.scrollIntoView({ behavior: 'smooth' });
}

// ── Tabs ──
function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'reports') loadReports();
    });
  });
}

// ── Helpers ──
function togglePre(preId, btnId) {
  const pre = document.getElementById(preId);
  const btn = document.getElementById(btnId);
  const shown = pre.style.display !== 'none';
  pre.style.display = shown ? 'none' : 'block';
  btn.textContent = shown ? 'diff 보기 ▾' : 'diff 닫기 ▴';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
