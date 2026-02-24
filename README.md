# ⚡ Commit AI Agent

AI가 git 커밋과 현재 변경사항을 한국어로 자동 분석해주는 개발자 도구입니다.

---

## CLI AI와 무엇이 다른가요?

Claude Code나 Codex 같은 CLI AI가 있는데 왜 commit-ai-agent를 써야 할까요?

| 기능 | CLI AI (Claude Code / Codex) | commit-ai-agent |
| ---- | :--------------------------: | :-------------: |
| 커밋 분석 | 수동 명령어 입력 필요 | **자동** (git commit 직후 백그라운드 실행) |
| 분석 범위 | 현재 세션 단일 프로젝트 | **DEV_ROOT 하위 모든 프로젝트** 동시 관리 |
| 상시 실행 | 세션 종료 시 중단 | **데몬 서버** — 항상 켜져 있음 |
| Secret 탐지 | 없음 | **pre-push 훅** — push 전 자격증명 자동 차단 |
| 오프라인 큐 | 없음 | 서버 꺼진 동안 커밋 → 재시작 시 **자동 처리** |
| 분석 UI | 터미널 텍스트 | **브라우저 GUI** — 검색·필터·저장 |
| AI 비용 | 구독료 or API 종량제 | Google Gemini **무료 티어** 지원 |
| 개인화 | 없음 | 프로젝트별 리포트를 `reports/`에 **자동 저장** |

> commit-ai-agent의 핵심 가치: **"커밋하면 알아서 분석된다"** — 개발자는 코드에만 집중하세요.

---

## 요구 사항

