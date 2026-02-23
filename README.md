# ⚡ Commit AI Agent

AI가 git 커밋과 현재 변경사항을 한국어로 자동 분석해주는 개발자 도구입니다.

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
commit-analyzer/
├── bin/
│   └── cli.js          # CLI 진입점 (npx / npm install -g)
├── src/
│   ├── server.js       # Express 서버 · API 라우트 · SSE 스트리밍
│   ├── analyzer.js     # Gemini AI 분석 프롬프트 · 재시도 로직
│   └── git.js          # simple-git 래퍼 (커밋 조회, status diff)
├── public/             # 프론트엔드 정적 파일 (HTML · CSS · JS)
├── .env.example        # 환경변수 예시
└── package.json
```

| 파일              | 역할                                                  |
| ----------------- | ----------------------------------------------------- |
| `bin/cli.js`      | npx 실행 시 .env 로드, 브라우저 자동 오픈, 서버 시작  |
| `src/server.js`   | REST API + SSE 엔드포인트, 리포트 저장                |
| `src/analyzer.js` | Gemini API 호출, 모델 폴백(2.5→2.0→lite), 지수 백오프 |
| `src/git.js`      | 프로젝트 목록 탐색, 커밋 diff, working status diff    |

---

## 라이선스

[MIT](./LICENSE)
