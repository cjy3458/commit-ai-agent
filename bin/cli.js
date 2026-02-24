#!/usr/bin/env node
/**
 * commit-ai-agent CLI 진입점
 * npx commit-ai-agent 또는 npm install -g 후 commit-ai-agent 명령으로 실행
 *
 * 서브커맨드:
 *   (없음)           웹 UI 서버 실행
 *   hook install     현재 디렉토리에 git hook 설치
 *   hook remove      git hook 제거
 *   hook status      git hook 설치 상태 확인
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

// 사용자 현재 디렉토리의 .env 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 패키지 루트 경로를 환경변수로 전달 (server.js가 public/ 위치를 찾기 위함)
process.env.COMMIT_ANALYZER_ROOT = path.resolve(__dirname, "..");

const [, , subCmd, ...subArgs] = process.argv;

// ──────────────────────────────────────────────
//  hook 서브커맨드
// ──────────────────────────────────────────────
if (subCmd === "hook") {
  const action = subArgs[0]; // install | remove | status
  const { installHooks, removeHooks, getHookStatus } = await import(
    "../src/hooks/installer.js"
  );

  function resolveTargets() {
    return [process.cwd()];
  }

  if (action === "install") {
    const targets = await resolveTargets();
    console.log("");
    for (const target of targets) {
      try {
        const installed = await installHooks(target);
        console.log(
          `  ✅ 설치됨: ${path.basename(target)} (${installed.join(", ")})`
        );
      } catch (err) {
        console.error(`  ❌ 실패: ${path.basename(target)} — ${err.message}`);
      }
    }
    console.log("");
    console.log("  이제 커밋할 때마다 자동으로 분석됩니다.");
    console.log("  push 전에 secret 유출도 자동으로 검사됩니다.");
    console.log("");
    process.exit(0);
  }

  if (action === "remove") {
    const targets = await resolveTargets();
    console.log("");
    for (const target of targets) {
      try {
        const removed = await removeHooks(target);
        if (removed.length > 0) {
          console.log(
            `  ✅ 제거됨: ${path.basename(target)} (${removed.join(", ")})`
          );
        } else {
          console.log(`  ℹ️  훅 없음: ${path.basename(target)}`);
        }
      } catch (err) {
        console.error(`  ❌ 실패: ${path.basename(target)} — ${err.message}`);
      }
    }
    console.log("");
    process.exit(0);
  }

  if (action === "status") {
    const targets = await resolveTargets();
    console.log("");
    console.log("  훅 설치 상태:");
    console.log("  " + "─".repeat(50));
    for (const target of targets) {
      try {
        const status = await getHookStatus(target);
        const pc = status.postCommit.installed ? "✅" : "❌";
        const pp = status.prePush.installed ? "✅" : "❌";
        console.log(
          `  ${path.basename(target).padEnd(24)} post-commit: ${pc}  pre-push: ${pp}`
        );
      } catch (err) {
        console.error(`  ❌ 오류: ${path.basename(target)} — ${err.message}`);
      }
    }
    console.log("");
    process.exit(0);
  }

  // 알 수 없는 action
  console.log("");
  console.log("  사용법:");
  console.log("    commit-ai-agent hook install   # 현재 디렉토리에 훅 설치");
  console.log("    commit-ai-agent hook remove    # 훅 제거");
  console.log("    commit-ai-agent hook status    # 상태 확인");
  console.log("");
  process.exit(1);
}

// ──────────────────────────────────────────────
//  기본 동작: 웹 UI 서버 실행
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

console.log("");
console.log("  ⚡ Commit AI Agent 실행 중...");
console.log(`  🌐 http://localhost:${PORT}`);
console.log("  종료: Ctrl+C");
console.log("");

// 브라우저 자동 오픈 (1초 지연 - 서버 준비 대기)
setTimeout(async () => {
  const url = `http://localhost:${PORT}`;
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", url], { stdio: "ignore", detached: true });
  } else {
    const cmd = platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true });
  }
}, 1200);

// 서버 시작
await import("../src/server.js");
