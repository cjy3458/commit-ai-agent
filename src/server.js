import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { listGitProjects, getLatestCommit, getWorkingStatus } from "./git.js";
import { analyzeCommit, analyzeWorkingStatus } from "./analyzer.js";
import { resolveDevRoot } from "./config.js";
import { installHooks, removeHooks, getHookStatus } from "./hooks/installer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 50324;
const { devRoot: DEV_ROOT, source: DEV_ROOT_SOURCE } = resolveDevRoot();
const BAD_REQUEST_PREFIX = "[BAD_REQUEST]";

// npx/global install 시: COMMIT_ANALYZER_ROOT = bin/cli.js가 설정한 패키지 루트
// 로컬 dev 시: __dirname/../ 사용
const PACKAGE_ROOT =
  process.env.COMMIT_ANALYZER_ROOT || path.join(__dirname, "..");

// reports는 항상 사용자 현재 디렉토리에 저장
const REPORTS_DIR = path.join(process.cwd(), "reports");

// 리포트 저장 디렉토리 생성
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(PACKAGE_ROOT, "public")));

function createBadRequestError(message) {
  return new Error(`${BAD_REQUEST_PREFIX} ${message}`);
}

function isBadRequestError(err) {
  return (
    typeof err?.message === "string" &&
    err.message.startsWith(BAD_REQUEST_PREFIX)
  );
}

function resolveProjectPath(projectName) {
  if (!projectName || typeof projectName !== "string") {
    throw createBadRequestError("프로젝트명이 필요합니다.");
  }

  const trimmedName = projectName.trim();
  if (!trimmedName) {
    throw createBadRequestError("프로젝트명이 비어 있습니다.");
  }

  // Single-project mode: "__self__" = DEV_ROOT 자체 (DEV_ROOT가 git 저장소인 경우)
  if (trimmedName === "__self__") {
    if (!fs.existsSync(path.join(DEV_ROOT, ".git"))) {
      throw createBadRequestError("현재 디렉토리가 Git 저장소가 아닙니다.");
    }
    return DEV_ROOT;
  }

  const projectPath = path.resolve(DEV_ROOT, trimmedName);
  const relativePath = path.relative(DEV_ROOT, projectPath);
  const isOutsideRoot =
    relativePath.startsWith("..") || path.isAbsolute(relativePath);

  if (isOutsideRoot) {
    throw createBadRequestError("유효하지 않은 프로젝트 경로입니다.");
  }

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw createBadRequestError("프로젝트를 찾을 수 없습니다.");
  }

  if (!fs.existsSync(path.join(projectPath, ".git"))) {
    throw createBadRequestError("Git 저장소가 아닌 프로젝트입니다.");
  }

  return projectPath;
}

// ──────────────────────────────────────────────
//  SSE: 자동 분석 이벤트 브로드캐스트
// ──────────────────────────────────────────────
const sseClients = new Set();

function broadcastEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// ──────────────────────────────────────────────
//  백그라운드 분석 작업 큐 (post-commit 훅용)
// ──────────────────────────────────────────────
const analysisQueue = [];
let isProcessingQueue = false;

async function processNextQueueItem() {
  if (isProcessingQueue || analysisQueue.length === 0) return;
  isProcessingQueue = true;

  const job = analysisQueue.shift();
  broadcastEvent({ type: "analysis-started", projectName: job.projectName });

  try {
    const { projectPath, projectName } = job;
    const commit = await getLatestCommit(projectPath);
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "your_gemini_api_key_here") {
      const analysis = await analyzeCommit(commit, projectName, apiKey);
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const reportFilename = `${projectName}-${timestamp}.md`;
      const fullReport = `# 커밋 분석 리포트 (자동): ${projectName}\n\n> 생성 시각: ${new Date().toLocaleString("ko-KR")}\n> post-commit 훅에 의해 자동 생성됨\n\n## 커밋 정보\n| 항목 | 내용 |\n|---|---|\n| 해시 | \`${commit.shortHash}\` |\n| 메시지 | ${commit.message} |\n| 작성자 | ${commit.author} |\n| 날짜 | ${commit.date} |\n\n---\n\n${analysis}\n`;
      fs.writeFileSync(path.join(REPORTS_DIR, reportFilename), fullReport, "utf-8");
      broadcastEvent({ type: "analysis-done", projectName, filename: reportFilename, content: fullReport });
      console.log(`[auto] 분석 완료: ${projectName} (${commit.shortHash})`);
    } else {
      broadcastEvent({ type: "analysis-error", message: "GEMINI_API_KEY가 설정되지 않았습니다." });
    }
  } catch (err) {
    broadcastEvent({ type: "analysis-error", message: err.message });
    console.error(`[auto] 분석 실패: ${err.message}`);
  } finally {
    isProcessingQueue = false;
    if (analysisQueue.length > 0) {
      setTimeout(processNextQueueItem, 1000);
    }
  }
}

