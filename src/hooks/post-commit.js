#!/usr/bin/env node
/**
 * post-commit 훅 스크립트
 * .git/hooks/post-commit 에서 실행됩니다.
 *
 * 사용: node post-commit.js <projectPath>
 */
import http from 'http';
import { saveToQueue } from './queue.js';

const projectPath = process.argv[2] || process.cwd();
const PORT = process.env.PORT || 3000;

/**
 * 서버 실행 여부 확인 (500ms 타임아웃)
 */
function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(
      `http://localhost:${PORT}/api/health`,
      { timeout: 500 },
      (res) => resolve(res.statusCode === 200)
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * 서버에 post-commit 분석 요청 (비동기, 2초 타임아웃)
 */
function notifyServer(projectPath) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ projectPath });
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/hooks/post-commit-notify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 2000,
    };

    const req = http.request(options, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    const running = await checkServerRunning();
    if (running) {
      await notifyServer(projectPath);
    } else {
      // 서버가 꺼져 있으면 큐에 저장, 다음 서버 시작 시 처리
      saveToQueue(projectPath, 'post-commit');
    }
  } catch {
    // Git 커밋을 절대 방해하지 않음
  }
}

main();
