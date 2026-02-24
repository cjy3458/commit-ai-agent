import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 이 파일의 위치: src/hooks/installer.js → 패키지 루트는 2단계 상위
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

const HOOK_MARKER_START = '# === commit-ai-agent START ===';
const HOOK_MARKER_END = '# === commit-ai-agent END ===';

function getHooksDir(projectPath) {
  return path.join(projectPath, '.git', 'hooks');
}

/**
 * Git Bash / sh 호환 경로로 변환 (Windows 역슬래시 → 포워드슬래시)
 */
function toPosixPath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * .git/hooks/ 에 삽입될 셸 스크립트 블록을 생성합니다.
 */
function buildHookBlock(hookType) {
  const scriptPath = toPosixPath(
    path.resolve(PACKAGE_ROOT, 'src', 'hooks', `${hookType}.js`)
  );
  const nodeExec = toPosixPath(process.execPath);

  if (hookType === 'post-commit') {
    // 백그라운드(&) 실행 — 커밋을 블록하지 않음
    return [
      HOOK_MARKER_START,
      `"${nodeExec}" "${scriptPath}" "$(pwd)" &`,
      HOOK_MARKER_END,
      '',
    ].join('\n');
  }

  if (hookType === 'pre-push') {
    // 동기 실행 — exit code 로 push 차단 가능
    return [
      HOOK_MARKER_START,
      `"${nodeExec}" "${scriptPath}" "$(pwd)"`,
      `_cai_result=$?`,
      `if [ $_cai_result -ne 0 ]; then exit $_cai_result; fi`,
      HOOK_MARKER_END,
      '',
    ].join('\n');
  }

  throw new Error(`알 수 없는 hook 유형: ${hookType}`);
}

/**
 * 기존 훅 파일에서 commit-ai-agent 섹션만 제거합니다.
 */
function removeHookSection(content) {
  const startIdx = content.indexOf(HOOK_MARKER_START);
  const endIdx = content.indexOf(HOOK_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx).trimEnd();
  const after = content
    .slice(endIdx + HOOK_MARKER_END.length)
    .replace(/^\n+/, ''); // 마커 뒤 빈 줄 제거

  return before ? before + '\n\n' + after : after;
}

/**
 * 단일 훅 파일에 commit-ai-agent 블록을 설치합니다.
 * 기존 훅 내용은 보존됩니다.
 */
function installSingleHook(hooksDir, hookName) {
  const hookPath = path.join(hooksDir, hookName);
  const newBlock = buildHookBlock(hookName);

  let existing = '';
  if (fs.existsSync(hookPath)) {
    existing = fs.readFileSync(hookPath, 'utf-8');
    // 이미 설치된 경우 기존 블록 제거 후 재설치
    if (existing.includes(HOOK_MARKER_START)) {
      existing = removeHookSection(existing);
    }
  }

  const shebang = '#!/bin/sh';
  let final;

  if (!existing.trim()) {
    final = shebang + '\n' + newBlock;
  } else if (!existing.startsWith('#!')) {
    final = shebang + '\n' + existing.trimEnd() + '\n\n' + newBlock;
  } else {
    final = existing.trimEnd() + '\n\n' + newBlock;
  }

  fs.writeFileSync(hookPath, final, { mode: 0o755 });
}

/**
 * 프로젝트의 git hook을 설치합니다.
 * @param {string} projectPath - git 저장소 루트 경로
 * @param {{ postCommit?: boolean, prePush?: boolean }} options
 * @returns {string[]} 설치된 훅 이름 목록
 */
export async function installHooks(projectPath, options = {}) {
  const { postCommit = true, prePush = true } = options;
  const hooksDir = getHooksDir(projectPath);

  if (!fs.existsSync(hooksDir)) {
    throw new Error(`Git hooks 디렉토리를 찾을 수 없습니다: ${hooksDir}`);
  }

  const installed = [];

  if (postCommit) {
    installSingleHook(hooksDir, 'post-commit');
    installed.push('post-commit');
  }

  if (prePush) {
    installSingleHook(hooksDir, 'pre-push');
    installed.push('pre-push');
  }

  return installed;
}

/**
 * 프로젝트의 commit-ai-agent git hook을 제거합니다.
 * 기존 커스텀 훅 내용은 보존됩니다.
 * @param {string} projectPath
 * @returns {string[]} 제거된 훅 이름 목록
 */
export async function removeHooks(projectPath) {
  const hooksDir = getHooksDir(projectPath);
  const removed = [];

  for (const hookName of ['post-commit', 'pre-push']) {
    const hookPath = path.join(hooksDir, hookName);
    if (!fs.existsSync(hookPath)) continue;

    const content = fs.readFileSync(hookPath, 'utf-8');
    if (!content.includes(HOOK_MARKER_START)) continue;

    const newContent = removeHookSection(content);
    const trimmed = newContent.trim();

    if (!trimmed || trimmed === '#!/bin/sh') {
      fs.unlinkSync(hookPath);
    } else {
      fs.writeFileSync(hookPath, newContent, { mode: 0o755 });
    }

    removed.push(hookName);
  }

  return removed;
}

/**
 * 프로젝트의 훅 설치 상태를 반환합니다.
 * @param {string} projectPath
 * @returns {{ postCommit: { installed: boolean }, prePush: { installed: boolean } }}
 */
export async function getHookStatus(projectPath) {
  const hooksDir = getHooksDir(projectPath);

  const status = {
    postCommit: { installed: false },
    prePush: { installed: false },
  };

  for (const [hookName, key] of [
    ['post-commit', 'postCommit'],
    ['pre-push', 'prePush'],
  ]) {
    const hookPath = path.join(hooksDir, hookName);
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, 'utf-8');
      status[key] = { installed: content.includes(HOOK_MARKER_START) };
    }
  }

  return status;
}