// ──────────────────────────────────────────────
//  PWA 아이콘 (SVG를 PNG MIME으로 서빙)
// ──────────────────────────────────────────────
app.get("/api/icon/:size", (req, res) => {
  const svgPath = path.join(__dirname, "..", "public", "icon.svg");
  res.setHeader("Content-Type", "image/svg+xml");
  res.sendFile(svgPath);
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "icon.svg"));
});

// ──────────────────────────────────────────────
//  API: SSE — 자동 분석 이벤트 스트림
// ──────────────────────────────────────────────
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ──────────────────────────────────────────────
//  API: Health Check (훅 스크립트가 서버 실행 여부 확인용)
// ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// ──────────────────────────────────────────────
//  API: 훅 관리
// ──────────────────────────────────────────────

/** 훅 상태 조회 (현재 프로젝트만) */
app.get("/api/hooks/status", async (req, res) => {
  try {
    const isSelf = fs.existsSync(path.join(DEV_ROOT, ".git"));
    if (!isSelf) {
      return res.json({ projects: [] });
    }
    const status = await getHookStatus(DEV_ROOT);
    res.json({ projects: [{ name: "__self__", displayName: path.basename(DEV_ROOT), ...status }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 훅 설치 */
app.post("/api/hooks/install", async (req, res) => {
  const { projectName } = req.body;
  try {
    const projectPath = resolveProjectPath(projectName);
    const installed = await installHooks(projectPath);
    res.json({ success: true, installed });
  } catch (err) {
    if (isBadRequestError(err)) {
      return res.status(400).json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    res.status(500).json({ error: err.message });
  }
});

/** 훅 제거 */
app.post("/api/hooks/remove", async (req, res) => {
  const { projectName } = req.body;
  try {
    const projectPath = resolveProjectPath(projectName);
    const removed = await removeHooks(projectPath);
    res.json({ success: true, removed });
  } catch (err) {
    if (isBadRequestError(err)) {
      return res.status(400).json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    res.status(500).json({ error: err.message });
  }
});

/** post-commit 훅에서 호출: 백그라운드 분석 큐에 추가 */
app.post("/api/hooks/post-commit-notify", (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath || typeof projectPath !== "string") {
    return res.status(400).json({ error: "projectPath가 필요합니다." });
  }

  // DEV_ROOT 내부인지 검증
  const relative = path.relative(DEV_ROOT, path.resolve(projectPath));
  const isOutside = relative.startsWith("..") || path.isAbsolute(relative);

  // single-project 모드 (DEV_ROOT 자체가 git repo)
  const isSelf = path.resolve(projectPath) === path.resolve(DEV_ROOT);

  if (isOutside && !isSelf) {
    return res.status(400).json({ error: "유효하지 않은 projectPath입니다." });
  }

  const projectName = isSelf ? path.basename(DEV_ROOT) : path.basename(projectPath);
  analysisQueue.push({ projectPath: path.resolve(projectPath), projectName });

  // 즉시 응답 후 백그라운드에서 처리
  res.json({ queued: true, jobId: Date.now() });
  setTimeout(processNextQueueItem, 100);
});

// ──────────────────────────────────────────────
//  API: 설정 확인

// ──────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  const hasKey = !!(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== "your_gemini_api_key_here"
  );
  const isSingleProject =
    DEV_ROOT_SOURCE === "cwd" && fs.existsSync(path.join(DEV_ROOT, ".git"));
  res.json({
    hasKey,
    devRoot: DEV_ROOT,
    devRootSource: DEV_ROOT_SOURCE,
    isSingleProject,
    singleProjectName: isSingleProject ? path.basename(DEV_ROOT) : null,
  });
});

// ──────────────────────────────────────────────
//  API: 프로젝트 목록
// ──────────────────────────────────────────────
app.get("/api/projects", async (req, res) => {
  try {
    const projects = await listGitProjects(DEV_ROOT);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  API: 최근 커밋 정보 조회
// ──────────────────────────────────────────────
app.get("/api/projects/:name/commit", async (req, res) => {
  try {
    const projectPath = resolveProjectPath(req.params.name);
    const commit = await getLatestCommit(projectPath);
    res.json({ commit });
  } catch (err) {
    if (isBadRequestError(err)) {
      return res
        .status(400)
        .json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  API: 현재 git status 조회
// ──────────────────────────────────────────────
app.get("/api/projects/:name/status", async (req, res) => {
  try {
    const projectPath = resolveProjectPath(req.params.name);
    const status = await getWorkingStatus(projectPath);
    res.json({ status });
  } catch (err) {
    if (isBadRequestError(err)) {
      return res
        .status(400)
        .json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  API: AI 분석 실행 (SSE 스트리밍)
// ──────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { projectName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  let projectPath;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res
      .status(400)
      .json({ error: "GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다." });
  }

  try {
    projectPath = resolveProjectPath(projectName);
  } catch (err) {
    if (isBadRequestError(err)) {
      return res
        .status(400)
        .json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    return res.status(500).json({ error: err.message });
  }

  // Server-Sent Events 설정
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ type: "status", message: "커밋 정보를 가져오는 중..." });
    const commit = await getLatestCommit(projectPath);

    send({ type: "commit", commit });
    send({ type: "status", message: "AI 분석 중... (30초~1분 소요)" });

    const displayName =
      projectName === "__self__" ? path.basename(DEV_ROOT) : projectName;
    const analysis = await analyzeCommit(commit, displayName, apiKey);

    // 리포트 저장
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const reportFilename = `${displayName}-${timestamp}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFilename);
    const fullReport = buildMarkdownReport(displayName, commit, analysis);
    fs.writeFileSync(reportPath, fullReport, "utf-8");

    send({ type: "analysis", analysis, reportFilename });
    send({ type: "done" });
    res.end();
  } catch (err) {
    send({ type: "error", message: err.message });
    res.end();
  }
});

// ──────────────────────────────────────────────
//  API: git status 변경사항 AI 분석 (SSE 스트리밍)
// ──────────────────────────────────────────────
app.post("/api/analyze-status", async (req, res) => {
  const { projectName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  let projectPath;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res
      .status(400)
      .json({ error: "GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다." });
  }

  try {
    projectPath = resolveProjectPath(projectName);
  } catch (err) {
    if (isBadRequestError(err)) {
      return res
        .status(400)
        .json({ error: err.message.replace(`${BAD_REQUEST_PREFIX} `, "") });
    }
    return res.status(500).json({ error: err.message });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ type: "status", message: "변경사항을 가져오는 중..." });
    const workingStatus = await getWorkingStatus(projectPath);

    if (!workingStatus) {
      send({
        type: "error",
        message:
          "현재 변경사항이 없습니다. 코드를 수정한 뒤 다시 시도해 주세요.",
      });
      return res.end();
    }

    send({ type: "working-status", workingStatus });
    send({ type: "status", message: "AI 분석 중... (30초~1분 소요)" });

    const displayName =
      projectName === "__self__" ? path.basename(DEV_ROOT) : projectName;
    const analysis = await analyzeWorkingStatus(
      workingStatus,
      displayName,
      apiKey,
    );

    // 리포트 저장
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const reportFilename = `${displayName}-status-${timestamp}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFilename);
    const fullReport = buildStatusReport(displayName, workingStatus, analysis);
    fs.writeFileSync(reportPath, fullReport, "utf-8");

    send({ type: "analysis", analysis, reportFilename });
    send({ type: "done" });
    res.end();
  } catch (err) {
    send({ type: "error", message: err.message });
    res.end();
  }
});

// ──────────────────────────────────────────────
//  API: 저장된 리포트 목록
// ──────────────────────────────────────────────
app.get("/api/reports", (req, res) => {
  try {
    const files = fs
      .readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, 20); // 최근 20개
    res.json({ reports: files });
  } catch {
    res.json({ reports: [] });
  }
});

// ──────────────────────────────────────────────
//  API: 특정 리포트 읽기
// ──────────────────────────────────────────────
app.get("/api/reports/:filename", (req, res) => {
  try {
    const filePath = path.join(REPORTS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "리포트를 찾을 수 없습니다." });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildMarkdownReport(projectName, commit, analysis) {
  return `# 커밋 분석 리포트: ${projectName}

> 생성 시각: ${new Date().toLocaleString("ko-KR")}

## 커밋 정보
| 항목 | 내용 |
|---|---|
| 해시 | \`${commit.shortHash}\` |
| 메시지 | ${commit.message} |
| 작성자 | ${commit.author} |
| 날짜 | ${commit.date} |

---

${analysis}
`;
}

function buildStatusReport(projectName, status, analysis) {
  return `# 작업 중 변경사항 분석: ${projectName}

> 생성 시각: ${new Date().toLocaleString("ko-KR")}

## 변경사항 요약
| 항목 | 수량 |
|---|---|
| Staged | ${status.stagedCount}개 |
| Modified (unstaged) | ${status.modifiedCount}개 |
| Deleted | ${status.deletedCount}개 |
| Untracked (신규) | ${status.untrackedCount}개 |

\`\`\`
${status.statusText}
\`\`\`

---

${analysis}
`;
}

app.listen(PORT, () => {
  console.log(`\n🚀 Commit Ai Agent 실행 중`);
  console.log(`   브라우저: http://localhost:${PORT}`);
  console.log(`   분석 대상: ${DEV_ROOT}`);
  console.log(`   DEV_ROOT source: ${DEV_ROOT_SOURCE}\n`);

});
