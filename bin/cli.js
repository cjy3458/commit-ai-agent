#!/usr/bin/env node
/**
 * commit-analyzer CLI 진입점
 * npx commit-analyzer 또는 npm install -g 후 commit-analyzer 명령으로 실행
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// 사용자 현재 디렉토리의 .env 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 패키지 루트 경로를 환경변수로 전달 (server.js가 public/ 위치를 찾기 위함)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COMMIT_ANALYZER_ROOT = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 3000;

console.log('');
console.log('  ⚡ Commit Analyzer');
console.log(`  🌐 http://localhost:${PORT}`);
console.log('  종료: Ctrl+C');
console.log('');

// 브라우저 자동 오픈 (1초 지연 - 서버 준비 대기)
setTimeout(async () => {
  const url = `http://localhost:${PORT}`;
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'start' :
               platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [url], { shell: true, stdio: 'ignore', detached: true });
}, 1200);

// 서버 시작
await import('../src/server.js');
