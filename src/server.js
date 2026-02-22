import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { listGitProjects, getLatestCommit, getWorkingStatus } from "./git.js";
import { analyzeCommit, analyzeWorkingStatus } from "./analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;
const DEV_ROOT = process.env.DEV_ROOT;

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
//  API: 설정 확인

// ──────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  const hasKey = !!(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== "your_gemini_api_key_here"
  );
  res.json({ hasKey, devRoot: DEV_ROOT });
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
    const projectPath = path.join(DEV_ROOT, req.params.name);
    const commit = await getLatestCommit(projectPath);
    res.json({ commit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  API: 현재 git status 조회
// ──────────────────────────────────────────────
app.get("/api/projects/:name/status", async (req, res) => {
  try {
    const projectPath = path.join(DEV_ROOT, req.params.name);
    const status = await getWorkingStatus(projectPath);
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  API: AI 분석 실행 (SSE 스트리밍)
// ──────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { projectName } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res
      .status(400)
      .json({ error: "GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다." });
  }

  if (!projectName) {
    return res.status(400).json({ error: "프로젝트명이 필요합니다." });
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
    const projectPath = path.join(DEV_ROOT, projectName);
    const commit = await getLatestCommit(projectPath);

    send({ type: "commit", commit });
    send({ type: "status", message: "AI 분석 중... (30초~1분 소요)" });

    const analysis = await analyzeCommit(commit, projectName, apiKey);

    // 리포트 저장
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const reportFilename = `${projectName}-${timestamp}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFilename);
    const fullReport = buildMarkdownReport(projectName, commit, analysis);
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

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res
      .status(400)
      .json({ error: "GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다." });
  }

  if (!projectName) {
    return res.status(400).json({ error: "프로젝트명이 필요합니다." });
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
    const projectPath = path.join(DEV_ROOT, projectName);
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

    const analysis = await analyzeWorkingStatus(
      workingStatus,
      projectName,
      apiKey,
    );

    // 리포트 저장
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const reportFilename = `${projectName}-status-${timestamp}.md`;
    const reportPath = path.join(REPORTS_DIR, reportFilename);
    const fullReport = buildStatusReport(projectName, workingStatus, analysis);
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
  console.log(`   분석 대상: ${DEV_ROOT}\n`);
});
