# ⚡ Commit Analyzer

AI가 git 커밋과 현재 변경사항을 한국어로 자동 분석해주는 개발자 도구입니다.

## 요구 사항

- [Node.js](https://nodejs.org) 18 이상
- [Git](https://git-scm.com) 설치
- Google Gemini API 키 ([무료 발급](https://aistudio.google.com/apikey))

---

## 사용 방법

### 방법 A — npx (설치 없이 바로 실행)

```bash
npx commit-analyzer
```

### 방법 B — 전역 설치 후 명령어로 실행

```bash
npm install -g commit-analyzer
commit-analyzer
```

### 방법 C — 직접 클론

```bash
git clone https://github.com/사용자명/commit-analyzer.git
cd commit-analyzer
npm install
npm start
```

---

## 환경 설정

처음 실행 전, 실행할 디렉토리에 `.env` 파일을 만드세요.

```env
GEMINI_API_KEY=여기에_API_키_입력
DEV_ROOT=C:/Users/이름/dev
PORT=3000
```

| 변수 | 설명 |
|------|------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey)에서 발급 (무료) |
| `DEV_ROOT` | 분석할 git 프로젝트들이 모여 있는 루트 폴더 |
| `PORT` | 서버 포트 (기본값 3000) |

> Windows 경로는 `\` 대신 `/` 또는 `\\` 사용: `C:/dev`, `D:/projects`

---

## 기능

| 모드 | 설명 |
|------|------|
| 📦 최근 커밋 분석 | 마지막 커밋의 의도·근거·코드 리뷰 자동 생성 |
| 🔍 현재 변경사항 분석 | staged/unstaged/untracked 분석 + 커밋 메시지 3가지 제안 |

- 분석 결과는 실행 위치의 `reports/` 폴더에 Markdown으로 저장됩니다.

---

## 문제 해결

**429 오류 (할당량 초과)**
→ Gemini 무료 티어 한도 도달. 잠시 후 재시도하거나 [유료 플랜](https://ai.google.dev)으로 업그레이드하세요.

**프로젝트 목록이 안 뜸**
→ `DEV_ROOT`가 git 저장소가 들어 있는 상위 폴더인지 확인하세요.

---

## 라이선스

[MIT](./LICENSE)
