import simpleGit from "simple-git";
import path from "path";
import fs from "fs";

/**
 * DEV_ROOT 하위의 git 프로젝트 목록을 반환합니다.
 */
export async function listGitProjects(devRoot) {
  const entries = fs.readdirSync(devRoot, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(devRoot, entry.name);
    const gitDir = path.join(fullPath, ".git");
    if (fs.existsSync(gitDir)) {
      projects.push({ name: entry.name, path: fullPath });
    }
  }

  return projects;
}

/**
 * 특정 프로젝트의 최신 커밋 정보와 diff를 가져옵니다.
 */
export async function getLatestCommit(projectPath) {
  const git = simpleGit(projectPath);

  // 최신 커밋 메타데이터
  const log = await git.log({ maxCount: 1 });
  if (!log.latest) {
    throw new Error("커밋 기록이 없습니다.");
  }

  const { hash, message, author_name, author_email, date } = log.latest;

  // 이전 커밋과의 diff (파일 목록)
  let diffStat = "";
  let diffContent = "";

  try {
    // 부모 커밋이 있는지 확인
    const parentCount = await git.raw(["rev-list", "--count", "HEAD"]);
    const count = parseInt(parentCount.trim(), 10);

    if (count > 1) {
      diffStat = await git.raw(["diff", "--stat", "HEAD~1", "HEAD"]);
      // diff 내용은 너무 클 수 있으므로 최대 300줄 제한
      const rawDiff = await git.raw(["diff", "HEAD~1", "HEAD"]);
      const lines = rawDiff.split("\n");
      diffContent = lines.slice(0, 300).join("\n");
      if (lines.length > 300) {
        diffContent += "\n... (이하 생략, 너무 긴 diff)";
      }
    } else {
      // 첫 번째 커밋인 경우
      diffStat = await git.raw(["show", "--stat", "HEAD"]);
      const rawShow = await git.raw(["show", "HEAD"]);
      const lines = rawShow.split("\n");
      diffContent = lines.slice(0, 300).join("\n");
    }
  } catch (e) {
    diffContent = "(diff를 가져올 수 없습니다)";
  }

  return {
    hash,
    shortHash: hash.slice(0, 7),
    message,
    author: author_name,
    email: author_email,
    date: new Date(date).toLocaleString("ko-KR"),
    diffStat,
    diffContent,
  };
}

/**
 * 현재 Working Directory의 변경사항 (git status + diff)을 가져옵니다.
 * staged + unstaged 변경사항 모두 포함합니다.
 */
export async function getWorkingStatus(projectPath) {
  const git = simpleGit(projectPath);

  // git status --short 로 파일 목록
  const statusSummary = await git.status();
  const { files, staged, modified, not_added, deleted, renamed } =
    statusSummary;

  if (files.length === 0) {
    return null; // 변경사항 없음
  }

  // 상태 텍스트 구성
  const statusLines = [];
  for (const f of files) {
    statusLines.push(`${f.index}${f.working_dir} ${f.path}`);
  }
  const statusText = statusLines.join("\n");

  // staged diff (git diff --cached)
  let stagedDiff = "";
  try {
    const raw = await git.raw(["diff", "--cached"]);
    const lines = raw.split("\n");
    stagedDiff = lines.slice(0, 200).join("\n");
    if (lines.length > 200) stagedDiff += "\n... (이하 생략)";
  } catch {}

  // unstaged diff (git diff)
  let unstagedDiff = "";
  try {
    const raw = await git.raw(["diff"]);
    const lines = raw.split("\n");
    unstagedDiff = lines.slice(0, 200).join("\n");
    if (lines.length > 200) unstagedDiff += "\n... (이하 생략)";
  } catch {}

  // untracked 파일 내용 (최대 3개)
  let untrackedContent = "";
  const untrackedFiles = files
    .filter((f) => f.index === "?" && f.working_dir === "?")
    .slice(0, 3);
  for (const f of untrackedFiles) {
    try {
      const fullPath = path.join(projectPath, f.path);
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n").slice(0, 80).join("\n");
      untrackedContent += `\n--- ${f.path} (신규 파일) ---\n${lines}\n`;
    } catch {}
  }

  const hasStagedChanges = staged.length > 0 || renamed.length > 0;
  const diffContent = [
    stagedDiff ? `# Staged Changes (git diff --cached)\n${stagedDiff}` : "",
    unstagedDiff ? `# Unstaged Changes (git diff)\n${unstagedDiff}` : "",
    untrackedContent ? `# New Files\n${untrackedContent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    statusText,
    stagedCount: staged.length + renamed.length,
    modifiedCount: modified.length,
    deletedCount: deleted.length,
    untrackedCount: not_added.length,
    totalFiles: files.length,
    hasStagedChanges,
    diffContent: diffContent || "(diff 내용 없음)",
    diffStat: statusText,
  };
}
