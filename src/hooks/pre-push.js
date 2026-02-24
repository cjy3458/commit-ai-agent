#!/usr/bin/env node
/**
 * pre-push 훅 스크립트 — Secret / 자격증명 유출 탐지
 * .git/hooks/pre-push 에서 실행됩니다.
 *
 * 사용: node pre-push.js <projectPath>
 * exit 0 → push 허용 / exit 1 → push 차단
 */
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 프로젝트 .env 로드 (GEMINI_API_KEY, PORT 등)
const projectPath = process.argv[2] || process.cwd();
try {
  const envPath = path.join(projectPath, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch {}

// SKIP_SECRET_SCAN=1 환경변수로 스캔 우회 가능
if (process.env.SKIP_SECRET_SCAN === '1') {
  process.stderr.write(
    '⚠️  commit-ai-agent: Secret 스캔 스킵 (SKIP_SECRET_SCAN=1)\n'
  );
  process.exit(0);
}

// ────────────────────────────────────────────────────────
//  탐지 패턴 목록
// ────────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { name: 'AWS Secret Key (40-char)', pattern: /(?<![A-Za-z0-9/+])([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/g, severity: 'high' },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'critical' },
  { name: 'GitHub Personal Token', pattern: /ghp_[A-Za-z0-9]{36}/g, severity: 'critical' },
  { name: 'GitHub OAuth Token', pattern: /gho_[A-Za-z0-9]{36}/g, severity: 'critical' },
  { name: 'GitHub Actions Token', pattern: /github_pat_[A-Za-z0-9_]{82}/g, severity: 'critical' },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,48}/g, severity: 'critical' },
  { name: 'Stripe Secret Key', pattern: /sk_(?:test|live)_[0-9a-zA-Z]{24}/g, severity: 'critical' },
  { name: 'Stripe Public Key', pattern: /pk_(?:test|live)_[0-9a-zA-Z]{24}/g, severity: 'high' },
  { name: 'Private Key PEM', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY/g, severity: 'critical' },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9\-_]{10,}\.eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_.+/]{20,}/g, severity: 'high' },
  { name: 'Password Assignment', pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?(?!(?:your_|example|placeholder|changeme|dummy|test|sample|xxx)[A-Za-z0-9])[A-Za-z0-9!@#$%^&*_\-]{8,}/gi, severity: 'medium' },
  { name: 'API Key Assignment', pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?(?!your_|example|placeholder)[A-Za-z0-9_\-]{16,}/gi, severity: 'medium' },
  { name: 'Generic Token Assignment', pattern: /(?:access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/gi, severity: 'medium' },
];

// 스캔 제외 파일/경로
const SKIP_FILENAMES = new Set([
  '.gitignore', '.env.example', '.env.sample', '.env.template', '.env.test',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'CHANGELOG.md', 'README.md', 'LICENSE',
]);
const SKIP_EXTENSIONS = new Set([
  '.min.js', '.map', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico',
  '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.gz',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out',
  'coverage', '__pycache__', '.venv', 'vendor',
]);

function shouldSkipFile(filePath) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath);

  if (SKIP_FILENAMES.has(basename)) return true;
  if (SKIP_EXTENSIONS.has(ext)) return true;

  const parts = filePath.split(/[/\\]/);
  for (const dir of SKIP_DIRS) {
    if (parts.includes(dir)) return true;
  }

  return false;
}

/**
 * 파일 내용에서 secret 패턴을 스캔합니다.
 */
function scanContent(content, filePath) {
  const findings = [];
  const isTestFile = /(?:test|spec|__test__|__mock__|fixture)/i.test(filePath);
  const lines = content.split('\n');

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    // 테스트 파일에서는 medium severity 스킵 (오탐 多)
    if (isTestFile && severity === 'medium') continue;

    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const upToMatch = content.slice(0, match.index);
      const lineNumber = upToMatch.split('\n').length;
      const lineContent = (lines[lineNumber - 1] || '').trim();

      // 주석 줄 스킵
      if (/^(?:\/\/|#|\*|<!--)/.test(lineContent)) continue;

      const val = match[0];
      const masked =
        val.length > 8
          ? val.slice(0, 4) + '****' + val.slice(-4)
          : '****';

      findings.push({
        name,
        severity,
        file: filePath,
        line: lineNumber,
        masked,
        lineContent: lineContent.slice(0, 120),
      });

      // 같은 줄에서 중복 탐지 방지
      if (findings.filter((f) => f.file === filePath && f.line === lineNumber).length > 2) break;
    }
  }

  return findings;
}

/**
 * push될 커밋 범위에서 변경된 파일 목록을 가져옵니다.
 */