- [Node.js](https://nodejs.org) 18 이상
- [Git](https://git-scm.com) 설치
- Google Gemini API 키 ([무료 발급](https://aistudio.google.com/apikey))

---

## 사용 방법

### 방법 A — npx (설치 없이 바로 실행)

- 프로젝트가 모여있는 디렉토리 or 프로젝트 루트에서 명령어 실행
- 해당 디렉토리에서 .env 파일 생성(.env.example 참고)

```bash
npx commit-ai-agent
```

### 방법 B — 전역 설치 후 명령어로 실행

- 전역으로 설치하면 어느 위치에서든 `commit-ai-agent` 명령어로 실행 가능
- 프로젝트가 모여있는 디렉토리 or 프로젝트 루트에서 명령어 실행
- 해당 디렉토리에서 .env 파일 생성(.env.example 참고)

```bash
npm install -g commit-ai-agent
commit-ai-agent
```

### 방법 C — 직접 클론

프로젝트가 모여있는 디렉토리에 클론한 후, 해당 디렉토리에서 명령어 실행

```bash
git clone https://github.com/cjy3458/commit-ai-agent.git
cd commit-ai-agent
npm install
npm start
```

npm start 대신 Windows 사용자는 `start.bat`파일을 더블클릭하여 바로 실행할 수 있습니다.

---

## 환경 설정

처음 실행 전, 실행할 디렉토리에 `.env` 파일을 만드세요.

```env
GEMINI_API_KEY=여기에_API_키_입력 => 필수값
PORT=원하는 PORT 입력 (예: 3000, 50324 등) => 선택 사항(미설정 시 기본값 50324)
DEV_ROOT=C:/Users/projects => 선택 사항(미설정 시 현재 실행 디렉토리를 자동 사용)
```

| 변수             | 설명                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey)에서 발급 (무료)  |
| `DEV_ROOT`       | (선택) 분석할 git 프로젝트 루트 폴더. 미설정 시 실행 디렉토리 자동 사용 |
| `PORT`           | (선택) 서버 포트 (기본값 50324)                                         |

> Windows 경로는 `\` 대신 `/` 또는 `\\` 사용: `C:/dev`, `D:/projects`

---

## 기능

| 모드                  | 설명                                                    |
| --------------------- | ------------------------------------------------------- |
| 📦 최근 커밋 분석     | 마지막 커밋의 의도·근거·코드 리뷰 자동 생성             |
| 🔍 현재 변경사항 분석 | staged/unstaged/untracked 분석 + 커밋 메시지 3가지 제안 |

- **브라우저 기반 GUI**: 웹 브라우저에서 직관적인 인터페이스로 분석 실행 가능
- 분석 결과는 실행 위치의 `reports/` 폴더에 Markdown으로 저장됩니다.

## 스크린샷

![브라우저 인터페이스](https://github.com/user-attachments/assets/51015aad-93bb-4611-8157-12ba570a84d3)

---

## 새 기능 사용법

### Git Hook 자동화 — 커밋 후 자동 분석

서버가 실행 중인 상태에서 git hook을 설치하면, `git commit` 직후 자동으로 분석이 시작됩니다.

#### 1. Hook 설치

```bash
# 현재 디렉토리(프로젝트)에 설치
commit-ai-agent hook install

# 특정 프로젝트에 설치
commit-ai-agent hook install --project /path/to/project

# DEV_ROOT 하위 모든 프로젝트에 일괄 설치
commit-ai-agent hook install --all
```

#### 2. Hook 상태 확인

```bash
commit-ai-agent hook status
```

```
프로젝트           post-commit  pre-push
─────────────────  ───────────  ────────
my-app             ✅ 설치됨    ✅ 설치됨
another-project    ❌ 미설치    ❌ 미설치
```

#### 3. Hook 제거

```bash
commit-ai-agent hook remove
```

#### 4. 동작 방식

```
git commit
   ↓
post-commit hook 실행
   ├── 서버가 켜져 있음 → 즉시 분석 시작 (브라우저 UI에서 확인)
   └── 서버가 꺼져 있음 → .commit-ai-queue/ 에 저장
                              ↓
                         서버 재시작 시 자동으로 처리
```

> Hook은 기존 `.git/hooks/post-commit`이 있어도 안전하게 추가됩니다 (기존 내용 유지).

---

### Secret 유출 탐지 — push 전 자동 차단

`pre-push` hook이 설치되어 있으면 `git push` 전에 변경 파일을 자동 스캔합니다.
실제 자격증명이 감지되면 push가 차단되고 위치와 유형을 알려줍니다.

#### 탐지 패턴

| 유형 | 심각도 |
| ---- | ------ |
| AWS Access Key (`AKIA...`) | Critical |
| Google API Key (`AIza...`) | Critical |
| GitHub Personal Token (`ghp_...`) | Critical |
| Slack Token (`xox...`) | Critical |
| Stripe Secret Key (`sk_live_...`) | Critical |
| JWT Token | High |
| Private Key PEM | Critical |
| 패스워드 직접 할당 | Medium |
| API Key 직접 할당 | Medium |

#### 차단 메시지 예시

```
╔══════════════════════════════════════════════════════╗
║  ⛔  commit-ai-agent: SECRET DETECTED                ║
╚══════════════════════════════════════════════════════╝

push가 차단됐습니다. 아래 항목을 확인하세요:

  1. 파일: src/config.js:12 [CRITICAL]
     유형: Google API Key
     값:   AIza****y8Xw
```

#### 오탐(false positive)인 경우 우회

```bash
SKIP_SECRET_SCAN=1 git push
```

> Gemini API 키가 설정되어 있으면 AI가 오탐 여부를 자동으로 검증하여 불필요한 차단을 줄입니다.

---

## 문제 해결

**429 오류 (할당량 초과)**
→ Gemini 무료 티어 한도 도달. 잠시 후 재시도하거나 [유료 플랜](https://ai.google.dev)으로 업그레이드하세요.

**프로젝트 목록이 안 뜸**
→ 기본값은 실행 디렉토리입니다. 필요 시 `DEV_ROOT`를 git 저장소가 모인 상위 폴더로 지정하세요.

**`[DEP0190] DeprecationWarning` 경고 (Node.js 22+)**
→ `shell: true` 옵션과 args 배열을 함께 전달할 때 Node.js 22 이상에서 발생하는 보안 경고입니다. v1.0.7 이상으로 업데이트하면 해결됩니다.

---

## 버그 제보 & 기능 제안

[GitHub Issues](https://github.com/cjy3458/commit-ai-agent/issues)를 통해 자유롭게 제보해 주세요.

**버그 제보 시 포함하면 좋은 정보:**

- OS / Node.js 버전
- 실행 방법 (npx / 전역 설치 / 직접 클론)
- 오류 메시지 전문 (터미널 출력)
- 재현 방법

**기능 제안 시:**

- 제안 배경 (어떤 문제를 해결하고 싶은지)
- 원하는 동작 방식

---

## 기여하기

PR은 언제나 환영합니다.

```bash
# 1. 저장소 포크 후 클론
git clone https://github.com/cjy3458/commit-ai-agent.git
cd commit-ai-agent

# 2. 의존성 설치
npm install

# 3. 환경 설정
cp .env.example .env
# .env에 GEMINI_API_KEY 입력 (DEV_ROOT는 필요할 때만 설정)

# 4. 개발 서버 실행 (파일 변경 시 자동 재시작)
npm run dev

# 5. 브랜치 생성 → 작업 → PR
git checkout -b feat/my-feature
```

---

## 프로젝트 구조

```
commit-ai-agent/
├── bin/
│   └── cli.js              # CLI 진입점 (npx / npm install -g)
├── src/
│   ├── server.js           # Express 서버 · API 라우트 · SSE 스트리밍
│   ├── analyzer.js         # Gemini AI 분석 프롬프트 · 재시도 로직
│   ├── git.js              # simple-git 래퍼 (커밋 조회, status diff)
│   └── hooks/
│       ├── installer.js    # git hook 설치·제거·상태 확인
│       ├── queue.js        # 오프라인 큐 저장·로드·삭제
│       ├── post-commit.js  # post-commit 훅 스크립트 (자동 분석 트리거)
│       └── pre-push.js     # pre-push 훅 스크립트 (Secret 탐지)
├── public/                 # 프론트엔드 정적 파일 (HTML · CSS · JS)
├── .env.example            # 환경변수 예시
└── package.json
```

| 파일                      | 역할                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `bin/cli.js`              | npx 실행, hook 서브커맨드 (install / remove / status)         |
| `src/server.js`           | REST API + SSE 엔드포인트, 리포트 저장, 큐 처리               |
| `src/analyzer.js`         | Gemini API 호출, 모델 폴백(2.5→2.0→lite), 지수 백오프         |
| `src/git.js`              | 프로젝트 목록 탐색, 커밋 diff, working status diff            |
| `src/hooks/installer.js`  | git hook 스크립트 설치·제거 (기존 hook 보존)                  |
| `src/hooks/queue.js`      | 서버 오프라인 시 큐 파일 저장, 서버 시작 시 자동 처리         |
| `src/hooks/post-commit.js`| 커밋 직후 서버 알림 or 큐 저장 (git을 절대 방해하지 않음)     |
| `src/hooks/pre-push.js`   | push 전 15가지 패턴으로 Secret 스캔, Gemini AI 오탐 필터링    |

---

## 라이선스

[MIT](./LICENSE)