function getChangedFiles(localSha, remoteSha) {
  try {
    const isNewBranch = remoteSha === '0000000000000000000000000000000000000000';
    const range = isNewBranch
      ? `4b825dc642cb6eb9a060e54bf8d69288fbee4904..${localSha}` // empty tree → HEAD
      : `${remoteSha}..${localSha}`;

    return execSync(`git diff --name-only ${range}`, {
      cwd: projectPath,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 특정 커밋 시점의 파일 내용을 가져옵니다.
 */
function getFileAtCommit(sha, filePath) {
  try {
    return execSync(`git show ${sha}:${filePath}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB 제한
    });
  } catch {
    return null;
  }
}

/**
 * Gemini AI로 regex 탐지 결과를 검증합니다 (오탐 필터링).
 */
async function verifyWithGemini(findings) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') return findings;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const prompt = `다음은 코드에서 regex로 발견된 잠재적 secret/credential 목록입니다.
각 항목이 실제 secret인지, 아니면 예시값/플레이스홀더/테스트값인지 판단하세요.

발견된 항목:
${findings.map((f, i) => `${i + 1}. [${f.name}] 파일: ${f.file}:${f.line}\n   코드: ${f.lineContent}`).join('\n')}

JSON 배열로만 응답하세요 (다른 텍스트 없이):
[{"index": 1, "isReal": true/false}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return findings;

    const verdicts = JSON.parse(jsonMatch[0]);
    return findings.filter((_, i) => {
      const v = verdicts.find((item) => item.index === i + 1);
      return !v || v.isReal !== false;
    });
  } catch {
    return findings; // AI 실패 시 보수적으로 전체 유지
  }
}

/**
 * 차단 경고 메시지를 stderr에 출력합니다.
 */
function printBlockWarning(findings) {
  const line = '═'.repeat(54);
  process.stderr.write(`\n╔${line}╗\n`);
  process.stderr.write(`║  ⛔  commit-ai-agent: SECRET DETECTED                ║\n`);
  process.stderr.write(`╚${line}╝\n\n`);
  process.stderr.write(`push가 차단됐습니다. 아래 항목을 확인하세요:\n\n`);

  findings.forEach((f, i) => {
    const badge = f.severity === 'critical' ? '[CRITICAL]' : `[${f.severity.toUpperCase()}]`;
    process.stderr.write(`  ${i + 1}. 파일: ${f.file}:${f.line} ${badge}\n`);
    process.stderr.write(`     유형: ${f.name}\n`);
    process.stderr.write(`     값:   ${f.masked}\n\n`);
  });

  process.stderr.write(`해결 방법:\n`);
  process.stderr.write(`  1. 해당 파일에서 secret 제거\n`);
  process.stderr.write(`  2. git commit --amend (마지막 커밋 수정)\n`);
  process.stderr.write(`  3. 또는 git rebase -i 로 이전 커밋 수정\n`);
  process.stderr.write(`  ※ API 키가 이미 공개됐다면 즉시 무효화하세요!\n\n`);
  process.stderr.write(`강제로 push하려면 (오탐인 경우):\n`);
  process.stderr.write(`  SKIP_SECRET_SCAN=1 git push\n\n`);
}

async function main() {
  // stdin에서 push 대상 ref 목록 읽기
  // 형식: <local-ref> SP <local-sha1> SP <remote-ref> SP <remote-sha1> LF
  const rl = readline.createInterface({ input: process.stdin });
  const refs = [];

  await new Promise((resolve) => {
    rl.on('line', (line) => {
      const parts = line.trim().split(' ');
      if (parts.length >= 4) {
        refs.push({
          localRef: parts[0],
          localSha: parts[1],
          remoteRef: parts[2],
          remoteSha: parts[3],
        });
      }
    });
    rl.on('close', resolve);
  });

  if (refs.length === 0) process.exit(0);

  const allFindings = [];

  for (const { localSha, remoteSha } of refs) {
    // 삭제 ref (push 없음)
    if (localSha === '0000000000000000000000000000000000000000') continue;

    const changedFiles = getChangedFiles(localSha, remoteSha);

    for (const filePath of changedFiles) {
      if (shouldSkipFile(filePath)) continue;

      const content = getFileAtCommit(localSha, filePath);
      if (!content) continue;

      const findings = scanContent(content, filePath);
      allFindings.push(...findings);
    }
  }

  if (allFindings.length === 0) process.exit(0);

  // AI 검증으로 오탐 필터링
  const verified = await verifyWithGemini(allFindings);

  if (verified.length === 0) process.exit(0);

  printBlockWarning(verified);
  process.exit(1); // push 차단
}

// 어떤 오류가 발생해도 push를 허용 (보안보다 개발 흐름 우선)
main().catch(() => process.exit(0));
